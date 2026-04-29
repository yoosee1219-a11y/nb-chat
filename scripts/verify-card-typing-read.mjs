/**
 * Card 메시지 + Typing + Read Receipt 통합 E2E
 *
 * 시나리오:
 *  1. 매니저 → 신청자 룸에 PLAN 카드 발신 → DB cardType="PLAN", cardPayload 저장
 *  2. 매니저 측 typing emit → 신청자 측 chat:typing 수신
 *  3. 신청자 측 chat:read emit → 매니저 측 chat:read 수신 + DB isRead 마킹
 */
import Database from "better-sqlite3";
import { io as sockio } from "socket.io-client";
import { SignJWT } from "jose";
import "dotenv/config";

const db = new Database("./dev.db");

const now = new Date().toISOString();
const applicantId = `c-tr-app-${Date.now()}`;
const managerId = `c-tr-mgr-${Date.now()}`;
const roomId = `c-tr-room-${Date.now()}`;

// 매니저 — Manager 테이블에 row 만들어서 룸과 연결
db.prepare(
  `INSERT INTO managers (id, email, name, passwordHash, role, isActive, createdAt, updatedAt)
   VALUES (?, ?, '카드테스트매니저', 'x', 'MANAGER', 1, ?, ?)`
).run(managerId, `c-tr-${Date.now()}@test.local`, now, now);

db.prepare(
  `INSERT INTO applicants (id, name, nationality, preferredLanguage, privacyConsent, thirdPartyConsent, status, appliedAt, createdAt, updatedAt)
   VALUES (?, '카드테스트신청자', 'VN', 'VI_VN', 1, 0, 'PENDING', ?, ?, ?)`
).run(applicantId, now, now, now);

db.prepare(
  `INSERT INTO chat_rooms (id, applicantId, managerId, isFavorite, unreadCount, createdAt, updatedAt)
   VALUES (?, ?, ?, 0, 0, ?, ?)`
).run(roomId, applicantId, managerId, now, now);

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

