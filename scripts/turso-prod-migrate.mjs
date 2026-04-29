/**
 * Turso prod 마이그레이션 wrapper —
 *  .env.production을 직접 파싱해서 자식 프로세스에 inject 후 turso-apply-incremental.ts 실행.
 *  dotenv가 .env.production을 못 읽는 문제 우회.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const raw = readFileSync(".env.production", "utf-8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[m[1]] = val;
}

if (!env.DATABASE_URL || !env.DATABASE_AUTH_TOKEN) {
  console.error("✗ .env.production에서 DATABASE_URL/DATABASE_AUTH_TOKEN 못 찾음");
  process.exit(1);
}

console.log("✓ env loaded — DATABASE_URL host=", new URL(env.DATABASE_URL).host);

const child = spawn("npx", ["tsx", "scripts/turso-apply-incremental.ts"], {
  env: { ...process.env, ...env },
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
