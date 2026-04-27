"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChatSocket } from "./use-socket";
import type { ChatMessageEvent } from "@/lib/socket-types";

/**
 * 선택된 룸을 subscribe하고, 새 메시지/룸 갱신 이벤트 도착 시
 * Server Component를 다시 페치(router.refresh)하여 화면 동기화.
 *
 * 후속 최적화 여지(Phase 3.5+):
 *  - router.refresh 대신 messages를 client state로 관리해 즉시 추가
 *  - 낙관적 UI (전송 시 임시 메시지 push, ack 후 id 보정)
 */
export function RealtimeBridge({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { socket } = useChatSocket();

  useEffect(() => {
    let acked = false;

    const handleMessage = (msg: ChatMessageEvent) => {
      if (msg.roomId === roomId) router.refresh();
    };
    const handleRoomUpdated = (data: { roomId: string }) => {
      if (data.roomId === roomId) router.refresh();
    };

    socket.emit("chat:subscribe", { roomId }, (res) => {
      acked = true;
      if (!res.ok) {
        console.warn(`[chat:subscribe ${roomId}] ${res.error}`);
      }
    });

    socket.on("chat:message", handleMessage);
    socket.on("chat:room-updated", handleRoomUpdated);

    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:room-updated", handleRoomUpdated);
      if (acked) socket.emit("chat:unsubscribe", { roomId });
    };
  }, [roomId, socket, router]);

  return null;
}
