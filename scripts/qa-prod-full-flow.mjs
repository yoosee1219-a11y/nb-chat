/**
 * Prod QA — 광고 클릭 → 가입 → 채팅 풀 흐름
 *
 * 검증 시나리오:
 *   1. /r/stealup 진입 → fics_source 쿠키 (HMAC) set
 *   2. /apply 페이지 로드 → 폼 자동 입력 → submit
 *   3. /c/[roomId] redirect → 환영 메시지 표시
 *   4. 신청자 메시지 발신 → 챗봇 응답 수신
 *
 * BASE_URL은 인자 또는 ENV로 전달.
 */
import puppeteer from "puppeteer-core";

const BASE_URL = process.argv[2] || process.env.BASE_URL || "https://nb-chat-pi.vercel.app";
const HEADLESS = process.env.HEADLESS !== "false";

console.log(`▶ Target: ${BASE_URL} (headless=${HEADLESS})`);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: HEADLESS ? "new" : false,
  defaultViewport: { width: 480, height: 900 }, // 모바일 뷰포트
  args: ["--no-sandbox"],
});

let pass = 0;
let total = 0;

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`  [browser err] ${msg.text().slice(0, 200)}`);
  });

  // ───── 1. 광고 클릭 → 쿠키 ─────
  total++;
  await page.goto(
    `${BASE_URL}/r/stealup?utm_campaign=qa-prod&utm_medium=banner`,
    { waitUntil: "networkidle0", timeout: 30_000 }
  );
  const finalUrl = page.url();
  if (!finalUrl.includes("/apply")) {
    console.log(`✗ [1] redirect 실패: ${finalUrl}`);
  } else {
    const cookies = await page.cookies();
    const src = cookies.find((c) => c.name === "fics_source");
    if (!src || !src.value.includes(".")) {
      console.log("✗ [1] HMAC 쿠키 없음");
    } else {
      console.log("✓ [1] /r/stealup → /apply + HMAC 쿠키 set");
      pass++;
    }
  }

  // ───── 2. 가입 폼 작성 + submit ─────
  total++;
  let roomUrl = null;
  try {
    // 이름
    await page.waitForSelector("#name", { timeout: 15_000 });
    const testName = `QA-${Date.now().toString().slice(-6)}`;
    await page.type("#name", testName);

    // base-ui Select — 클릭 후 항목 선택
    // 국적: VN, 언어: VI_VN (기본값일 수도 있음)
    // 폼이 KO/KR 기본일 수 있으니 명시 변경
    const trigSelectors = await page.$$('button[role="combobox"]');
    // 국적 Select (첫 번째)
    if (trigSelectors[0]) {
      await trigSelectors[0].click();
      await new Promise((r) => setTimeout(r, 300));
      // 베트남 옵션 클릭
      const vnOpt = await page.$$eval("[role='option']", (els) =>
        els.findIndex((e) => e.textContent?.includes("베트남"))
      );
      if (vnOpt >= 0) {
        const opts = await page.$$("[role='option']");
        await opts[vnOpt].click();
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    // 언어 Select (두 번째)
    if (trigSelectors[1]) {
      await trigSelectors[1].click();
      await new Promise((r) => setTimeout(r, 300));
      const viOpt = await page.$$eval("[role='option']", (els) =>
        els.findIndex(
          (e) => e.textContent?.includes("Tiếng Việt") || e.textContent?.toLowerCase().includes("vietnam")
        )
      );
      if (viOpt >= 0) {
        const opts = await page.$$("[role='option']");
        await opts[viOpt].click();
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // 개인정보 동의 체크 — page.click()으로 정확한 요소 클릭
    // (직접 evaluate로 .click() 호출하면 React가 다시 false로 돌릴 수 있음)
    const cbCount = await page.$$eval('input[type="checkbox"]', (cs) => cs.length);
    if (cbCount > 0) {
      // 첫 번째 checkbox = privacy (필수)
      const cbHandles = await page.$$('input[type="checkbox"]');
      await cbHandles[0].click();
      // 검증 — 체크 됐는지 확인
      const checked = await page.$eval(
        'input[type="checkbox"]',
        (cb) => cb.checked
      );
      if (!checked) {
        // React state 동기화 위해 또 클릭
        await new Promise((r) => setTimeout(r, 200));
        await cbHandles[0].click();
      }
    }
    await new Promise((r) => setTimeout(r, 300));

    // 신청 버튼 — page.evaluate 내에서 직접 click
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const labels = ["상담", "신청", "가입", "submit", "보내기", "시작"];
      const btn = btns.find((b) =>
        b.type === "submit" ||
        labels.some((t) => b.textContent?.toLowerCase().includes(t.toLowerCase()))
      );
      if (btn) {
        btn.click();
        return btn.textContent?.trim() ?? "(no text)";
      }
      return null;
    });
    if (!clicked) throw new Error("submit 버튼 못 찾음");
    console.log(`  → 클릭한 버튼: "${clicked}"`);
    // 디버그: 1초 대기 후 폼 상태 dump
    await new Promise((r) => setTimeout(r, 1500));
    const formState = await page.evaluate(() => {
      const name = document.getElementById("name")?.value;
      const checkboxes = Array.from(
        document.querySelectorAll("input[type='checkbox']")
      ).map((c) => c.checked);
      const errors = Array.from(
        document.querySelectorAll('[role="alert"], .text-destructive, .text-red-500, [data-sonner-toast]')
      ).map((e) => e.textContent?.trim()).filter(Boolean);
      const triggers = Array.from(
        document.querySelectorAll('button[role="combobox"]')
      ).map((b) => b.textContent?.trim());
      return { name, checkboxes, errors, triggers, path: location.pathname };
    });
    console.log(`  → form: name="${formState.name}" checkboxes=${JSON.stringify(formState.checkboxes)} triggers=${JSON.stringify(formState.triggers)} errors=${JSON.stringify(formState.errors)}`);
    try {
      await page.waitForFunction(
        () => location.pathname.startsWith("/c/"),
        { timeout: 30_000, polling: 500 }
      );
      roomUrl = page.url();
      const roomId = roomUrl.split("/c/")[1].split("?")[0];
      console.log(`✓ [2] 가입 성공 — roomId=${roomId.slice(0, 12)}...`);
      pass++;
    } catch (waitErr) {
      // 에러 메시지 캡처
      const errText = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="alert"], .text-destructive, .text-red-500'))
          .map((e) => e.textContent?.trim()).filter(Boolean).join(" | ") || null
      );
      const path = await page.evaluate(() => location.pathname);
      await page.screenshot({ path: "/tmp/qa-apply-fail.png" }).catch(() => {});
      console.log(`✗ [2] redirect 실패 (path=${path}, err=${errText ?? "none"})`);
    }
  } catch (e) {
    console.log(`✗ [2] 가입 실패: ${e.message}`);
  }

  // ───── 3. 환영 메시지 표시 ─────
  total++;
  if (roomUrl) {
    try {
      await new Promise((r) => setTimeout(r, 2000));
      const welcome = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes("환영") || text.includes("Welcome") || text.includes("Chào mừng");
      });
      if (welcome) {
        console.log("✓ [3] 환영 메시지 표시");
        pass++;
      } else {
        console.log("✗ [3] 환영 메시지 없음");
      }
    } catch (e) {
      console.log(`✗ [3] 검증 실패: ${e.message}`);
    }
  } else {
    console.log("✗ [3] skip — 가입 실패");
  }

  // ───── 4. 신청자 메시지 발신 → 챗봇 응답 ─────
  total++;
  if (roomUrl) {
    try {
      // textarea 찾기 + 입력
      await page.waitForSelector("textarea", { timeout: 10_000 });
      await page.type("textarea", "Tôi muốn đăng ký SIM");

      // 발신 버튼 (textarea 옆 button)
      const sendBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        // 모바일 채팅 send 버튼은 보통 마지막 버튼
        return btns[btns.length - 1];
      });
      await sendBtn.click();

      // 챗봇 응답 5초 대기
      await new Promise((r) => setTimeout(r, 6000));
      const messages = await page.evaluate(() => {
        const all = document.querySelectorAll("li");
        return all.length;
      });
      if (messages >= 3) {
        // 환영(SYSTEM) + 신청자 + 챗봇 응답 = 최소 3
        console.log(`✓ [4] 챗봇 응답 — 메시지 ${messages}개`);
        pass++;
      } else {
        console.log(`✗ [4] 챗봇 응답 없음 (메시지 ${messages}개만 보임)`);
      }
    } catch (e) {
      console.log(`✗ [4] 채팅 실패: ${e.message}`);
    }
  } else {
    console.log("✗ [4] skip — 가입 실패");
  }

  await ctx.close();

  console.log(`\n=== ${pass}/${total} prod 시나리오 통과 ===`);
} finally {
  await browser.close();
  process.exit(pass === total ? 0 : 1);
}
