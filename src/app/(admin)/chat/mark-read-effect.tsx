"use client";

import { useEffect, useRef } from "react";
import { markRoomRead } from "./actions";
import { useChatSocket } from "./use-socket";

/**
 * 룸 진입 시 미읽음 자동 처리.
 * RSC에서 mutation을 트리거하지 않기 위해 클라이언트 effect로 분리.
 *
 * Phase 5.7: server action으로 DB isRead를 업데이트하는 것 외에,
 * 소켓 chat:read 이벤트도 emit해서 신청자/다른 매니저에게 실시간 알림.
 */
export function MarkReadEffect({
  roomId,
  unreadCount,
}: {
  roomId: string;
  unreadCount: number;
}) {
  const fired = useRef<string | null>(null);
  const { socket, state } = useChatSocket();

  useEffect(() => {
    if (unreadCount > 0 && fired.current !== roomId) {
      fired.current = roomId;
      markRoomRead(roomId).catch(() => {
        // silent — 다음 진입 시 재시도
        fired.current = null;
      });
    }
    // 소켓 read 이벤트 — DB 업데이트와 별개로 항상 발신
    // (방 진입 = "지금까지 본 것" 신호)
    if (state === "connected") {
      socket.emit("chat:read", { roomId });
    }
  }, [roomId, unreadCount, socket, state]);

  return null;
}
