/**
 * 챗봇 플로우 편집 페이지 캡처:
 *  1) 로그인
 *  2) /chatbot-flow 진입 → "플로우 추가" → "테스트 플로우" 생성 → redirect
 *  3) 캔버스 캡처 (시작 노드만 있는 상태)
 *  4) "노드 추가" 클릭 → "메시지" 선택 → 메시지 노드 생성 → 캡처
 *  5) 노드 클릭 → 프로퍼티 패널 캡처
 */
import puppeteer from "puppeteer-core";

const b = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 1440, height: 900 },
  args: ["--no-sandbox"],
});

try {
  const p = await b.newPage();

  // 로그인
  await p.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
  await p.click("#email", { count: 3 });
  await p.type("#email", "user");
  await p.type("#password", "user1234");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }),
    p.click("button[type=submit]"),
  ]);

  // 리스트 페이지
  await p.goto("http://localhost:3000/chatbot-flow", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));

  // "플로우 추가" 버튼 클릭
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("플로우 추가")
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  await p.type("#flow-name", "테스트 플로우");
  await new Promise((r) => setTimeout(r, 200));

  // "생성하고 편집하기" 클릭 → redirect 발생
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0", timeout: 10_000 }).catch(() => null),
    p.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("생성하고 편집하기")
      );
      btn?.click();
    }),
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  console.log("URL:", p.url());

  // 캔버스 진입 후 캡처 (시작 노드만)
  await p.screenshot({ path: ".captures/fics-flow-empty.png" });
  console.log("✓ empty");

  // 노드 추가 dropdown 클릭
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().startsWith("노드 추가")
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  // dropdown 캡처
  await p.screenshot({ path: ".captures/fics-flow-dropdown.png" });
  console.log("✓ dropdown");

  // "메시지" 선택
  await p.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const item = items.find((el) => el.textContent && el.textContent.includes("메시지"));
    if (item) item.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // 노드 + 패널 동시 표시
  await p.screenshot({ path: ".captures/fics-flow-with-panel.png" });
  console.log("✓ with panel");
} catch (e) {
  console.error("ERR:", e.message);
} finally {
  await b.close();
}
