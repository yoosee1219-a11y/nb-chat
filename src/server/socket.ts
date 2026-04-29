/**
 * Standalone Socket.IO 서버 — Phase 4.4
 *
 * 실행: npm run dev:socket
 *
 * 변경점 (Phase 4.4):
 *  - 신청자(APPLICANT) 핸드셰이크 추가 — 룸-바운드 토큰
 *  - APPLICANT 메시지 발신 + 자동번역 (KO 매니저용)
 *  - 첫 APPLICANT 메시지에 대해 PUBLISHED 챗봇 플로우 자동 실행
 *  - 챗봇 emit 메시지를 SYSTEM senderType으로 저장 + broadcast
 *
 * 확장성:
 *  1. namespace `/chat` (멀티테넌트는 `/${tenant}-chat` 으로)
 *  2. REDIS_URL 있으면 redis-adapter (멀티노드 broadcast)
 *  3. 번역/LLM은 lib/translation, lib/llm 어댑터로 위임
 *  4. 인증은 lib/socket-auth로 분리 (Next + standalone 공유)
 */

import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { translateForPeer } from "../lib/translation";
import { verifyAnyToken } from "../lib/socket-auth";
import { executeFlow, type ApplicantContext } from "../lib/flow-runtime";
import {
  CHAT_NAMESPACE,
  type ChatMessageEvent,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SendMessageInput,
  type SocketData,
} from "../lib/socket-types";
import type { Edge, Node } from "@xyflow/react";
import type { AnyNodeData } from "../app/(admin)/chatbot-flow/[id]/node-types";

// Railway/Heroku/Render 등은 PORT 환경변수를 자동 주입.
// 로컬 dev는 SOCKET_PORT=4001 (.env). 둘 다 지원.
const PORT = Number(process.env.PORT ?? process.env.SOCKET_PORT ?? 4001);
const ALLOWED_ORIGINS = (
  process.env.SOCKET_ALLOWED_ORIGINS ?? "http://localhost:3000"
).split(",");

if (!process.env.AUTH_SECRET) {
  console.error("✗ AUTH_SECRET 환경변수가 없습니다. .env 확인.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL 환경변수가 없습니다. .env 확인.");
  process.exit(1);
}

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

const dbUrl = process.env.DATABASE_URL!;
let dbAdapter;
if (dbUrl.startsWith("libsql:") || dbUrl.startsWith("https:")) {
  let cleanUrl = dbUrl;
  let authToken = process.env.DATABASE_AUTH_TOKEN;
  try {
    const u = new URL(dbUrl);
    const tokenFromQuery = u.searchParams.get("authToken");
    if (tokenFromQuery) {
      authToken = tokenFromQuery;
      u.searchParams.delete("authToken");
      cleanUrl = u.toString();
    }
  } catch {}
  dbAdapter = new PrismaLibSql({ url: cleanUrl, authToken });
} else {
  dbAdapter = new PrismaBetterSqlite3({ url: dbUrl });
}
const prisma = new PrismaClient({
  adapter: dbAdapter,
  log: ["error", "warn"],
});

// ─── HTTP + Socket.IO ────────────────────────────────────────────
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "nb-chat-socket", port: PORT }));
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

const chatNs = io.of(CHAT_NAMESPACE);

// ─── 인증 미들웨어 ──────────────────────────────────────────────
const SESSION_COOKIE = "fics_session";

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((kv) => {
      const idx = kv.indexOf("=");
      const key = (idx === -1 ? kv : kv.slice(0, idx)).trim();
      const value = idx === -1 ? "" : decodeURIComponent(kv.slice(idx + 1).trim());
      return [key, value];
    })
  );
}

chatNs.use(async (socket, next) => {
  try {
    // 1차: 쿠키 (매니저 same-site)
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    let token: string | undefined = cookies[SESSION_COOKIE];

    // 2차: handshake.auth (신청자 룸 토큰 / cross-site 매니저)
    if (!token) {
      const auth = socket.handshake.auth as { token?: string };
      token = auth?.token;
    }
    if (!token) return next(new Error("UNAUTHENTICATED"));

    const claim = await verifyAnyToken(token, SECRET);
    if (!claim) return next(new Error("INVALID_TOKEN"));

    socket.data = claim as SocketData;
    next();
  } catch {
    next(new Error("INVALID_TOKEN"));
  }
});

