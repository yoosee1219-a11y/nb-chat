/**
 * 번역 캐시 검증 — 같은 (text, source, target)는 1번만 실 번역.
 * Mock 모드로 충분히 검증 (캐시 레이어는 어댑터 무관).
 *
 * 실행: npx tsx scripts/test-translation-cache.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getTranslator } from "../src/lib/translation";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
await prisma.translationCache.deleteMany({
  where: { originalText: { contains: "[CACHE-TEST]" } },
});

const t = getTranslator();
const text = `[CACHE-TEST] 안녕하세요 NB Chat 챗봇입니다. ${Date.now()}`;
const src = "KO_KR";
const tgt = "VI_VN";

const r1 = await t.translate({
  text,
  sourceLanguage: src,
  targetLanguage: tgt,
});
if (r1.cached) fail("첫 호출인데 cached=true");
console.log(`✓ 1차: cached=${r1.cached}, "${r1.translatedText.slice(0, 50)}..."`);

const r2 = await t.translate({
  text,
  sourceLanguage: src,
  targetLanguage: tgt,
});
if (!r2.cached) fail("2차 동일 입력인데 cached=false");
if (r2.translatedText !== r1.translatedText) fail("캐시된 번역이 다름");
console.log(`✓ 2차: cached=${r2.cached} (히트)`);

const row = await prisma.translationCache.findFirst({
  where: { originalText: text },
  select: { hits: true, translatedText: true },
});
if (!row) fail("DB에 cache row 없음");
console.log(`✓ DB row: hits=${row.hits}`);

// 다른 target
const r3 = await t.translate({
  text,
  sourceLanguage: src,
  targetLanguage: "EN_US",
});
if (r3.cached) fail("다른 target인데 cached=true");
console.log(`✓ EN_US: cached=${r3.cached} (별개 키)`);

const r4 = await t.translate({
  text,
  sourceLanguage: src,
  targetLanguage: "VI_VN",
});
if (!r4.cached) fail("3차 cached=false");

// 정리
await prisma.translationCache.deleteMany({
  where: { originalText: { contains: "[CACHE-TEST]" } },
});
await prisma.$disconnect();

console.log("\n=== 번역 캐시 검증 통과 ===");
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
