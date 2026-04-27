import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Next.js 16 Proxy (구 middleware)
 * 출처: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
 *
 * Vijob의 핵심 약점 해결:
 *   미인증 상태에서 /dashboard, /chat 등이 200 응답 → RSC payload 노출 가능성
 *   Proxy에서 optimistic check (토큰 존재 + 유효성)
 *   layout.tsx에서도 한 번 더 getSession() 검증 (권장 패턴)
 *
 * Edge runtime이라 Prisma/cookies()는 못 쓰고 jose로만 토큰 검증
 */

const PUBLIC_PATHS = ["/login", "/api/health"];

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(secret);
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 공개 경로
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // 세션 쿠키 확인
  const token = req.cookies.get("fics_session")?.value;

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    // 토큰 invalid/expired → 쿠키 삭제 + 로그인으로
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("fics_session");
    return res;
  }
}

export const config = {
  matcher: [
    /*
     * 정적 자산과 API 헬스 외 모든 경로 가드
     */
    "/((?!api/health|_next/static|_next/image|favicon|logo|opengraph-image).*)",
  ],
};
