/**
 * 권한 매트릭스 — Phase 5.10
 *
 * 역할:
 *  - ADMIN: 모든 mutation + 매니저/감사 관리
 *  - MANAGER: 채팅/메모/거래처/요금제/신청자 mutation, 본인 담당 룸 또는 미배정
 *  - VIEWER: read-only — 어떤 mutation도 불가
 *
 * 사용:
 *   const session = await getSession();
 *   if (!session) redirect("/login");
 *   if (!canMutate(session)) return { ok: false, error: "READ_ONLY" };
 */

export type SessionRole = "ADMIN" | "MANAGER" | "VIEWER" | string;

export function isAdmin(session: { role: SessionRole } | null | undefined): boolean {
  return session?.role === "ADMIN";
}

export function isViewer(session: { role: SessionRole } | null | undefined): boolean {
  return session?.role === "VIEWER";
}

/**
 * mutation(쓰기) 권한 — VIEWER만 차단.
 * ADMIN/MANAGER 모두 허용.
 */
export function canMutate(session: { role: SessionRole } | null | undefined): boolean {
  if (!session) return false;
  return session.role === "ADMIN" || session.role === "MANAGER";
}

/**
 * 매니저 관리 / 감사 로그 권한 — ADMIN만.
 */
export function canManageOrg(session: { role: SessionRole } | null | undefined): boolean {
  return isAdmin(session);
}

/**
 * 룸 접근 — read 기준. mutation은 별도 canMutate 체크 필요.
 *  - ADMIN: 모든 룸
 *  - MANAGER/VIEWER: 본인 담당 또는 미배정
 */
export function canAccessRoom(
  session: { role: SessionRole; managerId?: string } | null,
  room: { managerId: string | null } | null
): boolean {
  if (!session || !room) return false;
  if (session.role === "ADMIN") return true;
  return room.managerId === null || room.managerId === session.managerId;
}
