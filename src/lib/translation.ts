/**
 * 번역 추상화 — Phase 3.4 + A1 (캐시)
 *
 * 어댑터:
 *  - MockTranslator: API 키 없을 때 (개발/테스트용 라벨링)
 *  - GoogleTranslator: GOOGLE_TRANSLATE_API_KEY 있으면 v2 REST 호출
 *  - CachingTranslator: DB 캐시 wrapper (translation_cache 테이블)
 *    → 같은 (text, source, target) 3-tuple은 1번만 외부 API 호출
 *    → MVP에서 30~50% 비용 절감 기대 (정형 안내 메시지 반복 사용)
 *
 * NOTE: `server-only`는 standalone socket 서버에서도 import 가능해야 하므로 사용 안 함.
 */

export type TranslateInput = {
  text: string;
  /** BCP-47 underscore variant (KO_KR, RU_RU, ...) */
  sourceLanguage: string;
  /** BCP-47 underscore variant */
  targetLanguage: string;
};

export type TranslateOutput = {
  translatedText: string;
  cached: boolean;
  /** 추후 비용 추적용 */
  charsBilled: number;
};

export interface Translator {
  translate(input: TranslateInput): Promise<TranslateOutput>;
}

// ─── BCP-47 매핑 (KO_KR → ko, ZH_CN → zh-CN) ──────────────────────
const BCP47: Record<string, string> = {
  KO_KR: "ko",
  VI_VN: "vi",
  NE_NP: "ne",
  ZH_CN: "zh-CN",
  ZH_TW: "zh-TW",
  PT_TL: "pt",
  LO_LA: "lo",
  RU_RU: "ru",
  MN_MN: "mn",
  MY_MM: "my",
  EN_US: "en",
  BN_BD: "bn",
};

function toBcp47(code: string): string {
  return BCP47[code] ?? code.toLowerCase().replace("_", "-");
}

// ─── Mock (dev/test 폴백) ─────────────────────────────────────────
class MockTranslator implements Translator {
  async translate({
    text,
    sourceLanguage,
    targetLanguage,
  }: TranslateInput): Promise<TranslateOutput> {
    if (sourceLanguage === targetLanguage) {
      return { translatedText: text, cached: false, charsBilled: 0 };
    }
    return {
      translatedText: `[mock→${toBcp47(targetLanguage)}] ${text}`,
      cached: false,
      charsBilled: 0,
    };
  }
}

// ─── Google Translate v2 REST (API 키 기반) ───────────────────────
// v3는 service account JSON이 필요 — 운영 부담 큼.
// v2는 API 키 1개로 끝 → MVP 적합. 이후 비용/관리 이슈 시 v3 또는 DeepL로 swap.
class GoogleTranslator implements Translator {
  constructor(private apiKey: string) {}

  async translate({
    text,
    sourceLanguage,
    targetLanguage,
  }: TranslateInput): Promise<TranslateOutput> {
    if (sourceLanguage === targetLanguage) {
      return { translatedText: text, cached: false, charsBilled: 0 };
    }
    const source = toBcp47(sourceLanguage);
    const target = toBcp47(targetLanguage);

    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: text, source, target, format: "text" }),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`google_translate_failed: ${res.status} ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data?: { translations?: { translatedText?: string }[] };
    };
    const translatedText = json.data?.translations?.[0]?.translatedText ?? text;
    return {
      translatedText,
      cached: false,
      charsBilled: [...text].length,
    };
  }
}

// ─── DB 캐시 래퍼 ──────────────────────────────────────────
// translation_cache 테이블에 (contentHash) 기준으로 저장.
// hits 증가 + lastUsedAt 갱신 → LRU evict 정책 추후 도입 가능.
import { createHash } from "node:crypto";

function contentHash(text: string, src: string, tgt: string): string {
  return createHash("sha256")
    .update(`${src}${tgt}${text}`)
    .digest("hex");
}

const CACHE_MAX_CHARS = 4000;

class CachingTranslator implements Translator {
  constructor(private inner: Translator) {}

  async translate(input: TranslateInput): Promise<TranslateOutput> {
    const { text, sourceLanguage, targetLanguage } = input;
    if (sourceLanguage === targetLanguage) {
      return { translatedText: text, cached: false, charsBilled: 0 };
    }

    // 너무 긴 텍스트는 read/write 모두 캐시 우회 (DB 비대화/조회 비용 차단)
    if (text.length > CACHE_MAX_CHARS) {
      return this.inner.translate(input);
    }

    // Prisma는 서버에서만 import (싸이클 방지로 동적 require)
    const { prisma } = await import("./prisma");
    const hash = contentHash(text, sourceLanguage, targetLanguage);

    // 1) 캐시 조회
    try {
      const cached = await prisma.translationCache.findUnique({
        where: { contentHash: hash },
        select: { id: true, translatedText: true },
      });
      if (cached) {
        // 비동기 hits++ (응답은 막지 않음)
        prisma.translationCache
          .update({
            where: { id: cached.id },
            data: { hits: { increment: 1 }, lastUsedAt: new Date() },
          })
          .catch((e) => console.error("[translation-cache] hits update failed", e));
        return {
          translatedText: cached.translatedText,
          cached: true,
          charsBilled: 0,
        };
      }
    } catch (e) {
      // 캐시 조회 실패해도 본 번역은 진행
      console.error("[translation-cache] read failed, falling through", e);
    }

    // 2) Miss → 실 번역
    const result = await this.inner.translate(input);

    // 3) 저장 (실패해도 응답은 정상)
    try {
      await prisma.translationCache.create({
        data: {
          contentHash: hash,
          sourceLanguage,
          targetLanguage,
          originalText: text,
          translatedText: result.translatedText.slice(0, CACHE_MAX_CHARS * 2),
        },
      });
    } catch (e) {
      // P2002 = Prisma unique constraint violation (병행 miss → 정상)
      const code =
        e && typeof e === "object" && "code" in e
          ? (e as { code?: string }).code
          : null;
      if (code !== "P2002") {
        console.error("[translation-cache] write failed", e);
      }
    }

    return result;
  }
}

let singleton: Translator | null = null;

export function getTranslator(): Translator {
  if (singleton) return singleton;
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  let base: Translator;
  if (key) {
    base = new GoogleTranslator(key);
    console.log("[translation] using GoogleTranslator (v2 REST) + cache");
  } else {
    base = new MockTranslator();
    console.log(
      "[translation] using MockTranslator + cache (set GOOGLE_TRANSLATE_API_KEY for real)"
    );
  }
  // 캐시 비활성화 옵션 (test/debug용)
  if (process.env.TRANSLATION_CACHE_DISABLED === "true") {
    singleton = base;
  } else {
    singleton = new CachingTranslator(base);
  }
  return singleton;
}

/** 테스트에서 강제 주입 */
export function setTranslator(t: Translator) {
  singleton = t;
}

/**
 * 신청자/매니저 메시지 양방향 번역 정책.
 *
 * @param senderLang  메시지 작성자 언어 (KO_KR for manager)
 * @param peerLang    상대방 언어 (신청자의 preferredLanguage)
 */
export async function translateForPeer(
  text: string,
  senderLang: string,
  peerLang: string
): Promise<{ translatedText: string }> {
  const t = getTranslator();
  const { translatedText } = await t.translate({
    text,
    sourceLanguage: senderLang,
    targetLanguage: peerLang,
  });
  return { translatedText };
}
