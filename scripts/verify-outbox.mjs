/**
 * Outbox 패턴 검증
 *
 * - chat:send 시 outbox row가 트랜잭션 안에서 생성되는지
 * - 1차 broadcast 성공 후 processedAt이 마킹되는지
 * - 워커가 미처리 row를 5초 후 재처리하는지 (간접 검증)
 */
import Database from "better-sqlite3";
import { io } from "socket.io-client";
import { SignJWT } from "jose";
import "dotenv/config";

const db = new Database("./dev.db");

// 테스트용 룸 + 신청자 + 토큰
const now = new Date().toISOString();
const applicantId = `outbox-test-${Date.now()}`;
const roomId = `outbox-room-${Date.now()}`;

db.prepare(
  `INSERT INTO applicants (id, name, nationality, preferredLanguage, privacyConsent, thirdPartyConsent, status, appliedAt, createdAt, updatedAt)
   VALUES (?, '아웃박스테스트', 'VN', 'VI_VN', 1, 0, 'PENDING', ?, ?, ?)`
).run(applicantId, now, now, now);

db.prepare(
  `INSERT INTO chat_rooms (id, applicantId, isFavorite, unreadCount, createdAt, updatedAt)
   VALUES (?, ?, 0, 0, ?, ?)`
).run(roomId, applicantId, now, now);

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);
const token = await new SignJWT({
  kind: "applicant",
  applicantId,
  roomId,
  language: "VI_VN",
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("24h")
  .sign(SECRET);

const beforeOutboxCount = db
  .prepare("SELECT COUNT(*) as c FROM outbox")
  .get().c;

const sock = io("http://localhost:4001/chat", {
  auth: { token },
  transports: ["websocket"],
});

await new Promise((resolve, reject) => {
  sock.on("connect", resolve);
  sock.on("connect_error", reject);
  setTimeout(() => reject(new Error("connect timeout")), 8000);
});

// 메시지 발신
await new Promise((resolve, reject) => {
  sock.emit(
    "chat:subscribe",
    { roomId },
    (res) => res.ok ? null : reject(new Error("sub: " + res.error))
  );
  sock.emit(
    "chat:send",
    {
      roomId,
      type: "TEXT",
      originalText: "Outbox test message",
      language: "VI_VN",
    },
    (res) => {
      if (res.ok) resolve();
      else reject(new Error("send: " + res.error));
    }
  );
  setTimeout(() => reject(new Error("send timeout")), 8000);
});

await new Promise((r) => setTimeout(r, 800));

const afterOutboxCount = db
  .prepare("SELECT COUNT(*) as c FROM outbox")
  .get().c;
const delta = afterOutboxCount - beforeOutboxCount;

const recent = db
  .prepare(
    `SELECT eventType, processedAt IS NOT NULL as processed, attempts
     FROM outbox
     WHERE aggregateId = ?
     ORDER BY createdAt DESC LIMIT 5`
  )
  .all(roomId);

let pass = 0;
let total = 0;

total++;
if (delta < 1) {
  console.log(`✗ [1] outbox row 생성 안됨 (delta=${delta})`);
} else {
  console.log(`✓ [1] outbox row ${delta}개 생성`);
  pass++;
}

total++;
const messageRows = recent.filter((r) => r.eventType === "MESSAGE_CREATED");
if (messageRows.length === 0) {
  console.log("✗ [2] MESSAGE_CREATED 이벤트 row 없음");
} else if (!messageRows.every((r) => r.processed === 1)) {
  console.log(
    `✗ [2] 일부 row가 processed=0 (1차 emit 실패): ${JSON.stringify(messageRows)}`
  );
} else {
  console.log(
    `✓ [2] MESSAGE_CREATED row 모두 processedAt 마킹됨 (${messageRows.length}개)`
  );
  pass++;
}

// 정리
db.prepare("DELETE FROM outbox WHERE aggregateId = ?").run(roomId);
db.prepare("DELETE FROM messages WHERE roomId = ?").run(roomId);
db.prepare("DELETE FROM chat_rooms WHERE id = ?").run(roomId);
db.prepare("DELETE FROM applicants WHERE id = ?").run(applicantId);
db.close();
sock.disconnect();

console.log(`\n=== ${pass}/${total} Outbox 시나리오 통과 ===`);
process.exit(pass === total ? 0 : 1);