// ─── 도메인 헬퍼 ────────────────────────────────────────────────
const roomKey = (roomId: string) => `room:${roomId}`;

async function canAccessRoom(
  roomId: string,
  data: SocketData
): Promise<boolean> {
  if (data.kind === "applicant") {
    return data.roomId === roomId; // 룸-바운드
  }
  // manager — VIEWER도 read는 가능 (담당/미배정 룸)
  if (data.role === "ADMIN") return true;
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { managerId: true },
  });
  if (!room) return false;
  return room.managerId === null || room.managerId === data.managerId;
}

/**
 * mutation 권한 — VIEWER는 어떤 mutation도 X
 * (chat:send, chat:edit, chat:delete, chat:typing 외 모든 쓰기 작업)
 */
function canMutate(data: SocketData): boolean {
  if (data.kind === "applicant") return true; // 신청자는 본인 룸 mutation OK
  return data.role === "ADMIN" || data.role === "MANAGER";
}

// ─── 챗봇 트리거 ─────────────────────────────────────────────────
// 신청자 메시지가 들어왔을 때, PUBLISHED 챗봇 플로우 1개를 가져와 실행한다.
// MVP 정책: 룸의 messages 수 ≤ 1 (방금 들어온 첫 메시지 1건뿐) 일 때만 트리거.
//   → 사람 매니저가 합류한 뒤엔 자동 응답 안 함. 단순/예측가능.
async function maybeRunChatbot(input: {
  roomId: string;
  applicantId: string;
  applicantMessage: string;
  applicantLanguage: string;
}) {
  // 트리거 조건 (Phase 5.10):
  //  - 신청자 메시지 정확히 1건 (방금 저장된 첫 메시지)
  //  - 매니저 메시지 0건 (사람 매니저가 합류 전)
  // SYSTEM 환영 메시지는 카운트에서 제외
  const [applicantCount, managerCount] = await Promise.all([
    prisma.message.count({
      where: { roomId: input.roomId, senderType: "APPLICANT" },
    }),
    prisma.message.count({
      where: { roomId: input.roomId, senderType: "MANAGER" },
    }),
  ]);
  if (applicantCount !== 1 || managerCount > 0) return;

  const flow = await prisma.chatbotFlow.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nodesData: true,
      edgesData: true,
    },
  });
  if (!flow) {
    console.log("[chatbot] no PUBLISHED flow — skipping");
    return;
  }

  let nodes: Node<AnyNodeData>[];
  let edges: Edge[];
  try {
    nodes = JSON.parse(flow.nodesData);
    edges = JSON.parse(flow.edgesData);
  } catch (e) {
    console.error("[chatbot] flow JSON parse failed", flow.id, e);
    return;
  }

  const applicant = await prisma.applicant.findUnique({
    where: { id: input.applicantId },
    select: { name: true, nationality: true, status: true },
  });

  const ctx: ApplicantContext = {
    name: applicant?.name ?? "",
    language: input.applicantLanguage,
    nationality: applicant?.nationality ?? "",
    status: applicant?.status ?? undefined,
    message: input.applicantMessage,
  };

  let result;
  try {
    result = await executeFlow(nodes, edges, ctx);
  } catch (e) {
    console.error("[chatbot] executeFlow threw", e);
    return;
  }

  // emit된 메시지를 DB에 저장 + broadcast (senderType=SYSTEM)
  for (const msg of result.emittedMessages) {
    const created = await prisma.message.create({
      data: {
        roomId: input.roomId,
        senderType: "SYSTEM",
        senderId: null,
        type: "TEXT",
        originalText: msg.text,
        language: msg.sourceLanguage,
        translatedText: msg.translatedText,
        isRead: false,
      },
    });
    await prisma.chatRoom.update({
      where: { id: input.roomId },
      data: { lastMessageAt: created.createdAt },
    });
    chatNs.to(roomKey(input.roomId)).emit("chat:message", {
      id: created.id,
      roomId: created.roomId,
      senderType: "SYSTEM",
      senderId: null,
      type: "TEXT",
      originalText: created.originalText,
      language: created.language,
      translatedText: created.translatedText,
      attachments: null,
      cardType: null,
      cardPayload: null,
      createdAt: created.createdAt.toISOString(),
    });
  }

  // 사람 인계 — 룸의 managerId를 null로 두고 unread만 올림
  // (매니저가 픽업하는 정책은 추후 큐 도입 시 정교화)
  if (result.terminatedBy === "escalated") {
    await prisma.chatRoom.update({
      where: { id: input.roomId },
      data: {
        unreadCount: { increment: 1 },
      },
    });
  }

  console.log(
    `[chatbot] flow=${flow.id} term=${result.terminatedBy} steps=${result.steps.length} emit=${result.emittedMessages.length}`
  );
}

