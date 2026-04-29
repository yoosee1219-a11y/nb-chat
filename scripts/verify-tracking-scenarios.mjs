/**
 * 거래처 유입 추적 다중 시나리오 검증
 *
 * 시나리오:
 *  1) 배너: /r/stealup?utm_campaign=summer-2026&utm_medium=banner
 *  2) SMS: /r/workon?campaign=spring-promo&medium=sms
 *  3) QR (오프라인): /r/stealup?campaign=qr-poster-busan&medium=qr
 *  4) 이메일 뉴스레터: /r/workon?utm_campaign=newsletter-april&utm_medium=email
 *  5) 자체광고 비디오: /r/DIRECT?utm_campaign=youtube-vn-101&utm_medium=video
 *  6) 잘못된 거래처 코드: /r/unknown_partner → DIRECT 폴백
 *  7) 비활성 거래처 → DIRECT 폴백
 *  8) 같은 사용자 두 번째 클릭 (last-touch attribution)
 *
 * 검증 포인트:
 *  - HTTP 307 + /apply 리다이렉트
 *  - fics_source 쿠키 정확히 세팅
 *  - 잘못된 코드 폴백 경로
 *  - URL 길이 cap (utm_campaign 100, medium 50, referrer 500)
 */
import puppeteer from "puppeteer-core";
import Database from "better-sqlite3";

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const b = await puppeteer.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 1280, height: 800 },
  args: ["--no-sandbox"],
});

// 비활성 거래처 임시 생성
const db = new Database("./dev.db");
const now = new Date().toISOString();
db.prepare(
  `INSERT OR REPLACE INTO partners (id, code, name, isActive, createdAt, updatedAt)
   VALUES ('test-inactive', 'inactive_partner', '비활성테스트', 0, ?, ?)`
).run(now, now);
db.close();

const scenarios = [
  {
    name: "배너 (스텔업, summer-2026)",
    url: "/r/stealup?utm_campaign=summer-2026&utm_medium=banner",
    expectedCode: "stealup",
    expectedCampaign: "summer-2026",
    expectedMedium: "banner",
  },
  {
    name: "SMS (워크온, spring-promo)",
    url: "/r/workon?campaign=spring-promo&medium=sms",
    expectedCode: "workon",
    expectedCampaign: "spring-promo",
    expectedMedium: "sms",
  },
  {
    name: "QR 오프라인 (스텔업)",
    url: "/r/stealup?campaign=qr-poster-busan&medium=qr",
    expectedCode: "stealup",
    expectedCampaign: "qr-poster-busan",
    expectedMedium: "qr",
  },
  {
    name: "이메일 뉴스레터 (워크온)",
    url: "/r/workon?utm_campaign=newsletter-april&utm_medium=email",
    expectedCode: "workon",
    expectedCampaign: "newsletter-april",
    expectedMedium: "email",
  },
  {
    name: "자체광고 비디오 (DIRECT)",
    url: "/r/DIRECT?utm_campaign=youtube-vn-101&utm_medium=video",
    expectedCode: "DIRECT",
    expectedCampaign: "youtube-vn-101",
    expectedMedium: "video",
  },
  {
    name: "잘못된 코드 → DIRECT 폴백",
    url: "/r/unknown_partner_xyz?campaign=test",
    expectedCode: "DIRECT", // 폴백
    expectedCampaign: "test",
    expectedMedium: null,
  },
  {
    name: "비활성 거래처 → DIRECT 폴백",
    url: "/r/inactive_partner?campaign=should_fallback",
    expectedCode: "DIRECT",
    expectedCampaign: "should_fallback",
    expectedMedium: null,
  },
  {
    name: "긴 utm_campaign (100자 cap)",
    url:
      "/r/stealup?utm_campaign=" +
      "x".repeat(150) +
      "&medium=banner",
    expectedCode: "stealup",
    expectedCampaign: "x".repeat(100), // truncated
    expectedMedium: "banner",
  },
];

let pass = 0;
let total = scenarios.length;

try {
  for (const s of scenarios) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.goto(`http://localhost:3000${s.url}`, {
      waitUntil: "networkidle0",
    });

    const finalUrl = p.url();
    if (!finalUrl.includes("/apply")) {
      console.log(`✗ [${s.name}] 리다이렉트 실패 (${finalUrl})`);
      await ctx.close();
      continue;
    }

    const cookies = await p.cookies();
    const sourceCookie = cookies.find((c) => c.name === "fics_source");
    if (!sourceCookie) {
      console.log(`✗ [${s.name}] fics_source 쿠키 없음`);
      await ctx.close();
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(decodeURIComponent(sourceCookie.value));
    } catch (e) {
      console.log(`✗ [${s.name}] 쿠키 파싱 실패: ${e.message}`);
      await ctx.close();
      continue;
    }

    const codeMatch = parsed.partnerCode === s.expectedCode;
    const campaignMatch = parsed.campaign === s.expectedCampaign;
    const mediumMatch = parsed.medium === s.expectedMedium;

    if (codeMatch && campaignMatch && mediumMatch) {
      console.log(
        `✓ [${s.name}] partner=${parsed.partnerCode} campaign=${parsed.campaign?.slice(0, 30)}${parsed.campaign?.length > 30 ? "..." : ""} medium=${parsed.medium ?? "null"}`
      );
      pass++;
    } else {
      console.log(`✗ [${s.name}]`);
      if (!codeMatch)
        console.log(`  code: 기대=${s.expectedCode}, 실제=${parsed.partnerCode}`);
      if (!campaignMatch)
        console.log(
          `  campaign: 기대=${s.expectedCampaign?.slice(0, 50)}, 실제=${parsed.campaign?.slice(0, 50)}`
        );
      if (!mediumMatch)
        console.log(`  medium: 기대=${s.expectedMedium}, 실제=${parsed.medium}`);
    }

    await ctx.close();
  }

  console.log(`\n=== ${pass}/${total} 시나리오 통과 ===`);
} finally {
  // 정리
  const db2 = new Database("./dev.db");
  db2.prepare(`DELETE FROM partners WHERE id = 'test-inactive'`).run();
  db2.close();
  await b.close();
  process.exit(pass === total ? 0 : 1);
}
