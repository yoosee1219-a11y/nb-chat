import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * 보안 헤더 베이스라인
 * 출처: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md
 *
 * Vijob FICS의 미설정 헤더 모두 적용:
 *   - HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP
 *
 * CSP 주석:
 *   - script-src에 'unsafe-inline' 'unsafe-eval' 필요 = Next.js RSC + Turbopack
 *   - connect-src에 ws: wss: = Socket.IO
 *   - connect-src에 NEXT_PUBLIC_SOCKET_URL = standalone 소켓 서버
 *   - connect-src에 translation.googleapis.com = 자동번역 API
 *   - img-src에 https: = 외부 이미지(첨부 파일 CDN)
 */
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4001";
const socketOrigin = (() => {
  try {
    return new URL(socketUrl).origin;
  } catch {
    return "http://localhost:4001";
  }
})();
const wsOrigin = socketOrigin
  .replace(/^http:\/\//, "ws://")
  .replace(/^https:\/\//, "wss://");
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // style: self + inline + Google Fonts + jsDelivr (Pretendard CDN fallback)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      // font: self + data + gstatic + jsDelivr
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
      `connect-src 'self' ${socketOrigin} ${wsOrigin} https://translation.googleapis.com https://translate.googleapis.com https://api.anthropic.com https://api.openai.com https://*.turso.io`,
      "media-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  // Turbopack workspace root — webapp 자체를 root로 (상위에 다른 lockfile 있어도)
  turbopack: {
    root: import.meta.dirname,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry 통합 — DSN 미설정 시 no-op (안전)
const sentryEnabled = !!process.env.SENTRY_DSN;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      // SENTRY_ORG/SENTRY_PROJECT 미설정 시 source map 업로드 자동 skip
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      // 광고 클릭 트래픽이 워낙 많을 거라 source map 업로드는 끄는 게 안전
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },
      // 광고 도메인 ad blocker 우회 — sentry tunnel
      tunnelRoute: "/monitoring",
      disableLogger: true,
    })
  : nextConfig;
