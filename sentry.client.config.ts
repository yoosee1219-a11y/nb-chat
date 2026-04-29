/**
 * Sentry 클라이언트 설정 (브라우저)
 *
 * DSN 미설정 시 자동 비활성 — 무료 5K events/month 한도 안에서 동작.
 * tracesSampleRate를 광고 라이브 직후엔 0.1로 낮춰 trace event 절약 권장.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

    // 5K events 한도 보호 — 1% 샘플링이 광고 트래픽엔 적정
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.5,

    // 광고 클릭 봇/스파이더 노이즈 컷
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      "ChunkLoadError",
    ],

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
  });
}
