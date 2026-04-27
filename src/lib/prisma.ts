/**
 * Prisma Client 싱글톤 (Prisma 7 — adapter 기반)
 * Next.js dev mode hot reload 시 connection 누수 방지
 *
 * Prisma 7부터 PrismaClient는 반드시 adapter 또는 accelerateUrl 필요.
 * 로컬 SQLite: @prisma/adapter-better-sqlite3
 * 프로덕션 PostgreSQL 전환 시: @prisma/adapter-pg + pg
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const createPrismaClient = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");

  const adapter = new PrismaBetterSqlite3({ url });
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
