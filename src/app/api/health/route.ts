/**
 * 헬스체크 엔드포인트 — Phase 5.10
 *
 * GET /api/health
 *  - DB 연결 확인 (간단 SELECT)
 *  - Socket 서버 ping (NEXT_PUBLIC_SOCKET_URL 호출)
 *  - 빌드 SHA + 환경 + 응답시간 반환
 *
 * 외부 모니터링 (UptimeRobot, BetterStack 등) 연동:
 *  - 200 OK → 정상
 *  - 503 → 일부 의존성 실패
 *  - 1분 폴링 권장
 *
 * 응답 시간이 길어지면 Vercel Function 비용↑.
 * Sentry tracesSampler에서 health 경로는 0% 샘플링.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SOCKET_TIMEOUT_MS = 2_000;

async function checkSocket(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (!url) return { ok: false, error: "SOCKET_URL_MISSING" };

  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SOCKET_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      // health endpoint는 cache 절대 X
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `HTTP_${res.status}` };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.name : "FETCH_FAILED",
    };
  }
}

async function checkDb(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
  partnersCount?: number;
}> {
  const start = Date.now();
  try {
    // 간단한 read — partners count
    const c = await prisma.partner.count();
    return {
      ok: true,
      latencyMs: Date.now() - start,
      partnersCount: c,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 100) : "DB_FAILED",
    };
  }
}

export async function GET() {
  const requestStart = Date.now();
  const [db, socket] = await Promise.all([checkDb(), checkSocket()]);

  const overall = db.ok && socket.ok;
  const body = {
    status: overall ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    region: process.env.VERCEL_REGION ?? "local",
    checks: {
      db,
      socket,
    },
    totalMs: Date.now() - requestStart,
  };

  return NextResponse.json(body, {
    status: overall ? 200 : 503,
    headers: {
      // 모니터링 도구가 stale 안 받게
      "cache-control": "no-store, max-age=0",
    },
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
