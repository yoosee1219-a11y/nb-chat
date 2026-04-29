/**
 * Turso (libsql) 스키마 마이그레이션 실행
 *
 * Prisma 7 adapter 모드는 `prisma db push`를 Turso에 직접 못 씀.
 * → prisma/migrations/* 의 SQL 파일들을 libsql client로 순서대로 실행.
 *
 * 사용:
 *   DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="eyJ..." \
 *     npx tsx scripts/turso-migrate.ts
 *
 * 안전:
 *  - 이미 적용된 migration도 다시 실행하면 에러 (CREATE TABLE 충돌)
 *  - 첫 1회만 실행. 이후 schema 변경 시 새 migration만 따로 실행하는 로직 추가 필요.
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
const explicitToken = process.env.DATABASE_AUTH_TOKEN;
if (!url) {
  console.error("✗ DATABASE_URL 환경변수가 없습니다.");
  process.exit(1);
}
if (!url.startsWith("libsql:") && !url.startsWith("https:")) {
  console.error("✗ DATABASE_URL이 libsql/https 형식이 아닙니다 (Turso 전용 스크립트).");
  process.exit(1);
}

// URL의 ?authToken=... 처리
let cleanUrl = url;
let authToken = explicitToken;
try {
  const u = new URL(url);
  const tokenFromQuery = u.searchParams.get("authToken");
  if (tokenFromQuery) {
    authToken = tokenFromQuery;
    u.searchParams.delete("authToken");
    cleanUrl = u.toString();
  }
} catch {}

if (!authToken) {
  console.error(
    "✗ Auth token 없음. DATABASE_AUTH_TOKEN 환경변수 설정하거나 URL에 ?authToken=... 포함."
  );
  process.exit(1);
}

console.log(`▶ Connecting to ${cleanUrl}`);
const client = createClient({ url: cleanUrl, authToken });

async function main() {
  // 기존 테이블 확인
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  if (tables.rows.length > 0) {
    console.log(
      `⚠ 이미 ${tables.rows.length}개 테이블 존재:`,
      tables.rows.map((r) => r.name).join(", ")
    );
    console.log("  → migration 재실행 건너뜀 (재실행하려면 turso db drop + create)");
    return;
  }

  // migration 디렉토리 정렬
  const migrationsDir = "prisma/migrations";
  const dirs = readdirSync(migrationsDir)
    .filter((d) => /^\d{14}_/.test(d))
    .sort();

  console.log(`▶ ${dirs.length}개 migration 발견`);

  for (const dir of dirs) {
    const sqlPath = join(migrationsDir, dir, "migration.sql");
    const sql = readFileSync(sqlPath, "utf-8");

    // 주석 라인 제거 후 statement 단위 분리
    // (split 전에 -- 주석을 통째로 빼야 statement 내부 첫 줄이 주석이어도 살아남음)
    const cleanedSql = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const statements = cleanedSql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`  ▶ ${dir} (${statements.length}개 statement)`);
    try {
      // batch로 한 번에 실행 — 트랜잭션 보장
      await client.batch(statements, "deferred");
      console.log(`    ✓ 적용 완료`);
    } catch (e) {
      console.error(`    ✗ 실패: ${(e as Error).message}`);
      throw e;
    }
  }

  // 적용 후 테이블 다시 확인
  const after = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  console.log(`\n✓ ${after.rows.length}개 테이블 생성 완료:`);
  after.rows.forEach((r) => console.log(`  - ${r.name}`));
}

main()
  .then(() => {
    console.log("\n=== Turso 마이그레이션 완료 ===");
    process.exit(0);
  })
  .catch((e) => {
    console.error("\n=== 실패 ===", e);
    process.exit(1);
  });
