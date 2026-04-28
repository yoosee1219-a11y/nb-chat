import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 유입 추적 진입 URL — Phase 5.2
 *
 * GET /r/[code]?campaign=xxx&medium=banner&utm_campaign=...&utm_medium=...
 *
 * 동작:
 *  1. partner code 검증 (활성 거래처만)
 *  2. fics_source 쿠키에 source 정보 JSON 저장 (30일)
 *     - partnerId, partnerCode, campaign, medium, referrer, landedAt
 *  3. /apply로 리다이렉트 (자체 가입 랜딩)
 *
 * 보안/개인정보:
 *  - 쿠키는 httpOnly X (클라이언트 분석 가능하게) / secure는 prod에서만 / sameSite=lax (외부 유입 OK)
 *  - 30일 후 자동 만료 — 마지막 유입 source가 우세 (last-touch attribution)
 *
 * 참고:
 *  - utm_campaign / utm_medium 표준 + campaign/medium 단축형 모두 허용
 *  - Referer 헤더는 신뢰할 수 없으므로 best-effort
 */

const COOKIE_NAME = "fics_source";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = req.nextUrl;

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

  const campaign =
    url.searchParams.get("utm_campaign") ?? url.searchParams.get("campaign");
  const medium =
    url.searchParams.get("utm_medium") ?? url.searchParams.get("medium");
  const referrer = req.headers.get("referer") || null;

  const sourceData = {
    partnerId: resolvedPartnerId,
    partnerCode: resolvedCode,
    campaign,
    medium,
    referrer,
    landedAt: new Date().toISOString(),
  };

  // /apply로 리다이렉트, 쿠키 세팅
  const redirectUrl = new URL("/apply", req.url);
  // 디버깅 편의 — 쿼리에도 partner 노출 (UI에서 어떤 거래처로 들어왔는지 보여주기 용)
  redirectUrl.searchParams.set("from", resolvedCode);

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(COOKIE_NAME, JSON.stringify(sourceData), {
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // httpOnly 안 함 — 클라이언트 측에서 분석 픽셀 등에 활용 가능하도록
  });
  return res;
}

export const dynamic = "force-dynamic";
