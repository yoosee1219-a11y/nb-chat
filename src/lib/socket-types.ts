/**
 * Socket.IO 양방향 이벤트 타입 — 클라이언트/서버 공유.
 *
 * 확장성:
 *  - namespace는 `/chat` 고정. 멀티테넌트 가면 `/${tenant}-chat` 으로 바뀜.
 *  - 이벤트 페이로드는 항상 객체로 감싸서 미래 필드 추가 시 호환 유지.
 *  - ack 패턴으로 클라이언트가 서버 처리 결과를 받음 (메시지 손실 추적의 1차 방어선).
 */

export type Ack<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ─── 클라이언트 → 서버 ─────────────────────────────
export interface ClientToServerEvents {
  "chat:subscribe": (
    payload: { roomId: string },
    ack: (res: Ack) => void
  ) => void;
  "chat:unsubscribe": (payload: { roomId: string }) => void;
  "chat:send": (
    payload: SendMessageInput,
    ack: (res: Ack<{ messageId: string }>) => void
  ) => void;
}

export type Attachment = {
  url: string;
  name: string;
  size: number;
  mimeType: string;
};

export type SendMessageInput = {
  roomId: string;
  type: "TEXT" | "IMAGE" | "FILE";
  originalText: string;
  language: string; // BCP-47 underscore variant (KO_KR, RU_RU, ...)
  attachments?: Attachment[];
};

// ─── 서버 → 클라이언트 ─────────────────────────────
export interface ServerToClientEvents {
  "chat:message": (msg: ChatMessageEvent) => void;
  "chat:room-updated": (data: RoomUpdatedEvent) => void;
}

export type ChatMessageEvent = {
  id: string;
  roomId: string;
  senderType: "APPLICANT" | "MANAGER" | "SYSTEM";
  senderId: string | null;
  type: string;
  originalText: string | null;
  language: string | null;
  translatedText: string | null;
  attachments: Attachment[] | null;
  createdAt: string; // ISO
};

export type RoomUpdatedEvent = {
  roomId: string;
  lastMessageAt: string; // ISO
  unreadCount: number;
};

// 서버에 attach되는 socket.data 형태 (discriminated union)
export type SocketData =
  | {
      kind: "manager";
      managerId: string;
      email: string;
      role: string;
    }
  | {
      kind: "applicant";
      applicantId: string;
      roomId: string;
      language: string;
    };

// 클라이언트가 인증 시 전달하는 핸드셰이크
export type SocketHandshakeAuth = {
  token: string; // 매니저 세션 토큰 또는 신청자 룸 토큰
};

export const CHAT_NAMESPACE = "/chat";
