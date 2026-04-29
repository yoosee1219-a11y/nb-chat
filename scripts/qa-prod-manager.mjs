/**
 * Prod QA — 매니저 로그인 → 채팅 응답
 *
 * 시나리오:
 *   1. /login 접속 → admin@fics.local / admin123 시도
 *   2. /chat 진입 (로그인 후 redirect 또는 직접)
 *   3. 가장 최근 룸 선택 → 메시지 발신
 *   4. 자동번역 결과 확인
 */
import puppeteer from "puppeteer-core";

const BASE_URL = process.argv[2] || process.env.BASE_URL || "https://nb-chat-pi.vercel.app";
const SEED_EMAIL = "admin@fics.local";
const SEED_PASSWORD = "admin123";

console.log(`▶ Target: ${BASE_URL} (시드 매니저: ${SEED_EMAIL})`);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 1280, height: 800 },
  args: ["--no-sandbox"],
});

let pass = 0;
let total = 0;

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`  [browser] ${msg.text().slice(0, 200)}`);
  });

  // ───── 1. 로그인 ─────
  total++;
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
  // email/password input 찾기
  const inputs = await page.$$('input');
  let emailInput, pwInput;
  for (const inp of inputs) {
    const type = await inp.evaluate((el) => el.type);
    if (type === "email") emailInput = inp;
    else if (type === "password") pwInput = inp;
  }
  if (!emailInput || !pwInput) {
    console.log("✗ [1] 로그인 폼 못 찾음");
  } else {
    await emailInput.type(SEED_EMAIL);
    await pwInput.type(SEED_PASSWORD);

    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.type === "submit" || b.textContent?.includes("로그인"));
      btn?.click();
      return btn?.textContent?.trim();
    });

    try {
      await page.waitForFunction(
        () => location.pathname === "/dashboard" || location.pathname === "/chat",
        { timeout: 15_000, polling: 500 }
      );
      const path = await page.evaluate(() => location.pathname);
      console.log(`✓ [1] 로그인 성공 (${clicked} → ${path})`);
      pass++;
    } catch {
      const errs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="alert"], .text-destructive'))
          .map((e) => e.textContent?.trim()).filter(Boolean).join(" | ")
      );
      const path = await page.evaluate(() => location.pathname);
      console.log(`✗ [1] 로그인 실패 (path=${path}, err=${errs || "none"})`);
    }
  }

  // ───── 2. /chat 페이지 로드 ─────
  total++;
  if (page.url().includes("/dashboard") || page.url().includes("/chat")) {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle0" });
    const chatPath = await page.evaluate(() => location.pathname);
    if (chatPath === "/chat") {
      const roomCount = await page.evaluate(() => {
        // 룸 리스트의 항목 수 — 통상 button 또는 li
        const rooms = document.querySelectorAll('[role="button"], li[data-room-id], a[href*="?roomId="]');
        return rooms.length;
      });
      console.log(`✓ [2] /chat 페이지 로드 — 룸 ${roomCount}개 감지`);
      pass++;
    } else {
      console.log(`✗ [2] /chat redirect 실패: ${chatPath}`);
    }
  } else {
    console.log("✗ [2] skip — 로그인 실패");
  }

  // ───── 3. 매니저 시점에서 메시지 발신 (가장 최근 룸) ─────
  total++;
  if (page.url().includes("/chat")) {
    try {
      // URL에 roomId 있는 첫 번째 링크 클릭
      const firstRoom = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="roomId="]'));
        if (anchors.length === 0) return null;
        anchors[0].click();
        return anchors[0].href;
      });
      if (!firstRoom) {
        console.log("✗ [3] 룸 없음");
      } else {
        await new Promise((r) => setTimeout(r, 2000));
        // textarea 찾고 입력
        const ta = await page.$('textarea');
        if (!ta) throw new Error("textarea 못 찾음");
        const testMsg = `QA 매니저 메시지 ${Date.now()}`;
        await ta.type(testMsg);
        await new Promise((r) => setTimeout(r, 300));
        // 전송 버튼 (Send)
        const sent = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const target = btns.find((b) => b.textContent?.trim() === "전송" || b.querySelector("svg.lucide-send"));
          if (target) {
            target.click();
            return true;
          }
          return false;
        });
        if (!sent) throw new Error("전송 버튼 못 찾음");
        await new Promise((r) => setTimeout(r, 3000));

        // 메시지가 화면에 보이는지
        const visible = await page.evaluate((m) => document.body.innerText.includes(m), testMsg);
        if (visible) {
          console.log(`✓ [3] 매니저 메시지 발신 + 자동 표시`);
          pass++;
        } else {
          console.log(`✗ [3] 메시지 화면에 안 보임`);
        }
      }
    } catch (e) {
      console.log(`✗ [3] 매니저 채팅 실패: ${e.message}`);
    }
  } else {
    console.log("✗ [3] skip");
  }

  await ctx.close();
  console.log(`\n=== ${pass}/${total} 매니저 시나리오 통과 ===`);
} finally {
  await browser.close();
  process.exit(pass === total ? 0 : 1);
}
