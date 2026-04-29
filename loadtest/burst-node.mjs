/**
 * Node.js 부하 테스트 — k6 미설치 시 폴백
 *
 * 시나리오:
 *  - 100 동시 worker가 30초 동안 /r/[code] 무작위 진입
 *  - 응답 시간 p50/p95/p99 + 성공/실패/rate-limit 카운트
 *
 * 사용:
 *   node loadtest/burst-node.mjs http://localhost:3000 100 30
 *   (BASE_URL  CONCURRENCY  DURATION_SEC)
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";
const CONCURRENCY = parseInt(process.argv[3] || "100", 10);
const DURATION_SEC = parseInt(process.argv[4] || "30", 10);

const PARTNERS = ["stealup", "workon", "DIRECT"];
const MEDIUMS = ["banner", "sms", "qr", "email", "video"];

const stats = {
  total: 0,
  success: 0,
  rateLimit: 0,
  fail: 0,
  durations: [],
  startTime: 0,
};

function pickPartner(workerId) {
  return PARTNERS[Math.floor(Math.random() * PARTNERS.length)];
}
function pickMedium() {
  return MEDIUMS[Math.floor(Math.random() * MEDIUMS.length)];
}

async function clickOnce(workerId, iter) {
  const partner = pickPartner(workerId);
  const medium = pickMedium();
  const campaign = `loadtest-w${workerId}-i${iter}`;
  const url = `${BASE_URL}/r/${partner}?utm_campaign=${campaign}&utm_medium=${medium}`;

  const start = performance.now();
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": `loadtest-w${workerId}` },
    });
    const dur = performance.now() - start;
    stats.total++;
    stats.durations.push(dur);
    if (res.status === 307 || res.status === 302) {
      if (res.headers.get("x-ratelimit-status") === "limited") {
        stats.rateLimit++;
      } else {
        stats.success++;
      }
    } else {
      stats.fail++;
    }
  } catch (e) {
    stats.total++;
    stats.fail++;
    stats.durations.push(performance.now() - start);
  }
}

async function worker(id, deadline) {
  let iter = 0;
  while (performance.now() < deadline) {
    await clickOnce(id, iter++);
    // 50~250ms 랜덤 sleep (사용자 행동 모방)
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 200));
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * (p / 100));
  return sorted[idx];
}

async function main() {
  console.log(
    `▶ ${BASE_URL} | concurrency=${CONCURRENCY} | duration=${DURATION_SEC}s`
  );
  stats.startTime = performance.now();
  const deadline = stats.startTime + DURATION_SEC * 1000;

  // 진행률
  const reportInterval = setInterval(() => {
    const elapsed = ((performance.now() - stats.startTime) / 1000).toFixed(1);
    console.log(
      `  ${elapsed}s — total=${stats.total} ok=${stats.success} rl=${stats.rateLimit} fail=${stats.fail}`
    );
  }, 5000);

  const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
    worker(i, deadline)
  );
  await Promise.all(workers);
  clearInterval(reportInterval);

  const totalSec = (performance.now() - stats.startTime) / 1000;
  const p50 = percentile(stats.durations, 50);
  const p95 = percentile(stats.durations, 95);
  const p99 = percentile(stats.durations, 99);
  const failRate = stats.total > 0 ? stats.fail / stats.total : 0;
  const rps = stats.total / totalSec;

  console.log("\n=== 부하 테스트 결과 ===");
  console.log(`기간:        ${totalSec.toFixed(1)}s`);
  console.log(`총 요청:     ${stats.total} (${rps.toFixed(1)} req/s)`);
  console.log(`정상 클릭:   ${stats.success}`);
  console.log(`rate-limit:  ${stats.rateLimit}`);
  console.log(`실패:        ${stats.fail}`);
  console.log(`실패율:      ${(failRate * 100).toFixed(2)}%`);
  console.log(`응답 p50:    ${p50.toFixed(0)}ms`);
  console.log(`응답 p95:    ${p95.toFixed(0)}ms`);
  console.log(`응답 p99:    ${p99.toFixed(0)}ms`);

  // 통과 기준
  const verdict = [];
  if (p95 > 800) verdict.push(`✗ p95 > 800ms (${p95.toFixed(0)})`);
  else verdict.push(`✓ p95 = ${p95.toFixed(0)}ms`);
  if (failRate > 0.05) verdict.push(`✗ 실패율 > 5% (${(failRate * 100).toFixed(1)}%)`);
  else verdict.push(`✓ 실패율 = ${(failRate * 100).toFixed(2)}%`);

  console.log("\n검증:");
  verdict.forEach((v) => console.log(`  ${v}`));

  process.exit(verdict.some((v) => v.startsWith("✗")) ? 1 : 0);
}

main();
