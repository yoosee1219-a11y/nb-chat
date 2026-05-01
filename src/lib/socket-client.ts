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
 * 인증:
 *  - 1차: handshake.auth.token (cross-site 환경에서 필수 — Vercel ↔ Railway)
 *  - 2차: same-site 쿠키 (withCredentials: true) — dev/same-domain prod 폴백
 *
 * 확장:
 *  - URL은 NEXT_PUBLIC_SOCKET_URL 환경변수로 주입 (배포 환경 분리)
 *  - 자동 재연결 + exponential backoff (socket.io 디폴트로 충분)
 */

let cached: ChatSocket | null = null;

/**
 * 매니저용 소켓 (token-in-handshake + 쿠키 폴백).
 * 싱글톤 — 어드민 SPA 내에서 한 번만 연결.
 *
 * @param token  서버 컴포넌트(layout)에서 발급한 매니저 단기 JWT.
 *               cross-origin (Vercel ↔ Railway)에서 SameSite=Strict 쿠키가
 *               전송 안 되므로 필수. dev/same-origin엔 미전달 시 쿠키로 폴백.
 */
export function getChatSocket(token?: string | null): ChatSocket {
  if (cached) return cached;

  const baseUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4001";

  cached = io(`${baseUrl}${CHAT_NAMESPACE}`, {
    withCredentials: true,
    auth: token ? { token } : undefined,
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

/**
 * 신청자용 소켓 (룸 토큰 인증).
 * 싱글톤 X — 페이지마다 새로 연결 (토큰이 룸-바운드라 cross-room 재사용 불가).
 */
export function createApplicantSocket(token: string): ChatSocket {
  const baseUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4001";

  return io(`${baseUrl}${CHAT_NAMESPACE}`, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
  }) as ChatSocket;
}
