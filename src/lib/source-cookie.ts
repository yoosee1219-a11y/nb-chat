/**
 * 유입 추적 쿠키 — HMAC 서명/검증 (Phase 5.8)
 *
 * 보안 목적:
 *  - 클라이언트가 fics_source 쿠키에서 partnerCode를 다른 활성 거래처로 바꿔치기 X
 *  - 정산 안 하더라도 제휴사별 추적 데이터 신뢰성이 핵심
 *
 * 형식 (base64url 인코딩):
 *   payload-base64.signature-base64
 *
 *  - payload: JSON.stringify({ partnerId, partnerCode, campaign, medium, referrer, landedAt })
 *  - signature: HMAC-SHA256(payload, AUTH_SECRET) → base64url, 32 bytes
 *
 * 검증 실패 시 → null 반환 (호출 측이 DIRECT 폴백)
 */
import crypto from "node:crypto";

export type SourcePayload = {
  partnerId: string | null;
  partnerCode: string | null;
  campaign: string | null;
  medium: string | null;
  referrer: string | null;
  landedAt: string | null;
};

const SEPARATOR = ".";

function getSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      // 운영에서는 sign/verify 모두 실패 처리 — throw 대신 null 반환
      // (verifySourceCookie의 catch가 null로 폴백 → DIRECT 폴백 정상 동작)
      return null;
    }
    return "dev-only-not-secret";
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(
    (4 - (s.length % 4)) % 4
  );
  return Buffer.from(padded, "base64");
}

function hmac(payloadB64: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return b64url(
    crypto.createHmac("sha256", secret).update(payloadB64).digest()
  );
}

/**
 * payload를 서명하여 쿠키 값으로 인코딩.
 * AUTH_SECRET 없으면 (prod 사고 상태) — 서명 없는 JSON 폴백 (verify 측이 알아서 처리)
 */
export function signSourceCookie(payload: SourcePayload): string {
  const json = JSON.stringify(payload);
  const payloadB64 = b64url(json);
  const sig = hmac(payloadB64);
  if (!sig) {
    // 비정상 — 서명 없이 JSON 그대로 쿠키 set (verify는 레거시 호환 경로로 통과)
    return json;
  }
  return `${payloadB64}${SEPARATOR}${sig}`;
}

/**
 * 서명된 쿠키 값을 검증하고 payload 반환. 실패 시 null.
 *
 * timing-safe 비교로 타이밍 공격 방어.
 * 형식 어긋남, 만료, 변조 모두 null로 일관 처리.
 */
// 서명 형식: 양쪽이 base64url 문자(영숫자, '-', '_')로 구성 + 정확히 1개 SEPARATOR
// 레거시 JSON은 '{'로 시작하므로 명확히 구분.
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export function verifySourceCookie(raw: string | undefined): SourcePayload | null {
  if (!raw) return null;

  // 레거시 (서명 없는) JSON 쿠키 — '{'로 시작하면 무조건 JSON 시도
  // ISO date의 '.123Z' 때문에 SEPARATOR 카운트로 분기하면 안 됨
  if (raw.startsWith("{")) {
    try {
      const j = JSON.parse(raw);
      // 신뢰도 낮음 — partnerId/Code는 서버에서 재검증
      return {
        partnerId: typeof j.partnerId === "string" ? j.partnerId : null,
        partnerCode: typeof j.partnerCode === "string" ? j.partnerCode : null,
        campaign: typeof j.campaign === "string" ? j.campaign : null,
        medium: typeof j.medium === "string" ? j.medium : null,
        referrer: typeof j.referrer === "string" ? j.referrer : null,
        landedAt: typeof j.landedAt === "string" ? j.landedAt : null,
      };
    } catch {
      return null;
    }
  }

  // 서명 형식: payloadB64.sigB64 — 정확히 1개 dot, 양쪽 base64url
  const parts = raw.split(SEPARATOR);
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!B64URL_RE.test(payloadB64) || !B64URL_RE.test(sig)) return null;

  const expected = hmac(payloadB64);
  if (!expected) return null; // AUTH_SECRET 누락 — 검증 불가 → DIRECT 폴백
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const json = fromB64url(payloadB64).toString("utf-8");
    const j = JSON.parse(json);
    return {
      partnerId: typeof j.partnerId === "string" ? j.partnerId : null,
      partnerCode: typeof j.partnerCode === "string" ? j.partnerCode : null,
      campaign: typeof j.campaign === "string" ? j.campaign : null,
      medium: typeof j.medium === "string" ? j.medium : null,
      referrer: typeof j.referrer === "string" ? j.referrer : null,
      landedAt: typeof j.landedAt === "string" ? j.landedAt : null,
    };
  } catch {
    return null;
  }
}
