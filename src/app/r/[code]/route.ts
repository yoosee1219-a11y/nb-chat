import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { signSourceCookie, type SourcePayload } from "@/lib/source-cookie";

/**
 * 유입 추적 진입 URL — Phase 5.2 + 5.7
 *
 * GET /r/[code]?campaign=xxx&medium=banner&utm_campaign=...&utm_medium=...
 *
 * 동작:
 *  1. partner code 검증 (활성 거래처만)
 *  2. fics_source 쿠키 = last-touch (30일)
 *  3. fics_source_first 쿠키 = first-touch (1년, 한 번만 set, overwrite X)
 *  4. PartnerClick raw 로그 INSERT (전환율 분석)
 *  5. /apply로 리다이렉트
 *
 * 보안/개인정보:
 *  - IP는 sha256(ip + AUTH_SECRET) 으로만 저장 (raw IP 비저장)
 *  - User-Agent는 200자 cap
 *  - 쿠키는 httpOnly X (클라 분석 가능) / secure prod / sameSite=lax
 *
 * 참고:
 *  - utm_campaign / utm_medium 표준 + campaign/medium 단축형 모두 허용
 *  - Referer 헤더는 신뢰할 수 없으므로 best-effort
 */

const COOKIE_LAST = "fics_source";
const COOKIE_LAST_MAX_AGE = 60 * 60 * 24 * 30; // 30일
const COOKIE_FIRST = "fics_source_first";
const COOKIE_FIRST_MAX_AGE = 60 * 60 * 24 * 365; // 1년
const COOKIE_SESSION = "fics_session";
const COOKIE_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // 비정상 운영 — raw IP 저장 거부, 대신 IP 자체 그대로 짧게 해시 (rate limit은 작동)
      // 이렇게 하면 광고비 loss는 막고, 비식별 수준은 dev secret보다 약하지만 raw IP보단 안전
      return crypto
        .createHash("sha256")
        .update(`${ip}:emergency-no-secret-${process.env.VERCEL_GIT_COMMIT_SHA ?? ""}`)
        .digest("hex")
        .slice(0, 32);
    }
    return crypto
      .createHash("sha256")
      .update(`${ip}:dev-only-not-secret`)
      .digest("hex")
      .slice(0, 32);
  }
  return crypto
    .createHash("sha256")
    .update(`${ip}:${secret}`)
    .digest("hex")
    .slice(0, 32);
}

function pickIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = req.nextUrl;

  // ─── Rate limit (Phase 5.8) — 봇/스팸 방지
  // 같은 IP 해시가 1분 내 60회 이상 클릭하면 차단 (광고 트래픽 평균은 분당 수십 미만)
  // PartnerClick 자체를 데이터로 쓰니 추가 의존성 X.
  // 단순화: 차단 시 partner_clicks INSERT 자체를 skip + 쿠키도 set 안 함 → 봇은 추적 데이터 오염 X
  const ipForLimit = pickIp(req);
  const ipHashForLimit = hashIp(ipForLimit);
  const RATE_WINDOW_MS = 60_000;
  const RATE_MAX = 60;
  let isRateLimited = false;
  if (ipHashForLimit) {
    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const recent = await prisma.partnerClick.count({
      where: { ipHash: ipHashForLimit, createdAt: { gte: since } },
    });
    if (recent >= RATE_MAX) {
      isRateLimited = true;
      console.warn(
        `[/r/${code}] rate-limited ipHash=${ipHashForLimit.slice(0, 8)}... recent=${recent}`
      );
    }
  }

  // 거래처 검증
  const partner = await prisma.partner.findUnique({
    where: { code },
    select: { id: true, code: true, isActive: true },
  });

  // 미존재/비활성 → 자체광고 fallback (DIRECT)
  let resolvedPartnerId: string | null = null;
  let resolvedCode = code;
  if (partner && partner.isActive) {
    resolvedPartnerId = partner.id;
    resolvedCode = partner.code;
  } else {
    const direct = await prisma.partner.findUnique({
      where: { code: "DIRECT" },
      select: { id: true },
    });
    if (direct) {
      resolvedPartnerId = direct.id;
      resolvedCode = "DIRECT";
    }
  }

  // 길이 제한 — 쿠키 4KB 한도 + DB 안전 + 잠재적 poisoning 차단
  const truncate = (v: string | null, max: number) =>
    v ? v.slice(0, max) : null;

  const campaign = truncate(
    url.searchParams.get("utm_campaign") ?? url.searchParams.get("campaign"),
    100
  );
  const medium = truncate(
    url.searchParams.get("utm_medium") ?? url.searchParams.get("medium"),
    50
  );
  const referrer = truncate(req.headers.get("referer") || null, 500);
  const userAgent = truncate(req.headers.get("user-agent") || null, 200);
  const ipHash = ipHashForLimit;

  const landedAt = new Date().toISOString();
  const lastTouch: SourcePayload = {
    partnerId: resolvedPartnerId,
    partnerCode: resolvedCode,
    campaign,
    medium,
    referrer,
    landedAt,
  };
  const signedLast = signSourceCookie(lastTouch);

  // 세션 식별자 — 같은 사용자의 중복 클릭 묶기
  const existingSession = req.cookies.get(COOKIE_SESSION)?.value;
  const sessionId = existingSession ?? crypto.randomUUID();

  // raw 클릭 로그 INSERT (rate-limited면 skip — 봇 트래픽 데이터 오염 방지)
  if (!isRateLimited) {
    prisma.partnerClick
      .create({
        data: {
          partnerId: resolvedPartnerId,
          originalCode: code.slice(0, 100),
          campaign,
          medium,
          referrer,
          ipHash,
          userAgent,
          sessionId,
        },
      })
      .catch((err) => {
        console.error("[/r/[code]] click log 실패:", err);
      });
  }

  // rate-limited면 추적 쿠키 set 안 하고 그냥 /apply로 보냄 (광고 도달 자체는 보존)
  // → 봇이 들어와도 가입 시 sourcePartnerId가 null/DIRECT가 되어 정산 데이터 깨끗
  if (isRateLimited) {
    const r = NextResponse.redirect(new URL("/apply", req.url));
    r.headers.set("X-RateLimit-Status", "limited");
    return r;
  }

  // /apply로 리다이렉트
  const redirectUrl = new URL("/apply", req.url);
  redirectUrl.searchParams.set("from", resolvedCode);

  const res = NextResponse.redirect(redirectUrl);

  // last-touch — 매번 갱신 (HMAC 서명 적용)
  // httpOnly 활성화 — 클라이언트 분석 픽셀 호환성보다 위변조 차단이 우선
  res.cookies.set(COOKIE_LAST, signedLast, {
    maxAge: COOKIE_LAST_MAX_AGE,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
  });

  // first-touch — 이미 있으면 건너뜀 (덮어쓰기 X)
  const firstExisting = req.cookies.get(COOKIE_FIRST)?.value;
  if (!firstExisting) {
    res.cookies.set(COOKIE_FIRST, signedLast, {
      maxAge: COOKIE_FIRST_MAX_AGE,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
    });
  }

  // 세션 쿠키 — 처음 진입 시에만 set
  if (!existingSession) {
    res.cookies.set(COOKIE_SESSION, sessionId, {
      maxAge: COOKIE_SESSION_MAX_AGE,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
    });
  }

  return res;
}

export const dynamic = "force-dynamic";
