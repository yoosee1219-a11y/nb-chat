/**
 * 번역 인터페이스 — Phase 3.2에서는 mock(원문 그대로 복사 + 라벨).
 * Phase 3.4에서 Google Cloud Translation v3로 교체.
 *
 * 추상화 이유:
 *  - 라이브러리/벤더 교체 비용 0
 *  - 테스트에서 deterministic mock 주입 가능
 *  - 캐시 레이어(Phase 3.4의 TranslationCache)도 같은 인터페이스 안에 wrap
 */

import "server-only";

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
  /** 추후 비용 추적용. mock은 0. */
  charsBilled: number;
};

export interface Translator {
  translate(input: TranslateInput): Promise<TranslateOutput>;
}

/** ──── Mock implementation (Phase 3.2) ──────────────────────────────
 * 동일 언어면 통과, 아니면 "[mock→ll-CC] 원문" 형태로 라벨링.
 * 실제 번역이 들어가는 자리를 시각적으로 명확히 보여주기 위함.
 */
class MockTranslator implements Translator {
  async translate({
    text,
    sourceLanguage,
    targetLanguage,
  }: TranslateInput): Promise<TranslateOutput> {
    if (sourceLanguage === targetLanguage) {
      return { translatedText: text, cached: false, charsBilled: 0 };
    }
    const tag = targetLanguage.toLowerCase().replace("_", "-");
    return {
      translatedText: `[mock→${tag}] ${text}`,
      cached: false,
      charsBilled: 0,
    };
  }
}

// ─── 추후 Google Cloud Translation v3 어댑터 자리 ─────────────────
// class GoogleTranslator implements Translator { ... }

let singleton: Translator | null = null;

export function getTranslator(): Translator {
  if (singleton) return singleton;

  // 환경변수로 어떤 구현을 쓸지 분기 (확장 포인트)
  // if (process.env.GOOGLE_PROJECT_ID) {
  //   singleton = new GoogleTranslator();
  // } else {
  singleton = new MockTranslator();
  // }
  return singleton;
}

/**
 * 신청자/매니저 메시지 양방향 번역 정책.
 *
 * @param senderLang  메시지 작성자 언어 (KO_KR for manager)
 * @param peerLang    상대방 언어 (신청자의 preferredLanguage)
 * @returns originalText 그대로 + translatedText (peer 언어로)
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
