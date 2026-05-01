"use client";

import { useEffect, useState } from "react";
import { getChatSocket, type ChatSocket } from "@/lib/socket-client";
import { useSocketToken } from "@/lib/socket-token-context";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

/**
 * 채팅 소켓 React hook.
 * - 컴포넌트 마운트 시 싱글톤 socket 가져옴 (재마운트되어도 연결 유지)
 * - 연결 상태를 state로 노출
 * - 구체적인 이벤트 구독은 호출자가 socket.on(...) 으로 직접 등록
 */
export function useChatSocket() {
  const [state, setState] = useState<ConnectionState>("connecting");
  const token = useSocketToken();
  const [socket] = useState<ChatSocket>(() => getChatSocket(token));

  useEffect(() => {
    const onConnect = () => setState("connected");
    const onDisconnect = () => setState("disconnected");
    const onConnectError = () => setState("error");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    if (socket.connected) setState("connected");
    else if (!socket.active) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [socket]);

  return { socket, state };
}
