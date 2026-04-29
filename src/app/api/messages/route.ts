/**
 * 메시지 페이지네이션 API — Phase 5.8
 *
 * GET /api/messages?roomId=X&before=ISO&limit=50
 *  - before: 이 시각보다 오래된 메시지만 (cursor)
 *  - limit: 1~100, 기본 50
 *
 * 권한:
 *  - 매니저 세션 쿠키만 허용 (신청자 페이지는 RSC로 한 번에 100개 받음 — 모바일 UX)
 *  - ADMIN: 모든 룸. MANAGER/VIEWER: 본인 담당 또는 미배정 룸
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const roomId = searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ error: "ROOM_ID_REQUIRED" }, { status: 400 });

  // 권한 검증 — 룸 접근 가능 여부
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { managerId: true },
  });
  if (!room) return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  const isAccessible =
    session.role === "ADMIN" ||
    room.managerId === null ||
    room.managerId === session.managerId;
  if (!isAccessible) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // 파라미터 파싱
  const before = searchParams.get("before");
  let limit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // before 파싱 (ISO)
  let beforeDate: Date | undefined;
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) beforeDate = d;
  }

  const messages = await prisma.message.findMany({
    where: {
      roomId,
      ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      senderType: true,
      senderId: true,
      type: true,
      originalText: true,
      language: true,
      translatedText: true,
      attachments: true,
      cardType: true,
      cardPayload: true,
      isRead: true,
      editedAt: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  // 화면은 asc니까 reverse
  const ordered = [...messages].reverse();
  const hasMore = messages.length === limit;

  return NextResponse.json({
    messages: ordered.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
    })),
    hasMore,
    nextCursor: ordered.length > 0 ? ordered[0].createdAt.toISOString() : null,
  });
}

export const dynamic = "force-dynamic";
