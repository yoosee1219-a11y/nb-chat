/**
 * source-cookie HMAC 단위 검증
 *  - 정상 서명 → payload 정상 디코딩
 *  - payload 변조 → null
 *  - 서명 변조 → null
 *  - 서명 없는 레거시 JSON → 1회 통과 (호환성)
 */
import "dotenv/config";

const { signSourceCookie, verifySourceCookie } = await import(
  "../src/lib/source-cookie.ts"
);

let pass = 0;
let total = 0;

const sample = {
  partnerId: "p-123",
  partnerCode: "stealup",
  campaign: "test",
  medium: "banner",
  referrer: null,
  landedAt: new Date().toISOString(),
};

// 1. 정상 round-trip
total++;
{
  const signed = signSourceCookie(sample);
  const got = verifySourceCookie(signed);
  if (got?.partnerCode === "stealup" && got.campaign === "test") {
    console.log("✓ [1] 정상 서명 → 검증 통과");
    pass++;
  } else {
    console.log("✗ [1] 정상 서명 검증 실패", got);
  }
}

// 2. payload 변조 → null
total++;
{
  const signed = signSourceCookie(sample);
  const [payloadB64, sig] = signed.split(".");
  const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payloadB64.length % 4)) % 4);
  const obj = JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  obj.partnerCode = "workon"; // 변조
  const tampered = Buffer.from(JSON.stringify(obj), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const got = verifySourceCookie(`${tampered}.${sig}`);
  if (got === null) {
    console.log("✓ [2] payload 변조 → null");
    pass++;
  } else {
    console.log("✗ [2] payload 변조 통과됨!", got);
  }
}

// 3. 서명 변조 → null
total++;
{
  const signed = signSourceCookie(sample);
  const [payloadB64] = signed.split(".");
  const got = verifySourceCookie(`${payloadB64}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
  if (got === null) {
    console.log("✓ [3] 서명 변조 → null");
    pass++;
  } else {
    console.log("✗ [3] 서명 변조 통과됨!", got);
  }
}

// 4. 레거시 JSON (서명 없음) → 호환 통과
total++;
{
  const legacy = JSON.stringify(sample);
  const got = verifySourceCookie(legacy);
  if (got?.partnerCode === "stealup") {
    console.log("✓ [4] 레거시 JSON → 호환 통과 (서버 재검증 필수)");
    pass++;
  } else {
    console.log("✗ [4] 레거시 JSON 호환 안 됨", got);
  }
}

// 5. 빈 입력 → null
total++;
{
  if (verifySourceCookie(undefined) === null && verifySourceCookie("") === null) {
    console.log("✓ [5] 빈 입력 → null");
    pass++;
  } else {
    console.log("✗ [5] 빈 입력 처리 실패");
  }
}

console.log(`\n=== ${pass}/${total} HMAC 단위 시나리오 통과 ===`);
process.exit(pass === total ? 0 : 1);
