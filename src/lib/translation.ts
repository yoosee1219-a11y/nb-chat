/**
 * 번역 추상화 — Phase 3.4
 *
 * 어댑터:
 *  - MockTranslator: API 키 없을 때 (개발/테스트용 라벨링)
 *  - GoogleTranslator: GOOGLE_TRANSLATE_API_KEY 있으면 v2 REST 호출
 *
 * 추상화 이유:
 *  - 라이브러리/벤더 교체 비용 0
 *  - 테스트에서 deterministic mock 주입 가능
 *  - 캐시 레이어도 같은 인터페이스 안에서 wrap (Phase 3.4.1 예정)
 *
 * NOTE: `server-only`는 standalone socket 서버에서도 import 가능해야 하므로 사용 안 함.
 *       호출자가 서버 컨텍스트인지 책임진다.
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

let singleton: Translator | null = null;

export function getTranslator(): Translator {
  if (singleton) return singleton;
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (key) {
    singleton = new GoogleTranslator(key);
    console.log("[translation] using GoogleTranslator (v2 REST)");
  } else {
    singleton = new MockTranslator();
    console.log("[translation] using MockTranslator (set GOOGLE_TRANSLATE_API_KEY for real)");
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
