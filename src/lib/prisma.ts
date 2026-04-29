/**
 * Prisma Client 싱글톤 (Prisma 7 — adapter 기반)
 * Next.js dev mode hot reload 시 connection 누수 방지
 *
 * Adapter 자동 분기 — DATABASE_URL prefix로:
 *  - "file:..."         → @prisma/adapter-better-sqlite3 (로컬 dev)
 *  - "libsql://..." or  → @prisma/adapter-libsql (Turso, 운영)
 *    "https://..."
 *
 * Turso URL 형식:
 *   libsql://your-db.turso.io?authToken=eyJ...
 *   또는 별도 DATABASE_AUTH_TOKEN env로 분리
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const createPrismaClient = () => {
  // trim — Vercel/Railway 등 환경변수 입력 시 앞뒤 공백/줄바꿈 보호
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");

  let adapter;
  if (url.startsWith("libsql:") || url.startsWith("https:")) {
    // Turso / libsql remote — URL의 authToken query param도 분리해 안전하게 처리
    let cleanUrl = url;
    let authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
    try {
      const u = new URL(url);
      const tokenFromQuery = u.searchParams.get("authToken");
      if (tokenFromQuery) {
        authToken = tokenFromQuery.trim();
        u.searchParams.delete("authToken");
        cleanUrl = u.toString();
      }
    } catch {
      // URL 파싱 실패 시 원본 그대로 사용
    }
    // URL 끝 슬래시 제거 (Turso는 host만 받음)
    cleanUrl = cleanUrl.replace(/\/+$/, "");
    if (!authToken) {
      throw new Error(
        "Turso URL은 DATABASE_AUTH_TOKEN 또는 ?authToken=... 필요"
      );
    }
    adapter = new PrismaLibSql({ url: cleanUrl, authToken });
  } else {
    // 로컬 SQLite 파일
    adapter = new PrismaBetterSqlite3({ url });
  }

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