// ─── 매니저 자동 룸 가입 (글로벌 알림용) ──────────────────────
// connection 시점에 매니저가 권한 있는 모든 룸에 가입 → 어떤 페이지에 있어도 chat:message 수신
async function autoJoinManagerRooms(socket: {
  data: SocketData;
  join: (room: string) => Promise<void> | void;
}) {
  if (socket.data.kind !== "manager") return;
  const where =
    socket.data.role === "ADMIN"
      ? {}
      : {
          OR: [
            { managerId: null },
            { managerId: socket.data.managerId },
          ],
        };
  const rooms = await prisma.chatRoom.findMany({
    where,
    select: { id: true },
  });
  for (const r of rooms) {
    await socket.join(roomKey(r.id));
  }
  console.log(
    `[socket] manager auto-joined ${rooms.length} rooms (${socket.data.email})`
  );
}

// ─── 핸들러 ──────────────────────────────────────────────────────
chatNs.on("connection", (socket) => {
  const label =
    socket.data.kind === "manager"
      ? socket.data.email
      : `applicant:${socket.data.applicantId}`;
  console.log(`[socket] connect ${label} (${socket.id})`);

  // 매니저면 권한 있는 모든 룸 자동 가입 (백그라운드)
  autoJoinManagerRooms(socket).catch((e) =>
    console.error("[socket] autoJoinManagerRooms failed", e)
  );

  socket.on("chat:subscribe", async ({ roomId }, ack) => {
    try {
      const allowed = await canAccessRoom(roomId, socket.data);
      if (!allowed) return ack({ ok: false, error: "FORBIDDEN" });
      await socket.join(roomKey(roomId));
      ack({ ok: true });
    } catch (err) {
      console.error("[chat:subscribe] error", err);
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  socket.on("chat:unsubscribe", async ({ roomId }) => {
    await socket.leave(roomKey(roomId));
  });

  socket.on("chat:send", async (input: SendMessageInput, ack) => {
    try {
      // VIEWER 등 read-only 역할 차단
      if (!canMutate(socket.data)) {
        return ack({ ok: false, error: "READ_ONLY" });
      }
      const allowedTypes = new Set(["TEXT", "IMAGE", "FILE", "CARD"]);
      if (!allowedTypes.has(input.type)) {
        return ack({ ok: false, error: "INVALID_TYPE" });
      }
      const text = input.originalText?.trim() ?? "";
      const attachments = Array.isArray(input.attachments)
        ? input.attachments
        : [];
      if (input.type === "TEXT" && !text) {
        return ack({ ok: false, error: "EMPTY_TEXT" });
      }
      if ((input.type === "IMAGE" || input.type === "FILE") && attachments.length === 0) {
        return ack({ ok: false, error: "ATTACHMENT_REQUIRED" });
      }
      // 첨부 cap — DB 팽창/DoS 방지 (업로드 자체는 /api/upload에서 10MB cap)
      const MAX_ATTACHMENTS = 10;
      const MAX_ATTACHMENT_NAME = 200;
      if (attachments.length > MAX_ATTACHMENTS) {
        return ack({ ok: false, error: "TOO_MANY_ATTACHMENTS" });
      }
      for (const a of attachments) {
        if (
          !a ||
          typeof a.url !== "string" ||
          typeof a.name !== "string" ||
          typeof a.mimeType !== "string" ||
          typeof a.size !== "number"
        ) {
          return ack({ ok: false, error: "INVALID_ATTACHMENT" });
        }
        if (a.name.length > MAX_ATTACHMENT_NAME) {
          a.name = a.name.slice(0, MAX_ATTACHMENT_NAME);
        }
      }
      // CARD 메시지: cardType + cardPayload 필수, 매니저만 발신 가능
      const allowedCardTypes = new Set([
        "RESUME",
        "HOUSING",
        "PROFILE",
        "VIDEO",
        "PLAN",
        "GENERIC",
      ]);
      const MAX_CARD_PAYLOAD_BYTES = 8_000;
      const MAX_CARD_FIELDS = 30;
      if (input.type === "CARD") {
        if (socket.data.kind !== "manager") {
          return ack({ ok: false, error: "CARD_FORBIDDEN" });
        }
        if (!input.cardType || !allowedCardTypes.has(input.cardType)) {
          return ack({ ok: false, error: "INVALID_CARD_TYPE" });
        }
        // payload는 plain object만. 배열/null/문자열 차단.
        if (
          !input.cardPayload ||
          typeof input.cardPayload !== "object" ||
          Array.isArray(input.cardPayload)
        ) {
          return ack({ ok: false, error: "INVALID_CARD_PAYLOAD" });
        }
        // 필드 수/직렬화 크기 cap — DB 팽창 + DoS 방지
        const keys = Object.keys(input.cardPayload);
        if (keys.length === 0 || keys.length > MAX_CARD_FIELDS) {
          return ack({ ok: false, error: "INVALID_CARD_PAYLOAD_SIZE" });
        }
        let serialized: string;
        try {
          serialized = JSON.stringify(input.cardPayload);
        } catch {
          return ack({ ok: false, error: "INVALID_CARD_PAYLOAD" });
        }
        if (serialized.length > MAX_CARD_PAYLOAD_BYTES) {
          return ack({ ok: false, error: "CARD_PAYLOAD_TOO_LARGE" });
        }
      }
      if (text.length > 4000) return ack({ ok: false, error: "TOO_LONG" });

      // 권한 + 룸 페치
      const room = await prisma.chatRoom.findUnique({
        where: { id: input.roomId },
        include: {
          applicant: { select: { id: true, preferredLanguage: true } },
        },
      });
      if (!room) return ack({ ok: false, error: "ROOM_NOT_FOUND" });

      const allowed = await canAccessRoom(input.roomId, socket.data);
      if (!allowed) return ack({ ok: false, error: "FORBIDDEN" });

      const peerLang = room.applicant.preferredLanguage;
      const isManager = socket.data.kind === "manager";
      const senderType: "MANAGER" | "APPLICANT" = isManager
        ? "MANAGER"
        : "APPLICANT";
      const senderId =
        socket.data.kind === "manager" ? socket.data.managerId : null;

      // 번역은 TEXT/CAPTION만. IMAGE/FILE은 caption(text)이 있을 때만, CARD는 번역 안 함.
      const targetLang = isManager ? peerLang : "KO_KR";
      let translatedText: string | null = null;
      if (text && input.type !== "CARD") {
        const r = await translateForPeer(text, input.language, targetLang);
        translatedText = r.translatedText;
      }

      const attachmentsJson =
        attachments.length > 0 ? JSON.stringify(attachments) : null;
      const cardTypeFinal =
        input.type === "CARD" ? (input.cardType ?? null) : null;
      const cardPayloadJson =
        input.type === "CARD" && input.cardPayload
          ? JSON.stringify(input.cardPayload)
          : null;

      const created = await prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            roomId: input.roomId,
            senderType,
            senderId,
            type: input.type,
            originalText: text || null,
            language: text ? input.language : null,
            translatedText,
            attachments: attachmentsJson,
            cardType: cardTypeFinal,
            cardPayload: cardPayloadJson,
            isRead: isManager,
          },
        });
        const updated = await tx.chatRoom.update({
          where: { id: input.roomId },
          data: {
            lastMessageAt: message.createdAt,
            unreadCount: isManager ? undefined : { increment: 1 },
          },
        });
        // Outbox — 메시지 손실 0 보장 (Phase 5.7)
        // 트랜잭션 안에서 row 생성. 1차 emit 성공 시 이 row만 processedAt 마킹.
        // 동시성: 같은 룸의 다른 in-flight 메시지를 잘못 마킹하지 않도록 row id로 구분.
        const outbox = await tx.outbox.create({
          data: {
            eventType: "MESSAGE_CREATED",
            aggregateId: input.roomId,
            payload: JSON.stringify({
              messageId: message.id,
              roomId: message.roomId,
              senderType,
              senderId,
              type: input.type,
              createdAt: message.createdAt.toISOString(),
            }),
          },
        });
        return { message, room: updated, outboxId: outbox.id };
      });

      const event: ChatMessageEvent = {
        id: created.message.id,
        roomId: created.message.roomId,
        senderType,
        senderId,
        type: input.type,
        originalText: created.message.originalText,
        language: created.message.language,
        translatedText: created.message.translatedText,
        attachments: attachments.length > 0 ? attachments : null,
        cardType: cardTypeFinal,
        cardPayload: input.cardPayload ?? null,
        createdAt: created.message.createdAt.toISOString(),
      };

      chatNs.to(roomKey(input.roomId)).emit("chat:message", event);
      chatNs.to(roomKey(input.roomId)).emit("chat:room-updated", {
        roomId: input.roomId,
        lastMessageAt: event.createdAt,
        unreadCount: created.room.unreadCount,
      });

      // Outbox immediate ack — 정확히 이 메시지의 outbox row만 마킹
      // (워커는 미처리 row만 재방송 — 5초 후에도 unprocessed면 재시도)
      prisma.outbox
        .update({
          where: { id: created.outboxId },
          data: { processedAt: new Date() },
        })
        .catch(() => {
          /* 워커가 재시도할 것 */
        });

      ack({ ok: true, data: { messageId: created.message.id } });

      // 챗봇 트리거 — 신청자 발신 + 첫 메시지일 때만
      if (!isManager) {
        // 비동기 실행 — ack가 늦어지지 않도록 fire-and-forget
        maybeRunChatbot({
          roomId: input.roomId,
          applicantId: room.applicant.id,
          applicantMessage: text,
          applicantLanguage: input.language,
        }).catch((e) => console.error("[chatbot] background error", e));
      }
    } catch (err) {
      console.error("[chat:send] error", err);
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  // Phase 5.7 — Typing indicator
  // 신청자/매니저 모두 emit 가능. 자기 자신을 제외한 룸 멤버에게만 broadcast.
  socket.on("chat:typing", async ({ roomId, isTyping }) => {
    try {
      if (typeof roomId !== "string" || !roomId) return;
      const allowed = await canAccessRoom(roomId, socket.data);
      if (!allowed) return;
      const senderKind = socket.data.kind;
      const senderId =
        socket.data.kind === "manager"
          ? socket.data.managerId
          : socket.data.applicantId;
      socket.to(roomKey(roomId)).emit("chat:typing", {
        roomId,
        senderKind,
        senderId,
        isTyping: !!isTyping,
      });
    } catch (e) {
      console.error("[chat:typing] error", e);
    }
  });

  // Phase 5.7 — Read receipt
  // 룸 진입/스크롤 등에서 emit. DB에 isRead 마킹 + 다른 멤버에게 readAt broadcast.
  socket.on("chat:read", async ({ roomId, lastMessageId }) => {
    try {
      if (typeof roomId !== "string" || !roomId) return;
      const allowed = await canAccessRoom(roomId, socket.data);
      if (!allowed) return;

      const readAt = new Date();
      const readerKind = socket.data.kind;
      const readerId =
        socket.data.kind === "manager"
          ? socket.data.managerId
          : socket.data.applicantId;

      // 매니저가 읽음 → 신청자가 보낸 메시지 isRead 마킹
      // 신청자가 읽음 → 매니저/시스템이 보낸 메시지 isRead 마킹
      const peerSenderType =
        socket.data.kind === "manager" ? "APPLICANT" : "MANAGER";
      await prisma.message.updateMany({
        where: {
          roomId,
          senderType: peerSenderType,
          isRead: false,
        },
        data: { isRead: true, readAt },
      });

      socket.to(roomKey(roomId)).emit("chat:read", {
        roomId,
        readerKind,
        readerId,
        readAt: readAt.toISOString(),
        lastMessageId: lastMessageId ?? null,
      });
    } catch (e) {
      console.error("[chat:read] error", e);
    }
  });

  // Phase 5.8 — 메시지 수정 (매니저 본인 메시지에 한정)
  socket.on("chat:edit", async ({ roomId, messageId, originalText, language }, ack) => {
    try {
      if (socket.data.kind !== "manager") {
        return ack({ ok: false, error: "FORBIDDEN" });
      }
      if (!canMutate(socket.data)) {
        return ack({ ok: false, error: "READ_ONLY" });
      }
      const text = originalText?.trim() ?? "";
      if (!text) return ack({ ok: false, error: "EMPTY_TEXT" });
      if (text.length > 4000) return ack({ ok: false, error: "TOO_LONG" });

      const allowed = await canAccessRoom(roomId, socket.data);
      if (!allowed) return ack({ ok: false, error: "FORBIDDEN" });

      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          roomId: true,
          senderType: true,
          senderId: true,
          type: true,
          deletedAt: true,
        },
      });
      if (!msg || msg.roomId !== roomId)
        return ack({ ok: false, error: "MESSAGE_NOT_FOUND" });
      if (msg.deletedAt) return ack({ ok: false, error: "ALREADY_DELETED" });
      if (msg.senderType !== "MANAGER" || msg.senderId !== socket.data.managerId)
        return ack({ ok: false, error: "NOT_OWNER" });
      if (msg.type !== "TEXT")
        return ack({ ok: false, error: "ONLY_TEXT_EDITABLE" });

      // 신청자 언어로 재번역
      const room = await prisma.chatRoom.findUnique({
        where: { id: roomId },
        select: { applicant: { select: { preferredLanguage: true } } },
      });
      if (!room) return ack({ ok: false, error: "ROOM_NOT_FOUND" });

      const r = await translateForPeer(
        text,
        language,
        room.applicant.preferredLanguage
      );

      const editedAt = new Date();
      await prisma.message.update({
        where: { id: messageId },
        data: {
          originalText: text,
          language,
          translatedText: r.translatedText,
          editedAt,
        },
      });

      chatNs.to(roomKey(roomId)).emit("chat:message-updated", {
        roomId,
        messageId,
        originalText: text,
        language,
        translatedText: r.translatedText,
        editedAt: editedAt.toISOString(),
      });

      ack({ ok: true });
    } catch (err) {
      console.error("[chat:edit] error", err);
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  // Phase 5.8 — 메시지 삭제 (soft-delete, 매니저 본인 메시지에 한정)
  socket.on("chat:delete", async ({ roomId, messageId }, ack) => {
    try {
      if (socket.data.kind !== "manager") {
        return ack({ ok: false, error: "FORBIDDEN" });
      }
      if (!canMutate(socket.data)) {
        return ack({ ok: false, error: "READ_ONLY" });
      }
      const allowed = await canAccessRoom(roomId, socket.data);
      if (!allowed) return ack({ ok: false, error: "FORBIDDEN" });

      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          roomId: true,
          senderType: true,
          senderId: true,
          deletedAt: true,
        },
      });
      if (!msg || msg.roomId !== roomId)
        return ack({ ok: false, error: "MESSAGE_NOT_FOUND" });
      if (msg.deletedAt) return ack({ ok: true }); // 이미 삭제 — idempotent
      // ADMIN이거나 본인 메시지만 삭제 가능
      const isOwner =
        msg.senderType === "MANAGER" && msg.senderId === socket.data.managerId;
      if (!isOwner && socket.data.role !== "ADMIN")
        return ack({ ok: false, error: "NOT_OWNER" });

      const deletedAt = new Date();
      await prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt,
          // 본문 마스킹 — 민감 데이터 비움
          originalText: null,
          translatedText: null,
          attachments: null,
          cardPayload: null,
        },
      });

      chatNs.to(roomKey(roomId)).emit("chat:message-deleted", {
        roomId,
        messageId,
        deletedAt: deletedAt.toISOString(),
      });

      ack({ ok: true });
    } catch (err) {
      console.error("[chat:delete] error", err);
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnect ${label} — ${reason}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(
    `✓ NB Chat socket server: http://localhost:${PORT} (ns=${CHAT_NAMESPACE})`
  );
  console.log(`  AUTH_SECRET: set (${process.env.AUTH_SECRET!.length} chars)`);
  console.log(`  CORS: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log(`  TRANSLATE: ${process.env.GOOGLE_TRANSLATE_API_KEY ? "google v2" : "mock"}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : "mock"}`);
});

// ─── Outbox 워커 — 5초마다 미처리 row 재방송 ────────────────
// 발신 즉시 emit이 1차 broadcast. 그게 실패해 processedAt가 비어 있으면
// 워커가 메시지를 DB에서 다시 읽어 룸에 broadcast.
// 5분 이상 미처리(crash 등) row는 attempts++ 후 재시도, 5회 초과면 lastError 남김.
const OUTBOX_TICK_MS = 5_000;
const OUTBOX_STALE_MS = 5_000; // 1차 emit 실패 추정 임계
const OUTBOX_MAX_ATTEMPTS = 5;

async function processOutbox() {
  const cutoff = new Date(Date.now() - OUTBOX_STALE_MS);
  const rows = await prisma.outbox.findMany({
    where: {
      processedAt: null,
      createdAt: { lte: cutoff },
      attempts: { lt: OUTBOX_MAX_ATTEMPTS },
    },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    try {
      if (row.eventType === "MESSAGE_CREATED") {
        const payload = JSON.parse(row.payload) as {
          messageId: string;
          roomId: string;
        };
        const msg = await prisma.message.findUnique({
          where: { id: payload.messageId },
        });
        if (!msg) {
          // 메시지가 사라졌으면 outbox row 정리
          await prisma.outbox.update({
            where: { id: row.id },
            data: { processedAt: new Date(), lastError: "MESSAGE_GONE" },
          });
          continue;
        }
        chatNs.to(roomKey(msg.roomId)).emit("chat:message", {
          id: msg.id,
          roomId: msg.roomId,
          senderType: msg.senderType as "APPLICANT" | "MANAGER" | "SYSTEM",
          senderId: msg.senderId,
          type: msg.type,
          originalText: msg.originalText,
          language: msg.language,
          translatedText: msg.translatedText,
          attachments: msg.attachments
            ? (JSON.parse(msg.attachments) as ChatMessageEvent["attachments"])
            : null,
          cardType: (msg.cardType ?? null) as ChatMessageEvent["cardType"],
          cardPayload: msg.cardPayload ? JSON.parse(msg.cardPayload) : null,
          createdAt: msg.createdAt.toISOString(),
        });
      }
      await prisma.outbox.update({
        where: { id: row.id },
        data: { processedAt: new Date() },
      });
      console.log(`[outbox] redelivered ${row.eventType} ${row.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : "unknown";
      await prisma.outbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: msg,
        },
      });
      console.error(`[outbox] retry failed ${row.id}:`, msg);
    }
  }
}

const outboxInterval = setInterval(() => {
  processOutbox().catch((e) =>
    console.error("[outbox] tick error", e)
  );
}, OUTBOX_TICK_MS);
outboxInterval.unref?.();

async function shutdown(signal: string) {
  console.log(`\n[${signal}] shutting down...`);
  io.close();
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
