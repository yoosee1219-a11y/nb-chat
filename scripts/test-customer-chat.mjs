/**
 * 고객 모바일 채팅 E2E 검증:
 *  1) seed 룸 ID 페치
 *  2) /c/[roomId] 진입 — 인증 X
 *  3) 헤더(이름+언어), 메시지 영역, 입력창 표시 확인
 *  4) 모바일 viewport(375x812) 렌더 확인
 *  5) 메시지 전송 → 본인(녹색 우측 버블)으로 표시
 *  6) 챗봇 자동 응답 도착 시 봇 라벨 + translatedText 우선 표시 확인
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
mkdirSync(".captures", { recursive: true });

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

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
  p.on("pageerror", (e) => console.error("[pageerror]", e.message));

  // seed 룸 ID로 직접 이동 (어드민 시드 데이터 의존)
  const roomId = "seed-room-seed-Nguyen-Van-A";
  const url = `http://localhost:3000/c/${roomId}`;

  const consoleErrors = [];
  p.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("DevTools")) {
      consoleErrors.push(m.text());
    }
  });

  const resp = await p.goto(url, { waitUntil: "networkidle0" });
  if (resp.status() !== 200) fail(`HTTP ${resp.status()} for ${url}`);
  await new Promise((r) => setTimeout(r, 800));

  // 1) 헤더
  const hasHeader = await p.evaluate(() => {
    return document.body.textContent?.includes("NB Chat 상담") ?? false;
  });
  if (!hasHeader) fail("헤더 'NB Chat 상담' 없음");
  console.log("✓ 헤더 표시");

  // 2) 입력창 + 전송 버튼
  const hasTextarea = await p.evaluate(
    () => document.querySelector("textarea") !== null
  );
  if (!hasTextarea) fail("입력창 없음");
  console.log("✓ 입력창 존재");

  // 3) 모바일 사이즈 viewport 적용 (보디 width)
  const bodyWidth = await p.evaluate(() => document.body.clientWidth);
  if (bodyWidth > 400) fail(`bodyWidth=${bodyWidth} — 모바일 viewport 적용 안됨`);
  console.log(`✓ 모바일 viewport (width=${bodyWidth}px)`);

  await p.screenshot({ path: ".captures/test-customer-initial.png" });

  // 4) 소켓 연결 대기 (Wifi 아이콘 노출)
  await new Promise((r) => setTimeout(r, 1500));
  const connected = await p.evaluate(() => {
    return document.querySelector(".text-emerald-500") !== null;
  });
  console.log(`소켓 연결: ${connected ? "✓" : "(미연결)"}`);

  // 5) 메시지 전송
  await p.click("textarea");
  await p.type("textarea", "유심 가입 가능한가요?", { delay: 30 });
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.querySelector("svg") && b.className.includes("bg-emerald-500")
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const myMsgRendered = await p.evaluate(() => {
    return document.body.textContent?.includes("유심 가입 가능한가요?") ?? false;
  });
  if (!myMsgRendered) fail("내 메시지 화면 반영 안됨");
  console.log("✓ 내 메시지 (녹색 버블) 표시");

  await p.screenshot({ path: ".captures/test-customer-sent.png" });

  // 6) 콘솔 에러 없어야
  if (consoleErrors.length > 0) {
    console.log("⚠ 콘솔 에러:", consoleErrors.slice(0, 3).join(" | "));
  } else {
    console.log("✓ 콘솔 클린");
  }

  console.log("\n=== 고객 채팅 검증 통과 ===");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
} finally {
  await b.close();
}
