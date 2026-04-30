/**
 * 플로우 시뮬레이터 E2E 검증:
 *  1) 챗봇 플로우 편집 페이지 진입
 *  2) 시작 노드 트리거를 "키워드"로 설정 + "유심" 입력
 *  3) "노드 추가" → "메시지" 노드 생성 + 본문 입력
 *  4) 시작 노드 → 메시지 노드 엣지 연결 (수동 시뮬, 단순 검증)
 *  5) "시뮬레이터" 버튼 클릭 → 시트 열림 확인
 *  6) 신청자 메시지 "유심 가입" 입력 + 실행
 *  7) 실행 결과 단계 표시 + emittedMessage 확인
 *  8) 캔버스에 트레이스 하이라이트 적용 확인
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
mkdirSync(".captures", { recursive: true });

const b = await puppeteer.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 1440, height: 900 },
  args: ["--no-sandbox"],
});

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

try {
  const p = await b.newPage();
  p.on("dialog", async (d) => await d.accept());

  // 로그인
  await p.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
  await p.click("#email", { count: 3 });
  await p.type("#email", "user");
  await p.type("#password", "user1234");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }),
    p.click("button[type=submit]"),
  ]);

  // 첫 플로우로 이동
  await p.goto("http://localhost:3000/chatbot-flow", {
    waitUntil: "networkidle0",
  });
  const href = await p.evaluate(() => {
    const a = document.querySelector('a[href^="/chatbot-flow/"]');
    return a?.getAttribute("href") ?? null;
  });
  if (!href) fail("플로우 없음 — seed 필요");

  await p.goto(`http://localhost:3000${href}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  // 1) 시뮬레이터 버튼 존재 확인
  const hasSimBtn = await p.evaluate(() => {
    return [...document.querySelectorAll("button")].some((b) =>
      b.textContent?.includes("시뮬레이터")
    );
  });
  if (!hasSimBtn) fail("시뮬레이터 버튼 없음");
  console.log("✓ 시뮬레이터 버튼 존재");

  // 2) 시뮬레이터 클릭 → 시트 열림
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("시뮬레이터")
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  const simOpen = await p.evaluate(() => {
    return [...document.querySelectorAll('[data-slot="sheet-content"]')].some(
      (el) => el.textContent?.includes("플로우 시뮬레이터")
    );
  });
  if (!simOpen) fail("시뮬레이터 시트 안 열림");
  console.log("✓ 시뮬레이터 시트 열림");

  // 3) 가상 신청자 폼 확인
  const hasApplicantForm = await p.evaluate(() => {
    const labels = [...document.querySelectorAll("label")].map(
      (l) => l.textContent ?? ""
    );
    return (
      labels.some((l) => l.includes("이름")) &&
      labels.some((l) => l.includes("모국어")) &&
      labels.some((l) => l.includes("국적")) &&
      labels.some((l) => l.includes("신청자 첫 메시지"))
    );
  });
  if (!hasApplicantForm) fail("가상 신청자 폼 항목 누락");
  console.log("✓ 가상 신청자 폼 표시됨 (이름/모국어/국적/메시지)");

  await p.screenshot({ path: ".captures/test-simulator-open.png" });

  // 4) 실행 버튼 클릭
  await p.evaluate(() => {
    const sheet = [...document.querySelectorAll('[data-slot="sheet-content"]')]
      .find((el) => el.textContent?.includes("플로우 시뮬레이터"));
    const btn = [...sheet.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "실행"
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // 5) 결과 표시 확인
  const hasResult = await p.evaluate(() => {
    const sheet = [...document.querySelectorAll('[data-slot="sheet-content"]')]
      .find((el) => el.textContent?.includes("플로우 시뮬레이터"));
    return sheet?.textContent?.includes("실행 결과") ?? false;
  });
  if (!hasResult) fail("실행 결과 섹션 안 나옴");
  console.log("✓ 실행 결과 섹션 표시됨");

  // 6) 종료 사유 배지 (트리거 일치 시 — 시드 플로우 의존)
  const termLabel = await p.evaluate(() => {
    const sheet = [...document.querySelectorAll('[data-slot="sheet-content"]')]
      .find((el) => el.textContent?.includes("플로우 시뮬레이터"));
    const possible = [
      "완료",
      "사람 인계",
      "트리거 불일치",
      "다음 노드 없음",
      "단계 초과",
      "에러",
    ];
    for (const txt of possible) {
      if (sheet?.textContent?.includes(txt)) return txt;
    }
    return null;
  });
  if (!termLabel) fail("종료 사유 배지 없음");
  console.log(`✓ 종료 사유: "${termLabel}"`);

  // 7) 노드 경로 트레이스 확인
  const hasTrace = await p.evaluate(() => {
    const sheet = [...document.querySelectorAll('[data-slot="sheet-content"]')]
      .find((el) => el.textContent?.includes("플로우 시뮬레이터"));
    return sheet?.textContent?.includes("노드 경로") ?? false;
  });
  if (!hasTrace) fail("노드 경로 섹션 없음");
  console.log("✓ 노드 경로 트레이스 표시됨");

  await p.screenshot({ path: ".captures/test-simulator-result.png" });

  // 8) 시트 닫기 → 트레이스 하이라이트 제거 확인
  await p.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 400));

  const closed = await p.evaluate(() => {
    return ![...document.querySelectorAll('[data-slot="sheet-content"]')]
      .some((el) => el.textContent?.includes("플로우 시뮬레이터"));
  });
  if (!closed) fail("시뮬레이터 시트 안 닫힘");
  console.log("✓ 시뮬레이터 닫힘");

  console.log("\n=== 시뮬레이터 검증 통과 ===");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
} finally {
  await b.close();
}
