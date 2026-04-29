/**
 * Sentry Edge runtime 설정 (middleware)
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.05,
    ignoreErrors: ["UNAUTHENTICATED", "FORBIDDEN"],
  });
}
