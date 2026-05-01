"use client";

/**
 * 매니저 socket 토큰 컨텍스트.
 *
 * Vercel(웹) ↔ Railway(socket) cross-origin 환경에서 SameSite=Strict 쿠키가
 * 전송되지 않으므로, 서버 컴포넌트(layout)가 단기 매니저 토큰을 발급해
 * 클라이언트로 props 전달 → 이 Provider 거쳐 socket 연결 시 auth.token으로 사용.
 */
import { createContext, useContext, type ReactNode } from "react";

const SocketTokenContext = createContext<string | null>(null);

export function SocketTokenProvider({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  return (
    <SocketTokenContext.Provider value={token}>
      {children}
    </SocketTokenContext.Provider>
  );
}

export function useSocketToken(): string | null {
  return useContext(SocketTokenContext);
}
