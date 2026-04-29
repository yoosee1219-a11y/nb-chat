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

// ─── 카드 페이로드 (Phase 5.7) ─────────────────────────
// CardType별 형태가 다르지만 클라/서버 둘 다 JSON으로 다룸 (강타입은 컴포넌트단)
// PLAN: { planId, name, monthlyFee, dataAllowance, voiceMinutes, commitment }
// VIDEO: { url, thumbnail, title }
// PROFILE: { applicantId, name, nationality, language }
// HOUSING: { title, region, link }
// RESUME: { fields: { name, age, ... } }
// GENERIC: { title, body, link?, image? }
export type CardType =
  | "RESUME"
  | "HOUSING"
  | "PROFILE"
  | "VIDEO"
  | "PLAN"
  | "GENERIC";

export type CardPayload = Record<string, unknown>;

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
  // Phase 5.7 — 입력 중 / 읽음 표시
  "chat:typing": (payload: { roomId: string; isTyping: boolean }) => void;
  "chat:read": (
    payload: { roomId: string; lastMessageId?: string }
  ) => void;
  // Phase 5.8 — 메시지 수정/삭제 (매니저 본인 메시지에 한정)
  "chat:edit": (
    payload: { roomId: string; messageId: string; originalText: string; language: string },
    ack: (res: Ack) => void
  ) => void;
  "chat:delete": (
    payload: { roomId: string; messageId: string },
    ack: (res: Ack) => void
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
  type: "TEXT" | "IMAGE" | "FILE" | "CARD";
  originalText: string;
  language: string; // BCP-47 underscore variant (KO_KR, RU_RU, ...)
  attachments?: Attachment[];
  // CARD 메시지 전용 (type === "CARD"일 때만 사용)
  cardType?: CardType;
  cardPayload?: CardPayload;
};

// ─── 서버 → 클라이언트 ─────────────────────────────
export interface ServerToClientEvents {
  "chat:message": (msg: ChatMessageEvent) => void;
  "chat:room-updated": (data: RoomUpdatedEvent) => void;
  // Phase 5.7
  "chat:typing": (data: TypingEvent) => void;
  "chat:read": (data: ReadEvent) => void;
  // Phase 5.8 — 메시지 수정/삭제 broadcast
  "chat:message-updated": (data: MessageUpdatedEvent) => void;
  "chat:message-deleted": (data: MessageDeletedEvent) => void;
}

export type MessageUpdatedEvent = {
  roomId: string;
  messageId: string;
  originalText: string | null;
  language: string | null;
  translatedText: string | null;
  editedAt: string; // ISO
};

export type MessageDeletedEvent = {
  roomId: string;
  messageId: string;
  deletedAt: string; // ISO
};

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
  cardType: CardType | null;
  cardPayload: CardPayload | null;
  createdAt: string; // ISO
};

export type RoomUpdatedEvent = {
  roomId: string;
  lastMessageAt: string; // ISO
  unreadCount: number;
};

export type TypingEvent = {
  roomId: string;
  senderKind: "manager" | "applicant";
  senderId: string | null;
  isTyping: boolean;
};

export type ReadEvent = {
  roomId: string;
  readerKind: "manager" | "applicant";
  readerId: string | null;
  readAt: string; // ISO
  lastMessageId: string | null;
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