const mgrToken = await new SignJWT({
  kind: "manager",
  managerId,
  email: "c-tr-mgr@test.local",
  role: "MANAGER",
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("24h")
  .sign(SECRET);

const appToken = await new SignJWT({
  kind: "applicant",
  applicantId,
  roomId,
  language: "VI_VN",
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("24h")
  .sign(SECRET);

const mgr = sockio("http://localhost:4001/chat", {
  auth: { token: mgrToken },
  transports: ["websocket"],
});
const app = sockio("http://localhost:4001/chat", {
  auth: { token: appToken },
  transports: ["websocket"],
});

await Promise.all(
  [mgr, app].map(
    (s) =>
      new Promise((resolve, reject) => {
        s.on("connect", resolve);
        s.on("connect_error", reject);
        setTimeout(() => reject(new Error("connect timeout")), 6000);
      })
  )
);

await Promise.all([
  new Promise((r, j) =>
    mgr.emit("chat:subscribe", { roomId }, (res) =>
      res.ok ? r() : j(new Error("mgr sub: " + res.error))
    )
  ),
  new Promise((r, j) =>
    app.emit("chat:subscribe", { roomId }, (res) =>
      res.ok ? r() : j(new Error("app sub: " + res.error))
    )
  ),
]);

let pass = 0;
let total = 0;

// ───── 1. CARD 메시지 발신 + 수신 ─────
total++;
{
  const cardPayload = {
    name: "외국인 전용 LTE 무제한",
    monthlyFee: 35000,
    dataAllowance: "무제한",
    voiceMinutes: "300분",
    smsCount: "100건",
    commitment: "12개월",
  };

  const recvP = new Promise((resolve, reject) => {
    const handler = (msg) => {
      if (msg.type === "CARD" && msg.cardType === "PLAN") {
        app.off("chat:message", handler);
        resolve(msg);
      }
    };
    app.on("chat:message", handler);
    setTimeout(() => reject(new Error("card receive timeout")), 5000);
  });

  await new Promise((r, j) =>
    mgr.emit(
      "chat:send",
      {
        roomId,
        type: "CARD",
        originalText: "",
        language: "KO_KR",
        cardType: "PLAN",
        cardPayload,
      },
      (res) => (res.ok ? r() : j(new Error("send: " + res.error)))
    )
  );

  const received = await recvP;

  // DB 저장 검증
  const stored = db
    .prepare(
      `SELECT type, cardType, cardPayload FROM messages
       WHERE roomId = ? AND type = 'CARD' ORDER BY createdAt DESC LIMIT 1`
    )
    .get(roomId);

  if (!stored) {
    console.log("✗ [1] DB에 CARD 메시지 없음");
  } else if (stored.cardType !== "PLAN") {
    console.log(`✗ [1] cardType mismatch: ${stored.cardType}`);
  } else {
    const parsed = JSON.parse(stored.cardPayload);
    if (parsed.monthlyFee !== 35000) {
      console.log(`✗ [1] payload 손상: ${stored.cardPayload}`);
    } else if (received.cardPayload?.name !== "외국인 전용 LTE 무제한") {
      console.log(`✗ [1] socket payload 손상`);
    } else {
      console.log(
        `✓ [1] CARD 메시지 발신/수신/DB 저장 (cardType=${stored.cardType})`
      );
      pass++;
    }
  }
}

// ───── 2. Typing emit + 수신 ─────
total++;
{
  const typingP = new Promise((resolve, reject) => {
    const handler = (data) => {
      if (data.roomId === roomId && data.senderKind === "manager" && data.isTyping) {
        app.off("chat:typing", handler);
        resolve(data);
      }
    };
    app.on("chat:typing", handler);
    setTimeout(() => reject(new Error("typing timeout")), 4000);
  });
  mgr.emit("chat:typing", { roomId, isTyping: true });
  try {
    const data = await typingP;
    console.log(
      `✓ [2] typing emit/receive (manager → applicant) sender=${data.senderKind}`
    );
    pass++;
  } catch (e) {
    console.log("✗ [2] " + e.message);
  }
}

// ───── 3. Read receipt emit + 수신 + DB 마킹 ─────
total++;
{
  // 매니저가 신청자에게 한 마디 보내고 신청자가 read emit
  await new Promise((r, j) =>
    mgr.emit(
      "chat:send",
      {
        roomId,
        type: "TEXT",
        originalText: "안녕하세요, 상담사입니다.",
        language: "KO_KR",
      },
      (res) => (res.ok ? r() : j(new Error("send: " + res.error)))
    )
  );
  await new Promise((r) => setTimeout(r, 300));

  const readP = new Promise((resolve, reject) => {
    const handler = (data) => {
      if (data.roomId === roomId && data.readerKind === "applicant") {
        mgr.off("chat:read", handler);
        resolve(data);
      }
    };
    mgr.on("chat:read", handler);
    setTimeout(() => reject(new Error("read timeout")), 4000);
  });

  app.emit("chat:read", { roomId });

  try {
    const data = await readP;
    // DB isRead 마킹 검증 (매니저 메시지)
    await new Promise((r) => setTimeout(r, 300));
    const unreadMgr = db
      .prepare(
        `SELECT COUNT(*) as c FROM messages
         WHERE roomId = ? AND senderType = 'MANAGER' AND isRead = 0`
      )
      .get(roomId).c;
    if (unreadMgr > 0) {
      console.log(`✗ [3] DB 매니저 메시지가 여전히 unread (${unreadMgr}개)`);
    } else {
      console.log(
        `✓ [3] read emit/receive + DB isRead 마킹 (reader=${data.readerKind})`
      );
      pass++;
    }
  } catch (e) {
    console.log("✗ [3] " + e.message);
  }
}

// 정리
mgr.disconnect();
app.disconnect();
db.prepare("DELETE FROM outbox WHERE aggregateId = ?").run(roomId);
db.prepare("DELETE FROM messages WHERE roomId = ?").run(roomId);
db.prepare("DELETE FROM chat_rooms WHERE id = ?").run(roomId);
db.prepare("DELETE FROM applicants WHERE id = ?").run(applicantId);
db.prepare("DELETE FROM managers WHERE id = ?").run(managerId);
db.close();

console.log(`\n=== ${pass}/${total} Card+Typing+Read 시나리오 통과 ===`);
process.exit(pass === total ? 0 : 1);
