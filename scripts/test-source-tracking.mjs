/**
 * Phase 5 — 거래처/유입 추적 E2E:
 *  1) /partners 어드민 페이지 — DIRECT/스텔업/워크온 표시
 *  2) /r/stealup?campaign=summer&medium=banner → /apply 리다이렉트 + 쿠키
 *  3) /apply 폼 자체 가입 → 신청자 생성 + source 정보 첨부
 *  4) 어드민 /applicants → 새 신청자에 "스텔업 · summer" 라벨
 *  5) /dashboard → 거래처별 유입 통계 노출
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
mkdirSync(".captures", { recursive: true });

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// 잔여 정리
const db = new Database("./dev.db");
db.prepare(`DELETE FROM messages WHERE roomId IN (SELECT id FROM chat_rooms WHERE applicantId IN (SELECT id FROM applicants WHERE name LIKE 'TestSrc%'))`).run();
db.prepare(`DELETE FROM chat_rooms WHERE applicantId IN (SELECT id FROM applicants WHERE name LIKE 'TestSrc%')`).run();
db.prepare(`DELETE FROM applicants WHERE name LIKE 'TestSrc%'`).run();
db.close();

const b = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 1440, height: 900 },
  args: ["--no-sandbox"],
});

try {
  const p = await b.newPage();
  p.on("dialog", async (d) => await d.accept());
  p.on("pageerror", (e) => console.error("[pageerror]", e.message));

  // 1) 어드민 로그인
  await p.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
  await p.click("#email", { count: 3 });
  await p.type("#email", "user");
  await p.type("#password", "user1234");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }),
    p.click("button[type=submit]"),
  ]);
  console.log("✓ 매니저 로그인");

  // 2) /partners — DIRECT + 스텔업 + 워크온 노출
  await p.goto("http://localhost:3000/partners", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
  const partnerLabels = await p.evaluate(() => {
    const text = document.body.textContent ?? "";
    return {
      direct: text.includes("자체광고") && text.includes("DIRECT"),
      stealup: text.includes("스텔업"),
      workon: text.includes("워크온"),
    };
  });
  if (!partnerLabels.direct) fail("DIRECT 거래처 노출 안됨");
  if (!partnerLabels.stealup) fail("스텔업 노출 안됨");
  if (!partnerLabels.workon) fail("워크온 노출 안됨");
  console.log("✓ 거래처 목록 (DIRECT + 스텔업 + 워크온)");
  await p.screenshot({ path: ".captures/test-partners.png" });

  // 3) 새 incognito context로 /r/[code] → /apply 흐름 (어드민 쿠키 영향 차단)
  const ctx = await b.createBrowserContext();
  const cust = await ctx.newPage();
  cust.on("dialog", async (d) => await d.accept());
  cust.on("pageerror", (e) => console.error("[customer pageerror]", e.message));

  await cust.goto(
    "http://localhost:3000/r/stealup?campaign=summer&medium=banner",
    { waitUntil: "networkidle0" }
  );
  // 리다이렉트 후 URL
  const finalUrl = cust.url();
  if (!finalUrl.includes("/apply")) fail(`예상=/apply, 실제=${finalUrl}`);
  console.log(`✓ /r/stealup → ${finalUrl.replace(/.*\/apply/, "/apply")}`);

  const cookies = await cust.cookies();
  const sourceCookie = cookies.find((c) => c.name === "fics_source");
  if (!sourceCookie) fail("fics_source 쿠키 없음");
  const decoded = JSON.parse(decodeURIComponent(sourceCookie.value));
  if (decoded.partnerCode !== "stealup") fail("partnerCode 불일치");
  if (decoded.campaign !== "summer") fail("campaign 불일치");
  if (decoded.medium !== "banner") fail("medium 불일치");
  console.log(`✓ 쿠키 source = stealup/summer/banner`);

  // 4) /apply 폼 작성 + 제출
  await cust.waitForSelector("#name");
  await cust.type("#name", "TestSrc Nguyen", { delay: 30 });
  await cust.type("#phone", "010-9999-0000", { delay: 30 });

  // 동의 체크
  await cust.evaluate(() => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    if (checkboxes[0] && !checkboxes[0].checked) checkboxes[0].click();
  });
  await new Promise((r) => setTimeout(r, 200));

  // 제출 버튼
  await cust.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("상담 시작하기")
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // /c/[roomId]로 이동했는지 확인
  const afterSubmit = cust.url();
  if (!afterSubmit.includes("/c/"))
    fail(`예상=/c/[roomId], 실제=${afterSubmit}`);
  console.log("✓ 가입 완료 → 채팅 페이지 이동");

  await ctx.close();

  // 5) DB에서 source 정보 확인
  const db2 = new Database("./dev.db");
  const newApplicant = db2
    .prepare(
      `SELECT a.id, a.name, a.sourceCampaign, a.sourceMedium, p.code AS partnerCode, p.name AS partnerName
       FROM applicants a LEFT JOIN partners p ON a.sourcePartnerId = p.id
       WHERE a.name LIKE 'TestSrc%' ORDER BY a.appliedAt DESC LIMIT 1`
    )
    .get();
  db2.close();

  if (!newApplicant) fail("DB에 새 신청자 안 보임");
  if (newApplicant.partnerCode !== "stealup")
    fail(`source partnerCode=${newApplicant.partnerCode}, 기대=stealup`);
  if (newApplicant.sourceCampaign !== "summer")
    fail(`sourceCampaign=${newApplicant.sourceCampaign}`);
  if (newApplicant.sourceMedium !== "banner")
    fail(`sourceMedium=${newApplicant.sourceMedium}`);
  console.log(
    `✓ DB source: partner=${newApplicant.partnerName} campaign=${newApplicant.sourceCampaign} medium=${newApplicant.sourceMedium}`
  );

  // 6) 어드민 /applicants 목록에서 노출 확인
  await p.goto("http://localhost:3000/applicants", {
    waitUntil: "networkidle0",
  });
  await new Promise((r) => setTimeout(r, 600));
  const listShows = await p.evaluate(() => {
    const text = document.body.textContent ?? "";
    return text.includes("TestSrc") && text.includes("스텔업");
  });
  if (!listShows) fail("어드민 목록에 새 신청자 + 스텔업 라벨 안 보임");
  console.log("✓ 어드민 목록에 유입 라벨 표시");
  await p.screenshot({ path: ".captures/test-applicants-source.png" });

  // 7) 대시보드 거래처별 유입
  await p.goto("http://localhost:3000/dashboard", {
    waitUntil: "networkidle0",
  });
  await new Promise((r) => setTimeout(r, 400));
  const dashOk = await p.evaluate(() => {
    const text = document.body.textContent ?? "";
    return text.includes("거래처별 유입") && text.includes("캠페인 TOP");
  });
  if (!dashOk) fail("대시보드 유입 통계 위젯 누락");
  console.log("✓ 대시보드 유입 통계 위젯 노출");
  await p.screenshot({ path: ".captures/test-dashboard-source.png" });

  console.log("\n=== Phase 5 거래처/유입 추적 검증 통과 ===");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
} finally {
  await b.close();
}
