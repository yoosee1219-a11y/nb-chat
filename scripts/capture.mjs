/**
 * Edge headless 자동 캡처 스크립트.
 * 우리 페이지 인증 후 어드민 화면 캡처.
 *
 * 사용: node scripts/capture.mjs
 * 출력: .captures/fics-*.png
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const OUT = resolve(".captures");
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };
const BASE = "http://localhost:3000";

const PAGES = [
  { name: "fics-login",      url: "/login",        auth: false },
  { name: "fics-dashboard",  url: "/dashboard",    auth: true  },
  { name: "fics-applicants", url: "/applicants",   auth: true  },
  { name: "fics-applicant-detail", url: "/applicants/seed-Nguyen-Van-A", auth: true },
  { name: "fics-plans",      url: "/plans",        auth: true  },
  { name: "fics-managers",   url: "/managers",     auth: true  },
  { name: "fics-chat",       url: "/chat?roomId=seed-room-seed-Nguyen-Van-A", auth: true },
];

async function findEdge() {
  const { existsSync } = await import("node:fs");
  for (const p of EDGE_PATHS) if (existsSync(p)) return p;
  throw new Error("Edge not found");
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.click("#email", { count: 3 });
  await page.type("#email", "manager1@fics.local");
  await page.type("#password", "manager123");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10_000 }),
    page.click("button[type=submit]"),
  ]);
  console.log("✓ 로그인 완료, URL:", page.url());
}

async function main() {
  const executablePath = await findEdge();
  console.log(`Edge: ${executablePath}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--hide-scrollbars"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // 인증 미리 1회
    await login(page);

    for (const p of PAGES) {
      if (p.url === "/login") continue; // 이미 캡처됨
      const out = `${OUT}\\${p.name}.png`;
      await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle0", timeout: 15_000 });
      // 채팅은 Socket 연결 대기 약간
      if (p.url.startsWith("/chat")) await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: out, fullPage: false });
      console.log(`✓ ${p.name}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n출력: ${OUT}`);
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
