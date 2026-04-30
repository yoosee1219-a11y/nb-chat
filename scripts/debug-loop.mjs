/**
 * 자동 디버깅 루프 — 모든 어드민 페이지 진입 + 콘솔 에러 / 페이지 에러 수집.
 * 사용: node scripts/debug-loop.mjs
 *
 * 출력:
 *  - .captures/debug-{page}.png
 *  - 콘솔에 에러 수집 리포트 (페이지별)
 *  - 종료 코드: 0 (clean) / 1 (errors found)
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

mkdirSync(".captures", { recursive: true });

const PAGES = [
  { name: "login", url: "/login", auth: false },
  { name: "dashboard", url: "/dashboard", auth: true },
  { name: "applicants", url: "/applicants", auth: true },
  {
    name: "applicant-detail",
    url: "/applicants/seed-Nguyen-Van-A",
    auth: true,
  },
  { name: "plans", url: "/plans", auth: true },
  { name: "managers", url: "/managers", auth: true },
  {
    name: "chat",
    url: "/chat?roomId=seed-room-seed-Nguyen-Van-A",
    auth: true,
  },
  { name: "chatbot-flow", url: "/chatbot-flow", auth: true },
];

const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /\[HMR\]/,
  /Fast Refresh/,
  /\[Fast Refresh\]/,
  /Browser detected/i,
  // Next dev mode
  /\[Next\.js\]/,
];

const results = [];

const b = await puppeteer.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
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
    p.waitForNavigation({ waitUntil: "networkidle0", timeout: 10_000 }),
    p.click("button[type=submit]"),
  ]);

  // 챗봇 플로우 1개 만들어두기 (편집 페이지 진입용)
  let editFlowId = null;
  try {
    const flowsRes = await p.evaluate(async () => {
      const r = await fetch("/chatbot-flow");
      return r.status;
    });
    // 가장 최근 플로우 ID 추출 (편집 캡처용)
    await p.goto("http://localhost:3000/chatbot-flow", {
      waitUntil: "networkidle0",
    });
    const href = await p.evaluate(() => {
      const a = document.querySelector('a[href^="/chatbot-flow/"]');
      return a?.getAttribute("href") ?? null;
    });
    if (href) editFlowId = href.replace("/chatbot-flow/", "");
  } catch (_) {}

  if (editFlowId) {
    PAGES.push({
      name: "chatbot-flow-edit",
      url: `/chatbot-flow/${editFlowId}`,
      auth: true,
    });
  }

  for (const pg of PAGES) {
    const errors = [];
    const consoleMsgs = [];
    const failedReqs = [];

    const onConsole = (msg) => {
      const txt = msg.text();
      if (msg.type() !== "error" && msg.type() !== "warning") return;
      if (IGNORE_CONSOLE.some((rx) => rx.test(txt))) return;
      consoleMsgs.push({ type: msg.type(), text: txt });
    };
    const onPageError = (err) => {
      errors.push({ message: err.message, stack: err.stack?.slice(0, 500) });
    };
    const onResponse = (res) => {
      if (res.status() >= 400) {
        failedReqs.push({ status: res.status(), url: res.url() });
      }
    };

    p.on("console", onConsole);
    p.on("pageerror", onPageError);
    p.on("response", onResponse);

    try {
      await p.goto(`http://localhost:3000${pg.url}`, {
        waitUntil: "networkidle0",
        timeout: 15_000,
      });
      await new Promise((r) => setTimeout(r, 1000));
      await p.screenshot({ path: `.captures/debug-${pg.name}.png` });
    } catch (e) {
      errors.push({ message: `[goto] ${e.message}` });
    } finally {
      p.off("console", onConsole);
      p.off("pageerror", onPageError);
      p.off("response", onResponse);
    }

    const total =
      errors.length + consoleMsgs.length + failedReqs.length;
    results.push({
      name: pg.name,
      url: pg.url,
      total,
      errors,
      consoleMsgs,
      failedReqs,
    });
  }
} finally {
  await b.close();
}

// ─── 리포트 ──────────────────────────────────────
let cleanCount = 0;
console.log("\n=== 디버그 루프 결과 ===\n");
for (const r of results) {
  if (r.total === 0) {
    console.log(`✓ ${r.name.padEnd(20)} clean`);
    cleanCount++;
    continue;
  }
  console.log(`✗ ${r.name.padEnd(20)} ${r.total} 이슈 (${r.url})`);
  for (const e of r.errors) {
    console.log(`    [pageerror] ${e.message}`);
    if (e.stack) console.log(`      ${e.stack.split("\n")[0]}`);
  }
  for (const c of r.consoleMsgs) {
    console.log(`    [${c.type}] ${c.text.slice(0, 200)}`);
  }
  for (const f of r.failedReqs) {
    console.log(`    [${f.status}] ${f.url}`);
  }
}
console.log(`\n${cleanCount}/${results.length} 페이지 clean\n`);

process.exit(results.some((r) => r.total > 0) ? 1 : 0);
