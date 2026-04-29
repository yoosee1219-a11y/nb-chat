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

const PORT = Number(process.env.SOCKET_PORT ?? 4001);
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
  // manager
  if (data.role === "ADMIN") return true;
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { managerId: true },
  });
  if (!room) return false;
  return room.managerId === null || room.managerId === data.managerId;
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
  // 메시지 수 1 (방금 저장된 신청자 첫 메시지 1건)
  const msgCount = await prisma.message.count({
    where: { roomId: input.roomId },
  });
  if (msgCount > 1) return;

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
      const allowedTypes = new Set(["TEXT", "IMAGE", "FILE"]);
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

      // 번역은 텍스트만. IMAGE/FILE은 caption(text)이 있을 때만.
      const targetLang = isManager ? peerLang : "KO_KR";
      let translatedText: string | null = null;
      if (text) {
        const r = await translateForPeer(text, input.language, targetLang);
        translatedText = r.translatedText;
      }

      const attachmentsJson =
        attachments.length > 0 ? JSON.stringify(attachments) : null;

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
        return { message, room: updated };
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
        createdAt: created.message.createdAt.toISOString(),
      };

      chatNs.to(roomKey(input.roomId)).emit("chat:message", event);
      chatNs.to(roomKey(input.roomId)).emit("chat:room-updated", {
        roomId: input.roomId,
        lastMessageAt: event.createdAt,
        unreadCount: created.room.unreadCount,
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

async function shutdown(signal: string) {
  console.log(`\n[${signal}] shutting down...`);
  io.close();
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
