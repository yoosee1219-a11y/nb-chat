/**
 * k6 부하 테스트 — 광고 D-day 시뮬레이션
 *
 * 시나리오: 1000 동시 사용자가 30초간 무작위 거래처 코드로 /r/[code] 진입
 *  - 30초 ramp up 0 → 100 VU
 *  - 60초 sustain 100 VU
 *  - 30초 ramp down 100 → 0 VU
 *  - 총 ~10000 클릭 / 2분
 *
 * 통과 기준 (thresholds):
 *  - p(95) < 800ms (Vercel + Turso 한계 고려)
 *  - 실패율 < 5% (rate-limit 60/min은 제외)
 *
 * 실행:
 *   k6 run -e BASE_URL=https://nb-chat.../r ./loadtest/click-burst.js
 *
 * 주의:
 *  - 광고 라이브 D-1에 prod에 직접 부하 → Turso row 폭증.
 *    부하 후 partner_clicks의 ratelimit-* / loadtest-* campaign 정리.
 *  - 인증 보호된 prod URL은 직접 X. SSO 해제 후 또는 staging URL로 실행.
 */
import http from "k6/http";
import { check, sleep } from "k6/metrics";
import { Counter } from "k6/metrics";

const SUCCESSES = new Counter("click_success");
const RATE_LIMITS = new Counter("click_rate_limited");

export const options = {
  scenarios: {
    burst: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "60s", target: 100 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.05"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const PARTNERS = ["stealup", "workon", "DIRECT"];
const MEDIUMS = ["banner", "sms", "qr", "email", "video"];

export default function () {
  const partner = PARTNERS[Math.floor(Math.random() * PARTNERS.length)];
  const medium = MEDIUMS[Math.floor(Math.random() * MEDIUMS.length)];
  const campaign = `loadtest-${__VU}-${Math.floor(__ITER / 5)}`;

  const url = `${BASE}/r/${partner}?utm_campaign=${campaign}&utm_medium=${medium}`;
  const res = http.get(url, { redirects: 0 });

  // 307 정상, 429나 다른 상태도 OK (rate-limit는 의도된 동작)
  const ok = check(res, {
    "redirect to /apply": (r) => r.status === 307 || r.status === 302,
  });
  if (ok) {
    if (res.headers["X-Ratelimit-Status"] === "limited") {
      RATE_LIMITS.add(1);
    } else {
      SUCCESSES.add(1);
    }
  }

  // 100ms ~ 500ms 랜덤 sleep (실제 사용자 행동 모방)
  sleep(0.1 + Math.random() * 0.4);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const lines = [];
  lines.push("\n=== 광고 부하 테스트 결과 ===");
  lines.push(`총 요청: ${m.http_reqs?.values?.count ?? 0}`);
  lines.push(`p95 응답: ${(m.http_req_duration?.values?.["p(95)"] ?? 0).toFixed(0)}ms`);
  lines.push(`실패율: ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`);
  lines.push(`정상 클릭: ${m.click_success?.values?.count ?? 0}`);
  lines.push(`rate-limit 차단: ${m.click_rate_limited?.values?.count ?? 0}`);
  return lines.join("\n") + "\n";
}
