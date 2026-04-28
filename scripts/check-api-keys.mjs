/**
 * 실 API 키 sanity 체크 — Phase 3.4
 *
 * .env에 설정된 키로 실제 API에 1회 호출 후 응답 확인.
 * 키 없으면 skip + 안내 출력.
 *
 * 사용:
 *   node scripts/check-api-keys.mjs
 */
import "dotenv/config";

const tests = [];

// ─── Anthropic ────────────────────────────────────────────────
if (process.env.ANTHROPIC_API_KEY) {
  tests.push({
    name: "Anthropic (Claude Haiku 4.5)",
    run: async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 50,
          messages: [
            { role: "user", content: "한 단어로 인사해줘 (간결하게)" },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const j = await res.json();
      const text = (j.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      return `응답: "${text.trim().slice(0, 80)}" · 토큰=${j.usage?.input_tokens}/${j.usage?.output_tokens}`;
    },
  });
} else {
  console.log("· ANTHROPIC_API_KEY 미설정 — skip");
}

// ─── OpenAI ───────────────────────────────────────────────────
if (process.env.OPENAI_API_KEY) {
  tests.push({
    name: "OpenAI (gpt-4o-mini)",
    run: async () => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 50,
          messages: [
            { role: "system", content: "한 단어로 답해" },
            { role: "user", content: "안녕" },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const j = await res.json();
      return `응답: "${j.choices?.[0]?.message?.content?.trim().slice(0, 80)}" · 토큰=${j.usage?.prompt_tokens}/${j.usage?.completion_tokens}`;
    },
  });
} else {
  console.log("· OPENAI_API_KEY 미설정 — skip");
}

// ─── Google Translate v2 ──────────────────────────────────────
if (process.env.GOOGLE_TRANSLATE_API_KEY) {
  tests.push({
    name: "Google Translate v2 (KO→VI)",
    run: async () => {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(process.env.GOOGLE_TRANSLATE_API_KEY)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            q: "안녕하세요, 유심 가입 도와드릴게요.",
            source: "ko",
            target: "vi",
            format: "text",
          }),
        }
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const j = await res.json();
      return `번역: "${j.data?.translations?.[0]?.translatedText?.slice(0, 100)}"`;
    },
  });
} else {
  console.log("· GOOGLE_TRANSLATE_API_KEY 미설정 — skip");
}

if (tests.length === 0) {
  console.log("\n어떤 API 키도 설정되지 않았습니다.");
  console.log("`.env`에 다음 중 1개 이상 추가하세요:");
  console.log("  ANTHROPIC_API_KEY=sk-ant-...");
  console.log("  OPENAI_API_KEY=sk-...");
  console.log("  GOOGLE_TRANSLATE_API_KEY=AIza...");
  process.exit(0);
}

console.log(`\n검증 대상 ${tests.length}개:\n`);
let allOk = true;
for (const t of tests) {
  process.stdout.write(`  ${t.name} ... `);
  try {
    const result = await t.run();
    console.log(`✓\n    ${result}`);
  } catch (e) {
    console.log(`✗\n    ${e.message}`);
    allOk = false;
  }
}

console.log(
  allOk
    ? "\n=== 모든 API 키 정상 — flow-runtime이 자동으로 실 API로 라우팅됩니다 ==="
    : "\n=== 일부 실패 — 위 에러 메시지를 확인하세요 ==="
);
process.exit(allOk ? 0 : 1);
