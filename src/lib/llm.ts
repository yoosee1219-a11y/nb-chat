/**
 * LLM 추상화 — Phase 3.4
 *
 * 어댑터:
 *  - MockLLM: API 키 없을 때 (dev/테스트)
 *  - AnthropicLLM: ANTHROPIC_API_KEY 있을 때 — claude-haiku-4-5(default), claude-sonnet-4-6
 *  - OpenAILLM: OPENAI_API_KEY 있을 때 — gpt-4o-mini, gpt-4o
 *
 * 모델 ID는 chatbot-flow의 LLMNodeData.model에서 그대로 받는다.
 * 그래서 노드 편집기에서 사용자가 고른 model 문자열에 따라 어댑터 자동 라우팅.
 *
 * NOTE: standalone socket 서버에서도 import 가능해야 하므로 server-only 미사용.
 */

export type LLMRequest = {
  systemPrompt: string;
  userMessage: string;
  /** "claude-haiku-4-5" / "claude-sonnet-4-6" / "gpt-4o-mini" / "gpt-4o" */
  model: string;
  maxTokens?: number;
};

export type LLMResponse = {
  text: string;
  model: string;
  /** 비용 추적 — 어댑터가 응답에서 추출 가능할 때만 채움 */
  inputTokens?: number;
  outputTokens?: number;
};

export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResponse>;
}

// ─── Mock ────────────────────────────────────────────────────────
class MockLLM implements LLMClient {
  async complete({ model, userMessage }: LLMRequest): Promise<LLMResponse> {
    const preview = userMessage.slice(0, 60).replace(/\s+/g, " ");
    return {
      text: `[mock ${model}] (입력: "${preview}...") → 안녕하세요, NB Chat 챗봇입니다. 도와드리겠습니다.`,
      model,
    };
  }
}

// ─── Anthropic ───────────────────────────────────────────────────
class AnthropicLLM implements LLMClient {
  constructor(private apiKey: string) {}

  async complete({
    systemPrompt,
    userMessage,
    model,
    maxTokens = 512,
  }: LLMRequest): Promise<LLMResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`anthropic_failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    return {
      text: text || "(응답 없음)",
      model: json.model ?? model,
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
    };
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────
class OpenAILLM implements LLMClient {
  constructor(private apiKey: string) {}

  async complete({
    systemPrompt,
    userMessage,
    model,
    maxTokens = 512,
  }: LLMRequest): Promise<LLMResponse> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`openai_failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    return {
      text: json.choices?.[0]?.message?.content?.trim() || "(응답 없음)",
      model: json.model ?? model,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  }
}

// ─── 라우터 (모델명으로 어댑터 자동 선택) ─────────────────────────
let mockSingleton: LLMClient | null = null;

export function getLLMClient(model: string): LLMClient {
  const isClaude = model.startsWith("claude-");
  const isGpt = model.startsWith("gpt-");

  if (isClaude && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicLLM(process.env.ANTHROPIC_API_KEY);
  }
  if (isGpt && process.env.OPENAI_API_KEY) {
    return new OpenAILLM(process.env.OPENAI_API_KEY);
  }
  // 폴백
  if (!mockSingleton) {
    mockSingleton = new MockLLM();
    console.log(
      `[llm] using MockLLM for model=${model} (set ANTHROPIC_API_KEY or OPENAI_API_KEY for real)`
    );
  }
  return mockSingleton;
}

/** 테스트에서 강제 주입 */
export function setMockLLM(c: LLMClient) {
  mockSingleton = c;
}
