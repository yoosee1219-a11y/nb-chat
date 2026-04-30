/**
 * prefers-color-scheme: dark 환경에서 페이지 깨끗한지 확인
 * (사용자 OS가 다크 모드라 Sheet 패널이 검정으로 보였던 이슈 재현)
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

try {
  const p = await b.newPage();
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);

  await p.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
  await p.click("#email", { count: 3 });
  await p.type("#email", "user");
  await p.type("#password", "user1234");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }),
    p.click("button[type=submit]"),
  ]);

  await p.goto("http://localhost:3000/chatbot-flow", {
    waitUntil: "networkidle0",
  });
  const href = await p.evaluate(() => {
    const a = document.querySelector('a[href^="/chatbot-flow/"]');
    return a?.getAttribute("href") ?? null;
  });
  if (!href) throw new Error("플로우 없음 — 먼저 만드세요");

  await p.goto(`http://localhost:3000${href}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  // 시작 노드 클릭 → Sheet 열기
  await p.evaluate(() => {
    const node = document.querySelector('.react-flow__node-start');
    node?.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  await p.screenshot({ path: ".captures/verify-dark-sheet.png" });
  console.log("✓ dark mode sheet capture saved");
} finally {
  await b.close();
}
