/**
 * 자체 JWT 세션 인증 (NextAuth 의존 X)
 * - jose: Edge runtime 호환 JWT 라이브러리
 * - bcryptjs: 비밀번호 해싱 (Windows 빌드 이슈 없음)
 * - httpOnly + Secure + SameSite=Strict 쿠키
 *
 * Vijob 시스템과 차별화:
 *   - 서버사이드 가드 (middleware)에서 즉시 검증 → 미인증 시 RSC payload 노출 0
 *   - 모든 로그인 액션 AuditLog 기록
 */
import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const COOKIE_NAME = "fics_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7d

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 환경변수가 설정되지 않았습니다.");
  return new TextEncoder().encode(secret);
};

export type SessionPayload = {
  managerId: string;
  email: string;
  name: string;
  role: string;
};

export async function login(
  email: string,
  password: string,
  context?: { ipAddress?: string; userAgent?: string }
): Promise<SessionPayload | null> {
  const manager = await prisma.manager.findUnique({ where: { email } });
  if (!manager || !manager.isActive) return null;

  const valid = await bcrypt.compare(password, manager.passwordHash);
  if (!valid) return null;

  const payload: SessionPayload = {
    managerId: manager.id,
    email: manager.email,
    name: manager.name,
    role: manager.role,
  };

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  await Promise.all([
    prisma.manager.update({
      where: { id: manager.id },
      data: { lastLoginAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        managerId: manager.id,
        action: "LOGIN",
        resource: `manager:${manager.id}`,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
    }),
  ]);

  return payload;
}

export async function logout(): Promise<void> {
  const session = await getSession();
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  if (session) {
    await prisma.auditLog.create({
      data: {
        managerId: session.managerId,
        action: "LOGOUT",
        resource: `manager:${session.managerId}`,
      },
    });
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      managerId: payload.managerId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/**
 * Edge middleware용 — Node API(prisma, cookies) 사용 불가
 * jose만으로 토큰 검증
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      managerId: payload.managerId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
