/**
 * Prod QA — 매니저 로그인 → 채팅 응답
 *
 * 시나리오:
 *   1. /login 접속 → admin / admin1234 시도
 *   2. /chat 진입 (로그인 후 redirect 또는 직접)
 *   3. 가장 최근 룸 선택 → 메시지 발신
 *   4. 자동번역 결과 확인
 */
import puppeteer from "puppeteer-core";

const BASE_URL = process.argv[2] || process.env.BASE_URL || "https://nb-chat-pi.vercel.app";
const SEED_EMAIL = process.env.SEED_EMAIL || "admin";
const SEED_PASSWORD = process.env.SEED_PASSWORD || "admin1234";

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
  // hydration 완료 대기 (Server Action 폼은 React 클라이언트 핸들러 필요)
  await page.waitForSelector("#email", { timeout: 10_000 });
  await page.waitForSelector("#password", { timeout: 10_000 });
  await new Promise((r) => setTimeout(r, 800));

  // 폼 직접 채우기 (id 셀렉터)
  await page.$eval("#email", (el, v) => { el.value = ""; }, "");
  await page.$eval("#password", (el, v) => { el.value = ""; }, "");
  await page.type("#email", SEED_EMAIL, { delay: 30 });
  await page.type("#password", SEED_PASSWORD, { delay: 30 });

  // submit 버튼 + Enter 둘 다 시도
  const clicked = await page.evaluate(() => {
    const form = document.querySelector("form");
    const btn = form?.querySelector('button[type="submit"], button:not([type])');
    btn?.click();
    return btn?.textContent?.trim() ?? null;
  });
  // 백업: submit 이벤트 직접 발사
  await page.evaluate(() => {
    const form = document.querySelector("form");
    if (form && location.pathname === "/login") {
      form.requestSubmit?.();
    }
  });

  try {
    await page.waitForFunction(
      () => location.pathname === "/dashboard" || location.pathname === "/chat",
      { timeout: 20_000, polling: 500 }
    );
    const path = await page.evaluate(() => location.pathname);
    console.log(`✓ [1] 로그인 성공 (${clicked} → ${path})`);
    pass++;
  } catch {
    const errs = await page.evaluate(() => {
      const toasts = Array.from(document.querySelectorAll('[role="alert"], [data-sonner-toast], .text-destructive'))
        .map((e) => e.textContent?.trim()).filter(Boolean);
      return toasts.join(" | ");
    });
    const path = await page.evaluate(() => location.pathname);
    const formState = await page.evaluate(() => ({
      emailVal: document.querySelector("#email")?.value,
      pwLen: document.querySelector("#password")?.value?.length,
    }));
    console.log(`✗ [1] 로그인 실패 (path=${path}, err=${errs || "none"}, form=${JSON.stringify(formState)})`);
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
