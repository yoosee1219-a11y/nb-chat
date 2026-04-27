"use client";

import { useEffect, useRef } from "react";
import { markRoomRead } from "./actions";

/**
 * 룸 진입 시 미읽음 자동 처리.
 * RSC에서 mutation을 트리거하지 않기 위해 클라이언트 effect로 분리.
 */
export function MarkReadEffect({
  roomId,
  unreadCount,
}: {
  roomId: string;
  unreadCount: number;
}) {
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (unreadCount > 0 && fired.current !== roomId) {
      fired.current = roomId;
      markRoomRead(roomId).catch(() => {
        // silent — 다음 진입 시 재시도
        fired.current = null;
      });
    }
  }, [roomId, unreadCount]);

  return null;
}
