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

  const token = await new SignJWT({ ...payload, kind: "manager" })
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
    // kind 가드 — applicant 룸 토큰을 매니저 세션으로 위장 차단
    if (payload.kind !== "manager") return null;
    const managerId = payload.managerId;
    const email = payload.email;
    const name = payload.name;
    const role = payload.role;
    if (
      typeof managerId !== "string" ||
      !managerId ||
      typeof email !== "string" ||
      !email ||
      typeof name !== "string" ||
      typeof role !== "string" ||
      !role
    ) {
      return null;
    }
    return { managerId, email, name, role };
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
    if (payload.kind !== "manager") return null;
    const managerId = payload.managerId;
    const email = payload.email;
    const name = payload.name;
    const role = payload.role;
    if (
      typeof managerId !== "string" ||
      !managerId ||
      typeof email !== "string" ||
      !email ||
      typeof name !== "string" ||
      typeof role !== "string" ||
      !role
    ) {
      return null;
    }
    return { managerId, email, name, role };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/**
 * 매니저 socket 단기 토큰 (cross-origin handshake 용).
 * 24h — 페이지 로드마다 layout에서 새로 발급되므로 사실상 세션 길이만큼만 유효.
 *
 * cross-site cookie(SameSite=Strict)가 Railway socket 도메인으로 안 가서
 * 토큰을 명시적으로 auth.token에 박아 보낸다.
 */
const SOCKET_TOKEN_TTL = 60 * 60 * 24; // 24h

export async function signSocketToken(
  session: SessionPayload
): Promise<string> {
  return new SignJWT({ ...session, kind: "manager" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SOCKET_TOKEN_TTL}s`)
    .sign(getSecret());
}

// ─── 신청자 룸 토큰 (Phase 4.4) ────────────────────────────────────
// 고객 URL `/c/[roomId]` 진입 시 서버 컴포넌트에서 발급.
// 소켓 핸드셰이크에서 검증. 룸-바운드 — 다른 룸 접근 불가.
export type ApplicantTokenPayload = {
  kind: "applicant";
  roomId: string;
  applicantId: string;
  language: string;
};

const APPLICANT_TOKEN_TTL = 60 * 60 * 24; // 24h

export async function signApplicantToken(
  payload: Omit<ApplicantTokenPayload, "kind">
): Promise<string> {
  return new SignJWT({ ...payload, kind: "applicant" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${APPLICANT_TOKEN_TTL}s`)
    .sign(getSecret());
}

export async function verifyApplicantToken(
  token: string
): Promise<ApplicantTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.kind !== "applicant") return null;
    return {
      kind: "applicant",
      roomId: payload.roomId as string,
      applicantId: payload.applicantId as string,
      language: payload.language as string,
    };
  } catch {
    return null;
  }
}
