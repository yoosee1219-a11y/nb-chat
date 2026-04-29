/**
 * Turso (libsql) — 신규 마이그레이션만 idempotent 하게 적용
 *
 * turso-migrate.ts는 "테이블이 0개일 때만" 1회 실행하는 초기화용.
 * 이 스크립트는 그 이후 신규 마이그레이션을 안전하게 적용한다:
 *  - _migrations 메타 테이블로 이력 추적 (적용 완료한 dir 기록)
 *  - 미적용 dir만 batch 실행 + 성공 시 메타에 기록
 *
 * 사용:
 *   DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="eyJ..." \
 *     npx tsx scripts/turso-apply-incremental.ts
 *
 * 안전:
 *  - ALTER TABLE / CREATE TABLE 같은 DDL을 batch 트랜잭션으로 묶음
 *  - 같은 마이그레이션 두 번 실행 X
 *  - 실패 시 즉시 throw → 부분 적용 상태 빨리 인지
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
  // 로컬 SQLite (file:dev.db) — Turso 스크립트 스킵, build를 막지 않음
  console.log(
    `ℹ Turso 마이그레이션 스킵 (DATABASE_URL=${url.slice(0, 20)}...) — 로컬 SQLite는 prisma migrate deploy 사용`
  );
  process.exit(0);
}

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
    "✗ Auth token 없음. DATABASE_AUTH_TOKEN 환경변수 또는 URL ?authToken="
  );
  process.exit(1);
}

console.log(`▶ Connecting to ${cleanUrl}`);
const client = createClient({ url: cleanUrl, authToken });

const META_TABLE = "_nb_migrations";

async function main() {
  // 메타 테이블 부트스트랩
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${META_TABLE} (
      name TEXT PRIMARY KEY,
      appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 이미 적용된 마이그레이션
  const applied = await client.execute(`SELECT name FROM ${META_TABLE}`);
  const appliedSet = new Set(applied.rows.map((r) => String(r.name)));
  console.log(`▶ 적용 이력: ${appliedSet.size}건`);

  // 기존 테이블 — 첫 실행 시 turso-migrate.ts로 만들어진 것 백필
  // 즉, 이미 partners/applicants/messages가 있으면 init migration은 적용된 것으로 간주
  if (appliedSet.size === 0) {
    const t = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\'"
    );
    const tableNames = t.rows.map((r) => String(r.name));
    if (tableNames.includes("applicants") || tableNames.includes("partners")) {
      // 이전 init migration 백필
      console.log(
        `  → 기존 ${tableNames.length}개 테이블 감지 — init migration 백필`
      );
      const dirs = readdirSync("prisma/migrations")
        .filter((d) => /^\d{14}_/.test(d))
        .sort();
      // 가장 오래된 것부터 partner_clicks가 없는 시점까지 모두 백필
      for (const d of dirs) {
        if (
          d === "20260429100000_add_first_touch_and_clicks" &&
          !tableNames.includes("partner_clicks")
        ) {
          break; // 이건 신규로 적용해야 하므로 백필 X
        }
        await client.execute({
          sql: `INSERT OR IGNORE INTO ${META_TABLE}(name) VALUES (?)`,
          args: [d],
        });
        appliedSet.add(d);
        console.log(`    ✓ 백필 ${d}`);
      }
    }
  }

  // 미적용 마이그레이션
  const dirs = readdirSync("prisma/migrations")
    .filter((d) => /^\d{14}_/.test(d))
    .sort();

  const pending = dirs.filter((d) => !appliedSet.has(d));
  if (pending.length === 0) {
    console.log("✓ 적용할 마이그레이션 없음 (모두 최신)");
    return;
  }

  console.log(`▶ 적용 대상 ${pending.length}건:`);
  pending.forEach((d) => console.log(`  - ${d}`));

  for (const dir of pending) {
    const sqlPath = join("prisma/migrations", dir, "migration.sql");
    const sql = readFileSync(sqlPath, "utf-8");

    // 주석 제거 + statement 분리
    const cleanedSql = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const statements = cleanedSql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`\n▶ ${dir} (${statements.length}개 statement)`);
    try {
      await client.batch(statements, "deferred");
      await client.execute({
        sql: `INSERT INTO ${META_TABLE}(name) VALUES (?)`,
        args: [dir],
      });
      console.log(`  ✓ 적용 완료`);
    } catch (e) {
      console.error(`  ✗ 실패: ${(e as Error).message}`);
      throw e;
    }
  }

  // 결과 검증
  const after = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  console.log(`\n✓ 최종 테이블 ${after.rows.length}개:`);
  after.rows.forEach((r) => console.log(`  - ${r.name}`));
}

/**
 * 첫 ADMIN 매니저 자동 생성 (managers 테이블이 비어 있을 때만).
 * prod 환경의 chicken-and-egg 해결 — 회원가입 페이지가 없어서 첫 ADMIN은 시드로만.
 *
 * 환경변수:
 *   SEED_ADMIN_EMAIL    (기본: admin@fics.local)
 *   SEED_ADMIN_PASSWORD (기본: admin123)
 *
 * 보안 주의:
 *  - 첫 로그인 후 즉시 비밀번호 변경 권장
 *  - 또는 Vercel env에 SEED_ADMIN_PASSWORD를 강한 값으로 설정
 */
async function ensureFirstAdmin() {
  const cnt = await client.execute("SELECT COUNT(*) as c FROM managers");
  const count = Number(cnt.rows[0]?.c ?? 0);
  if (count > 0) {
    console.log(`▶ 매니저 이미 ${count}명 존재 — 시드 skip`);
    return;
  }
  const email = process.env.SEED_ADMIN_EMAIL?.trim() || "admin@fics.local";
  const password = process.env.SEED_ADMIN_PASSWORD?.trim() || "admin123";

  // bcryptjs로 해시 — package.json dependency에 이미 있음
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 10);
  const id = `seed-admin-${Date.now()}`;

  await client.execute({
    sql: `INSERT INTO managers (id, email, name, passwordHash, role, isActive, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'ADMIN', 1, datetime('now'), datetime('now'))`,
    args: [id, email, "관리자", passwordHash],
  });
  console.log(`✓ 첫 ADMIN 매니저 생성: ${email} (비밀번호: ${password === "admin123" ? "admin123 — 즉시 변경 권장" : "ENV 값"})`);
}

main()
  .then(() => ensureFirstAdmin())
  .then(() => {
    console.log("\n=== Turso incremental 마이그레이션 완료 ===");
    process.exit(0);
  })
  .catch((e) => {
    console.error("\n=== 실패 ===", e);
    process.exit(1);
  });
