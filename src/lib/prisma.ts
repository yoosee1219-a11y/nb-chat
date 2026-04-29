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
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");

  let adapter;
  if (url.startsWith("libsql:") || url.startsWith("https:")) {
    // Turso / libsql remote — URL의 authToken query param도 분리해 안전하게 처리
    let cleanUrl = url;
    let authToken = process.env.DATABASE_AUTH_TOKEN;
    try {
      const u = new URL(url);
      const tokenFromQuery = u.searchParams.get("authToken");
      if (tokenFromQuery) {
        authToken = tokenFromQuery;
        u.searchParams.delete("authToken");
        cleanUrl = u.toString();
      }
    } catch {
      // URL 파싱 실패 시 원본 그대로 사용
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
