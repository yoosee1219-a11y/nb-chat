/**
 * 소켓 핸드셰이크 인증 — 매니저(fics_session) + 신청자(룸-바운드 토큰) 동시 지원.
 *
 * standalone socket 서버와 Next.js 양쪽에서 import 가능해야 하므로 server-only X.
 * jose만 사용 — DB 의존 없음.
 */

import { jwtVerify } from "jose";

export type ManagerTokenClaim = {
  kind: "manager";
  managerId: string;
  email: string;
  role: string;
};

export type ApplicantTokenClaim = {
  kind: "applicant";
  roomId: string;
  applicantId: string;
  language: string;
};

export type AnyTokenClaim = ManagerTokenClaim | ApplicantTokenClaim;

export async function verifyAnyToken(
  token: string,
  secret: Uint8Array
): Promise<AnyTokenClaim | null> {
  try {
    const { payload } = await jwtVerify(token, secret);

    // 신청자 토큰 (kind: "applicant" 명시 claim 있음)
    if (payload.kind === "applicant") {
      const roomId = payload.roomId as string | undefined;
      const applicantId = payload.applicantId as string | undefined;
      const language = payload.language as string | undefined;
      if (!roomId || !applicantId || !language) return null;
      return { kind: "applicant", roomId, applicantId, language };
    }

    // 매니저 세션 토큰 (kind 없음 — 기존 호환)
    const managerId = payload.managerId as string | undefined;
    const email = payload.email as string | undefined;
    const role = payload.role as string | undefined;
    if (!managerId || !email || !role) return null;
    return { kind: "manager", managerId, email, role };
  } catch {
    return null;
  }
}
