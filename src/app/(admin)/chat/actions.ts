"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canMutate } from "@/lib/permissions";

export async function toggleFavorite(roomId: string) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 즐겨찾기를 변경할 수 없습니다." };

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { isFavorite: true },
  });
  if (!room) return { ok: false, error: "채팅방을 찾을 수 없습니다." };

  await prisma.chatRoom.update({
    where: { id: roomId },
    data: { isFavorite: !room.isFavorite },
  });

  await audit({
    managerId: session.managerId,
    action: room.isFavorite ? "ROOM_UNFAVORITED" : "ROOM_FAVORITED",
    resource: `room:${roomId}`,
  });

  revalidatePath("/chat");
  return { ok: true, isFavorite: !room.isFavorite };
}

export async function markRoomRead(roomId: string) {
  const session = await requireSession();

  await prisma.$transaction([
    prisma.message.updateMany({
      where: { roomId, isRead: false, senderType: "APPLICANT" },
      data: { isRead: true, readAt: new Date() },
    }),
    prisma.chatRoom.update({
      where: { id: roomId },
      data: { unreadCount: 0 },
    }),
  ]);

  await audit({
    managerId: session.managerId,
    action: "ROOM_READ",
    resource: `room:${roomId}`,
  });

  revalidatePath("/chat");
  return { ok: true };
}

export async function assignRoomToMe(roomId: string) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 채팅을 담당할 수 없습니다." };

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { managerId: true },
  });
  if (!room) return { ok: false, error: "채팅방을 찾을 수 없습니다." };
  if (room.managerId && room.managerId !== session.managerId) {
    return { ok: false, error: "이미 다른 매니저가 담당 중입니다." };
  }

  await prisma.chatRoom.update({
    where: { id: roomId },
    data: { managerId: session.managerId },
  });

  await audit({
    managerId: session.managerId,
    action: "ROOM_ASSIGNED",
    resource: `room:${roomId}`,
  });

  revalidatePath("/chat");
  return { ok: true };
}
