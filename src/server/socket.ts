/**
 * Standalone Socket.IO 서버 (Phase 3.2)
 *
 * 실행: npm run dev:socket
 *
 * 확장성 포인트:
 *  1. namespace `/chat` — 멀티테넌트 시 `/${tenant}-chat` 으로 변경
 *  2. adapter — REDIS_URL 환경변수 있으면 @socket.io/redis-adapter 자동 사용 (멀티노드)
 *  3. 번역 — lib/translation.ts 인터페이스로 위임 (현재 mock, Phase 3.4에서 Google v3)
 *  4. 메시지 저장 — 직접 broadcast (Phase 3.3에서 Outbox + BullMQ로 교체 가능한 구조)
 *  5. 인증 — Next 프로세스가 발급한 JWT(jose, AUTH_SECRET 공유)를 핸드셰이크에서 검증
 */

import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { jwtVerify } from "jose";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { translateForPeer } from "../lib/translation";
import {
  CHAT_NAMESPACE,
  type ChatMessageEvent,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SendMessageInput,
  type SocketData,
} from "../lib/socket-types";

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

// ─── Prisma (이 프로세스 전용 인스턴스) ──────────────────────────
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }),
  log: ["error", "warn"],
});

// ─── HTTP + Socket.IO ────────────────────────────────────────────
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "fics-socket", port: PORT }));
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
  // 추후 Redis adapter 자리:
  // if (process.env.REDIS_URL) {
  //   const pubClient = createClient({ url: process.env.REDIS_URL });
  //   const subClient = pubClient.duplicate();
  //   await Promise.all([pubClient.connect(), subClient.connect()]);
  //   io.adapter(createAdapter(pubClient, subClient));
  // }
});

const chatNs = io.of(CHAT_NAMESPACE);

// ─── 인증 미들웨어 ──────────────────────────────────────────────
// Next 프로세스가 발급한 fics_session 쿠키를 핸드셰이크에서 가져와 jose로 검증.
// 추후 cross-site 배포 시 별도 토큰 엔드포인트로 갈아끼울 수 있게 분리.
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
    // 1차: 쿠키에서 시도 (same-site)
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    let token = cookies[SESSION_COOKIE];

    // 2차: handshake.auth.token (cross-site/네이티브 클라용 — 추후 사용)
    if (!token) {
      const auth = socket.handshake.auth as { token?: string };
      token = auth?.token;
    }
    if (!token) return next(new Error("UNAUTHENTICATED"));

    const { payload } = await jwtVerify(token, SECRET);
    const managerId = payload.managerId as string | undefined;
    const email = payload.email as string | undefined;
    const role = payload.role as string | undefined;

    if (!managerId || !email || !role) {
      return next(new Error("INVALID_TOKEN_PAYLOAD"));
    }

    socket.data = { managerId, email, role };
    next();
  } catch {
    next(new Error("INVALID_TOKEN"));
  }
});

// ─── 도메인 헬퍼 ────────────────────────────────────────────────
const roomKey = (roomId: string) => `room:${roomId}`;

async function canAccessRoom(
  roomId: string,
  managerId: string,
  role: string
): Promise<boolean> {
  if (role === "ADMIN") return true;
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { managerId: true },
  });
  if (!room) return false;
  return room.managerId === null || room.managerId === managerId;
}

// ─── 핸들러 ──────────────────────────────────────────────────────
chatNs.on("connection", (socket) => {
  const { managerId, email } = socket.data;
  console.log(`[socket] connect ${email} (${socket.id})`);

  // ── subscribe ─────────────────────────────────────────────────
  socket.on("chat:subscribe", async ({ roomId }, ack) => {
    try {
      const allowed = await canAccessRoom(roomId, managerId, socket.data.role);
      if (!allowed) return ack({ ok: false, error: "FORBIDDEN" });
      await socket.join(roomKey(roomId));
      ack({ ok: true });
    } catch (err) {
      console.error("[chat:subscribe] error", err);
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  // ── unsubscribe ──────────────────────────────────────────────
  socket.on("chat:unsubscribe", async ({ roomId }) => {
    await socket.leave(roomKey(roomId));
  });

  // ── send ─────────────────────────────────────────────────────
  socket.on("chat:send", async (input: SendMessageInput, ack) => {
    try {
      // 1) 입력 검증
      if (input.type !== "TEXT") {
        return ack({ ok: false, error: "ONLY_TEXT_SUPPORTED_IN_PHASE_3_2" });
      }
      const text = input.originalText?.trim();
      if (!text) return ack({ ok: false, error: "EMPTY_TEXT" });
      if (text.length > 4000) return ack({ ok: false, error: "TOO_LONG" });

      // 2) 권한 + 룸 + 신청자 언어 동시 페치
      const room = await prisma.chatRoom.findUnique({
        where: { id: input.roomId },
        include: {
          applicant: { select: { preferredLanguage: true } },
        },
      });
      if (!room) return ack({ ok: false, error: "ROOM_NOT_FOUND" });
      if (
        socket.data.role !== "ADMIN" &&
        room.managerId !== null &&
        room.managerId !== managerId
      ) {
        return ack({ ok: false, error: "FORBIDDEN" });
      }

      // 3) 번역 (mock — Phase 3.4에서 실제 API)
      const peerLang = room.applicant.preferredLanguage;
      const { translatedText } = await translateForPeer(
        text,
        input.language,
        peerLang
      );

      // 4) DB 저장 + 룸 갱신
      // (Phase 3.3에서 Outbox row를 같은 트랜잭션에 추가 → 워커가 broadcast)
      const created = await prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            roomId: input.roomId,
            senderType: "MANAGER",
            senderId: managerId,
            type: "TEXT",
            originalText: text,
            language: input.language,
            translatedText,
            isRead: true, // 매니저 본인 발신 → 매니저 측 읽음
          },
        });
        const updated = await tx.chatRoom.update({
          where: { id: input.roomId },
          data: { lastMessageAt: message.createdAt },
        });
        return { message, room: updated };
      });

      // 5) broadcast (현재는 직접. 추후 Outbox 워커에서 발화)
      const event: ChatMessageEvent = {
        id: created.message.id,
        roomId: created.message.roomId,
        senderType: "MANAGER",
        senderId: managerId,
        type: "TEXT",
        originalText: created.message.originalText,
        language: created.message.language,
        translatedText: created.message.translatedText,
        createdAt: created.message.createdAt.toISOString(),
      };

      chatNs.to(roomKey(input.roomId)).emit("chat:message", event);
      chatNs.to(roomKey(input.roomId)).emit("chat:room-updated", {
        roomId: input.roomId,
        lastMessageAt: event.createdAt,
        unreadCount: created.room.unreadCount,
      });

      ack({ ok: true, data: { messageId: created.message.id } });
    } catch (err) {
      console.error("[chat:send] error", err);
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnect ${email} — ${reason}`);
  });
});

// ─── start ──────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(
    `✓ FICS socket server: http://localhost:${PORT} (ns=${CHAT_NAMESPACE})`
  );
  console.log(`  AUTH_SECRET: set (${process.env.AUTH_SECRET!.length} chars)`);
  console.log(`  CORS: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log(`  REDIS: ${process.env.REDIS_URL ? "configured" : "in-memory"}`);
});

// ─── graceful shutdown ──────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n[${signal}] shutting down...`);
  io.close();
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
