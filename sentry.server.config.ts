/**
 * Sentry 서버 설정 (Next.js RSC + API routes)
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.05,
    // /r/[code] 같은 트래픽 폭주 라우트는 샘플링 더 낮춤
    tracesSampler: (ctx) => {
      const url: string | undefined = ctx?.request?.url;
      if (url?.includes("/r/")) return 0.01; // 1%
      if (url?.includes("/api/health")) return 0; // health check은 추적 X
      return 0.05;
    },
    ignoreErrors: ["UNAUTHENTICATED", "FORBIDDEN"],
  });
}
