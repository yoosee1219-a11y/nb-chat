/**
 * dropdown 동작 자동 검증:
 *  1) 챗봇 플로우 편집 페이지 진입
 *  2) "노드 추가" 버튼 클릭
 *  3) dropdown 메뉴 열림 확인
 *  4) 5개 메뉴 항목 모두 보이는지
 *  5) "메시지" 클릭 → 노드 생성 확인
 *  6) 그 노드 클릭 → Sheet 패널 열림 확인
 *  7) 본문 입력 → 캔버스 미리보기 갱신 확인
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

  // beforeunload 다이얼로그 자동 처리 (테스트 자동화 목적)
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

  // 첫 플로우 편집 페이지로
  await p.goto("http://localhost:3000/chatbot-flow", {
    waitUntil: "networkidle0",
  });
  const href = await p.evaluate(() => {
    const a = document.querySelector('a[href^="/chatbot-flow/"]');
    return a?.getAttribute("href") ?? null;
  });
  if (!href) fail("플로우 없음");

  await p.goto(`http://localhost:3000${href}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  // 1) 첫 진입 시 dirty 상태 확인 (저장됨 배지여야 함)
  const initialBadge = await p.evaluate(() => {
    const b = [...document.querySelectorAll("span")].find(
      (el) => el.textContent === "저장됨" || el.textContent === "저장 안됨"
    );
    return b?.textContent ?? "unknown";
  });
  console.log(`초기 상태: "${initialBadge}"`);
  if (initialBadge !== "저장됨")
    fail(`초기 dirty 상태 잘못됨 (${initialBadge}) — beforeunload 경고 트리거됨`);

  // 2) "노드 추가" 버튼 클릭
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().startsWith("노드 추가")
    );
    if (!btn) throw new Error("노드 추가 버튼 못찾음");
    btn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // 3) dropdown 메뉴 항목 카운트
  const itemCount = await p.evaluate(() => {
    return document.querySelectorAll('[role="menuitem"]').length;
  });
  console.log(`dropdown 항목: ${itemCount}개`);
  if (itemCount !== 5)
    fail(`dropdown 5개 기대했는데 ${itemCount}개 — DropdownMenu 깨짐`);

  await p.screenshot({ path: ".captures/test-dropdown-open.png" });

  // 4) 메뉴 항목 라벨 확인
  const labels = await p.evaluate(() => {
    return [...document.querySelectorAll('[role="menuitem"]')].map((el) => {
      const text = el.textContent ?? "";
      return text.replace(/\s+/g, " ").trim().slice(0, 30);
    });
  });
  console.log(`라벨: ${labels.join(" | ")}`);
  const expected = ["메시지", "조건/분기", "LLM 응답", "번역", "사람 연결"];
  for (const ex of expected) {
    if (!labels.some((l) => l.includes(ex)))
      fail(`라벨 "${ex}" 못찾음`);
  }

  // 5) "메시지" 클릭 → 노드 생성 + Sheet 자동 열림
  await p.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const msg = items.find((el) => el.textContent?.includes("메시지"));
    if (msg) msg.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  const messageNodeExists = await p.evaluate(() => {
    return document.querySelector(".react-flow__node-message") !== null;
  });
  if (!messageNodeExists) fail("메시지 노드 생성 안됨");
  console.log("✓ 메시지 노드 생성됨");

  const sheetOpen = await p.evaluate(() => {
    return document.querySelector('[data-slot="sheet-content"]') !== null;
  });
  if (!sheetOpen) fail("Sheet 패널 안 열림");
  console.log("✓ Sheet 패널 자동 열림");

  // 6) dirty 상태 확인 (이젠 "저장 안됨"이어야)
  const afterAddBadge = await p.evaluate(() => {
    const b = [...document.querySelectorAll("span")].find(
      (el) => el.textContent === "저장됨" || el.textContent === "저장 안됨"
    );
    return b?.textContent ?? "unknown";
  });
  if (afterAddBadge !== "저장 안됨")
    fail(`노드 추가 후 dirty 안 표시 (${afterAddBadge})`);
  console.log(`✓ 노드 추가 후 상태: "${afterAddBadge}"`);

  // 7) 텍스트 입력 → 노드 미리보기 갱신
  await p.evaluate(() => {
    const ta = document.querySelector("#msg-text");
    if (ta) ta.focus();
  });
  await p.keyboard.type("자동화 테스트 메시지", { delay: 30 });
  await new Promise((r) => setTimeout(r, 500));

  const previewText = await p.evaluate(() => {
    const node = document.querySelector(".react-flow__node-message");
    return node?.textContent ?? "";
  });
  if (!previewText.includes("자동화 테스트 메시지"))
    fail(`노드 미리보기에 입력 텍스트 반영 안됨 (got: "${previewText.slice(0, 50)}")`);
  console.log("✓ 노드 미리보기 실시간 갱신");

  await p.screenshot({ path: ".captures/test-dropdown-final.png" });

  // ─── 시작 노드 편집 검증 ─────────────────────────
  // Sheet 닫기
  await p.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));

  // 시작 노드 클릭
  await p.evaluate(() => {
    const node = document.querySelector(".react-flow__node-start");
    if (node) node.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // 시작 노드 패널에 "트리거 조건" Label 보이는지
  const hasStartTrigger = await p.evaluate(() => {
    const labels = [...document.querySelectorAll("label")];
    return labels.some((l) => l.textContent?.includes("트리거 조건"));
  });
  if (!hasStartTrigger)
    fail("시작 노드 클릭 후 '트리거 조건' 폼 안 나옴 — 편집 못 함");
  console.log("✓ 시작 노드 트리거 조건 폼 표시됨");

  // SelectTrigger를 puppeteer mouse click + keyboard로 처리 (base-ui는 PointerEvent 필요)
  await p.click('[data-slot="select-trigger"]');
  await new Promise((r) => setTimeout(r, 500));

  // ArrowDown 3번 (always → language → status → keyword) + Enter
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  await new Promise((r) => setTimeout(r, 200));
  await p.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 600));

  // "키워드" Input 보이는지
  const hasKwInput = await p.evaluate(
    () => document.querySelector("#trigger-kw") !== null
  );
  if (!hasKwInput) fail("키워드 입력 필드 안 나옴");
  console.log("✓ 키워드 모드 → Input 필드 노출");

  // 키워드 입력 → 시작 노드 미리보기 갱신
  await p.click("#trigger-kw");
  await p.keyboard.type("유심", { delay: 30 });
  await new Promise((r) => setTimeout(r, 400));

  const startPreview = await p.evaluate(() => {
    const node = document.querySelector(".react-flow__node-start");
    return node?.textContent ?? "";
  });
  if (!startPreview.includes("유심"))
    fail(`시작 노드 미리보기에 키워드 반영 안됨 (got: "${startPreview.slice(0, 80)}")`);
  console.log("✓ 시작 노드 미리보기 키워드 갱신");

  await p.screenshot({ path: ".captures/test-start-trigger.png" });

  console.log("\n=== 모든 검증 통과 ===");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
} finally {
  await b.close();
}
