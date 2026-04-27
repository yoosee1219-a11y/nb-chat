"use client";

import { io, type Socket } from "socket.io-client";
import {
  CHAT_NAMESPACE,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "./socket-types";

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * 브라우저 Socket.IO 클라이언트 싱글톤.
 *
 * 인증: same-site 쿠키 자동 전송 (withCredentials: true).
 *  - dev: localhost:3000 ↔ localhost:4001 (same-site, different-origin)
 *  - prod: 같은 도메인 권장. cross-site 가게 되면 별도 토큰 엔드포인트로 교체.
 *
 * 확장:
 *  - URL은 NEXT_PUBLIC_SOCKET_URL 환경변수로 주입 (배포 환경 분리)
 *  - 자동 재연결 + exponential backoff (socket.io 디폴트로 충분)
 */

let cached: ChatSocket | null = null;

export function getChatSocket(): ChatSocket {
  if (cached) return cached;

  const baseUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4001";

  cached = io(`${baseUrl}${CHAT_NAMESPACE}`, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
  }) as ChatSocket;

  return cached;
}

export function disconnectChatSocket() {
  if (cached) {
    cached.disconnect();
    cached = null;
  }
}
