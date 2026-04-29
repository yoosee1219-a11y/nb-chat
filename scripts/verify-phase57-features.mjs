/**
 * Phase 5.7 신규 기능 검증
 *
 * 1. PartnerClick 로그 — /r/[code] 진입마다 row 생성
 * 2. first-touch 쿠키 — 첫 진입 시 set, 이후 진입에서 overwrite X
 * 3. 잘못된 코드도 originalCode에 저장 (poisoning 분석용)
 */
import puppeteer from "puppeteer-core";
import Database from "better-sqlite3";

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// HMAC 서명 형식 (payloadB64.sigB64) 또는 레거시 JSON 둘 다 지원
function parseSourceCookie(rawValue) {
  const raw = decodeURIComponent(rawValue);
  if (raw.includes(".")) {
    const payloadB64 = raw.slice(0, raw.lastIndexOf("."));
    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  }
  return JSON.parse(raw);
}

const db = new Database("./dev.db");
const beforeCount = db
  .prepare("SELECT COUNT(*) as c FROM partner_clicks")
  .get().c;
console.log(`초기 partner_clicks 행 수: ${beforeCount}`);

const b = await puppeteer.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 1280, height: 800 },
  args: ["--no-sandbox"],
});

let pass = 0;
let total = 0;

try {
  // 시나리오 1: 첫 진입 → click 1개, first/last 둘 다 set
  total++;
  {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.goto(
      "http://localhost:3000/r/stealup?utm_campaign=phase57-first&utm_medium=banner",
      { waitUntil: "networkidle0" }
    );

    const cookies = await p.cookies();
    const last = cookies.find((c) => c.name === "fics_source");
    const first = cookies.find((c) => c.name === "fics_source_first");
    if (!last) fail("[1] last 쿠키 없음");
    if (!first) fail("[1] first 쿠키 없음");

    const lastP = parseSourceCookie(last.value);
    const firstP = parseSourceCookie(first.value);
    if (lastP.partnerCode !== "stealup") fail(`[1] last partner mismatch: ${lastP.partnerCode}`);
    if (firstP.partnerCode !== "stealup") fail(`[1] first partner mismatch`);
    if (lastP.campaign !== "phase57-first") fail("[1] last campaign mismatch");

    // 같은 컨텍스트에서 다른 거래처 진입 → last만 갱신, first 유지
    await p.goto(
      "http://localhost:3000/r/workon?utm_campaign=phase57-second&utm_medium=sms",
      { waitUntil: "networkidle0" }
    );
    const cookies2 = await p.cookies();
    const last2 = cookies2.find((c) => c.name === "fics_source");
    const first2 = cookies2.find((c) => c.name === "fics_source_first");
    const last2P = parseSourceCookie(last2.value);
    const first2P = parseSourceCookie(first2.value);
    if (last2P.partnerCode !== "workon") fail(`[1] 2nd last 갱신 안됨: ${last2P.partnerCode}`);
    if (first2P.partnerCode !== "stealup")
      fail(`[1] first가 덮어써짐: ${first2P.partnerCode}`);

    console.log("✓ [1] first-touch 보존 + last-touch 갱신");
    pass++;
    await ctx.close();
  }

  // 시나리오 2: 잘못된 코드도 click 로그 남기기
  total++;
  {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.goto(
      "http://localhost:3000/r/totally_unknown_partner_xyz?campaign=test",
      { waitUntil: "networkidle0" }
    );
    const cookies = await p.cookies();
    const last = cookies.find((c) => c.name === "fics_source");
    if (!last) fail("[2] 잘못된 코드도 last 쿠키 없으면 안 됨");
    const lastP = parseSourceCookie(last.value);
    if (lastP.partnerCode !== "DIRECT") fail("[2] DIRECT 폴백 실패");
    console.log("✓ [2] 잘못된 코드 → DIRECT 폴백 + 쿠키 set");
    pass++;
    await ctx.close();
  }

  // 잠시 대기 (비동기 PartnerClick INSERT 완료 보장)
  await new Promise((r) => setTimeout(r, 1500));

  // 시나리오 3: PartnerClick 로그 행 수 검증
  total++;
  {
    const afterCount = db
      .prepare("SELECT COUNT(*) as c FROM partner_clicks")
      .get().c;
    const delta = afterCount - beforeCount;
    if (delta < 3) {
      console.log(
        `✗ [3] PartnerClick INSERT 부족 (delta=${delta}, 기대 ≥3)`
      );
    } else {
      console.log(
        `✓ [3] PartnerClick ${delta}개 INSERT (before=${beforeCount}, after=${afterCount})`
      );
      pass++;
    }
  }

  // 시나리오 4: PartnerClick 데이터 형식 검증
  total++;
  {
    const recent = db
      .prepare(
        `SELECT originalCode, partnerId, campaign, medium, ipHash, sessionId
         FROM partner_clicks
         ORDER BY createdAt DESC LIMIT 5`
      )
      .all();
    let hasDirectFallback = false;
    let hasIpHash = false;
    let hasSession = false;
    for (const row of recent) {
      if (row.originalCode === "totally_unknown_partner_xyz" && row.partnerId)
        hasDirectFallback = true;
      if (row.ipHash) hasIpHash = true;
      if (row.sessionId) hasSession = true;
    }
    if (!hasDirectFallback) {
      console.log("✗ [4] unknown_partner row not found or partnerId null");
    } else if (!hasSession) {
      console.log("✗ [4] sessionId 누락");
    } else {
      console.log(
        `✓ [4] click 메타 정상 — ipHash=${hasIpHash} session=${hasSession} fallback=${hasDirectFallback}`
      );
      pass++;
    }
  }

  console.log(`\n=== ${pass}/${total} Phase 5.7 시나리오 통과 ===`);
} finally {
  db.close();
  await b.close();
  process.exit(pass === total ? 0 : 1);
}
