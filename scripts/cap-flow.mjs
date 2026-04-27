import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

mkdirSync(".captures", { recursive: true });

const b = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new",
  defaultViewport: { width: 1440, height: 900 },
});
try {
  const p = await b.newPage();
  await p.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
  await p.click("#email", { count: 3 });
  await p.type("#email", "manager1@fics.local");
  await p.type("#password", "manager123");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }),
    p.click("button[type=submit]"),
  ]);

  await p.goto("http://localhost:3000/chatbot-flow", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1000));
  await p.screenshot({ path: ".captures/fics-chatbot-flow.png" });
  console.log("✓ list");

  // 첫 플로우 만들고 편집 페이지도 캡처
  const id = await p.evaluate(async () => {
    const res = await fetch("/api/health", { method: "GET" }).catch(() => null);
    return res?.ok;
  });
  console.log("nav done");
} catch (e) {
  console.error("ERR:", e.message);
} finally {
  await b.close();
}
