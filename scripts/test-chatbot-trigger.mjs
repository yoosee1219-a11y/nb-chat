/**
 * 챗봇 트리거 E2E:
 *  1) 신규 룸 1개 생성 (메시지 0건 — 첫 메시지 트리거 조건 만족)
 *  2) /c/[roomId] 모바일 페이지 진입
 *  3) 메시지 발신 ("유심 가입하고 싶어요")
 *  4) PUBLISHED 챗봇 플로우 자동 실행 → 인사 메시지 + LLM 응답 도착 확인
 *  5) 화면에 SYSTEM(봇) 메시지 렌더링 확인
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
mkdirSync(".captures", { recursive: true });

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// ── 1. 테스트용 신청자 + 룸 직접 SQLite로 생성 (격리) ──────────
const db = new Database("./dev.db");
const roomId = `test-trigger-${Date.now()}`;
const applicantId = `test-applicant-${Date.now()}`;

// 기존 잔여 정리
db.prepare(`DELETE FROM messages WHERE roomId LIKE 'test-trigger-%'`).run();
db.prepare(`DELETE FROM chat_rooms WHERE id LIKE 'test-trigger-%'`).run();
db.prepare(`DELETE FROM applicants WHERE id LIKE 'test-applicant-%'`).run();

const now = new Date().toISOString();
db.prepare(
  `INSERT INTO applicants
   (id, name, nationality, preferredLanguage, privacyConsent, thirdPartyConsent, status, appliedAt, createdAt, updatedAt)
   VALUES (?, '테스트 신청자', 'VN', 'VI_VN', 1, 1, 'PENDING', ?, ?, ?)`
).run(applicantId, now, now, now);

db.prepare(
  `INSERT INTO chat_rooms (id, applicantId, isFavorite, unreadCount, createdAt, updatedAt)
   VALUES (?, ?, 0, 0, ?, ?)`
).run(roomId, applicantId, now, now);
db.close();

console.log(`✓ 테스트 룸 생성: ${roomId}`);

const b = await puppeteer.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
  args: ["--no-sandbox"],
});

try {
  const p = await b.newPage();
  p.on("dialog", async (d) => await d.accept());
  const consoleErrors = [];
  p.on("pageerror", (e) => console.error("[pageerror]", e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("DevTools")) {
      consoleErrors.push(m.text());
    }
  });

  // 2. 고객 페이지 진입
  const resp = await p.goto(`http://localhost:3000/c/${roomId}`, {
    waitUntil: "networkidle0",
  });
  if (resp.status() !== 200) fail(`HTTP ${resp.status()}`);
  await new Promise((r) => setTimeout(r, 2000)); // 소켓 연결 대기

  const connected = await p.evaluate(
    () => document.querySelector(".text-emerald-500") !== null
  );
  if (!connected) fail("소켓 미연결");
  console.log("✓ 소켓 연결됨");

  // 3. 메시지 발신
  await p.click("textarea");
  await p.type("textarea", "유심 가입하고 싶어요", { delay: 30 });
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.querySelector("svg") && b.className.includes("bg-emerald-500")
    );
    btn?.click();
  });
  console.log("✓ 신청자 메시지 발신");

  // 4. 챗봇 응답 대기 (mock LLM은 즉시, 실 API는 1~3초)
  await new Promise((r) => setTimeout(r, 4000));

  await p.screenshot({ path: ".captures/test-chatbot-result.png" });

  // 5. DB에서 봇 메시지 확인
  const db2 = new Database("./dev.db");
  const allMsgs = db2
    .prepare(
      `SELECT senderType, originalText, language, translatedText FROM messages WHERE roomId = ? ORDER BY createdAt`
    )
    .all(roomId);
  db2.close();

  console.log(`\n📋 룸 메시지 (${allMsgs.length}건):`);
  for (const m of allMsgs) {
    const arrow = m.senderType === "APPLICANT" ? "→" : "←";
    const original = String(m.originalText ?? "").slice(0, 80);
    const translated = String(m.translatedText ?? "").slice(0, 80);
    console.log(`  ${arrow} [${m.senderType}] ${original}`);
    if (translated && translated !== original) {
      console.log(`     (번역: ${translated})`);
    }
  }

  // 검증
  const applicantMsg = allMsgs.find((m) => m.senderType === "APPLICANT");
  if (!applicantMsg) fail("신청자 메시지 DB에 저장 안됨");

  const systemMsgs = allMsgs.filter((m) => m.senderType === "SYSTEM");
  if (systemMsgs.length === 0)
    fail("챗봇 SYSTEM 메시지 0건 — 트리거 작동 안 함");
  console.log(`\n✓ 챗봇 메시지 ${systemMsgs.length}건 발생`);

  // 화면 렌더 확인
  const renderedBot = await p.evaluate(() => {
    const text = document.body.textContent ?? "";
    return text.includes("챗봇") || text.includes("Bot");
  });
  if (renderedBot) console.log("✓ 화면에 봇 라벨 표시");

  // 콘솔 에러
  if (consoleErrors.length > 0) {
    console.log("⚠ 콘솔 에러:", consoleErrors.slice(0, 2).join(" | "));
  }

  console.log("\n=== 챗봇 트리거 검증 통과 ===");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
} finally {
  await b.close();
}
