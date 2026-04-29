"use client";

import type { CardType } from "@/lib/socket-types";

/**
 * Card 메시지 렌더링 — Phase 5.7
 *
 * cardType별 시각적 형태:
 *  - PLAN: 요금제 카드 (월 요금 큰 글씨, dataAllowance/voice/sms 그리드)
 *  - VIDEO: 썸네일 + 제목 + 외부 링크
 *  - PROFILE: 신청자 요약 (이름, 국적, 언어)
 *  - HOUSING: 주거 정보 (제목, 지역, 링크)
 *  - RESUME: 키-값 그리드 (이력)
 *  - GENERIC: title + body + 선택적 image/link (fallback)
 *
 * cardPayload는 서버 신뢰 못 함 — 모든 필드는 옵셔널 처리, 알 수 없는 형태면 GENERIC 폴백.
 */

type CardPayloadAny = Record<string, unknown>;

const safeStr = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number") return String(v);
  return null;
};

const safeUrl = (v: unknown): string | null => {
  const s = safeStr(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
  } catch {
    /* invalid */
  }
  return null;
};

export function MessageCard({
  cardType,
  payload,
  onSurface = "muted",
}: {
  cardType: CardType;
  payload: CardPayloadAny;
  onSurface?: "primary" | "muted";
}) {
  const surfaceClass =
    onSurface === "primary"
      ? "border-primary-foreground/30 bg-primary-foreground/10"
      : "border-border bg-background";

  switch (cardType) {
    case "PLAN":
      return (
        <div className={`rounded-lg border p-3 ${surfaceClass}`}>
          <div className="text-[10px] font-mono uppercase opacity-60">PLAN</div>
          <div className="mt-1 text-sm font-semibold">
            {safeStr(payload.name) ?? "요금제"}
          </div>
          {safeStr(payload.monthlyFee) && (
            <div className="mt-2 text-base font-bold">
              월 {Number(payload.monthlyFee).toLocaleString()}원
            </div>
          )}
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {safeStr(payload.dataAllowance) && (
              <div>
                <div className="opacity-60">데이터</div>
                <div className="font-medium">{safeStr(payload.dataAllowance)}</div>
              </div>
            )}
            {safeStr(payload.voiceMinutes) && (
              <div>
                <div className="opacity-60">통화</div>
                <div className="font-medium">{safeStr(payload.voiceMinutes)}</div>
              </div>
            )}
            {safeStr(payload.smsCount) && (
              <div>
                <div className="opacity-60">SMS</div>
                <div className="font-medium">{safeStr(payload.smsCount)}</div>
              </div>
            )}
          </div>
          {safeStr(payload.commitment) && (
            <div className="mt-2 text-[11px] opacity-70">
              약정: {safeStr(payload.commitment)}
            </div>
          )}
        </div>
      );

    case "VIDEO": {
      const url = safeUrl(payload.url);
      const thumbnail = safeUrl(payload.thumbnail);
      const title = safeStr(payload.title) ?? "동영상";
      return (
        <div className={`overflow-hidden rounded-lg border ${surfaceClass}`}>
          {thumbnail && (
            <a
              href={url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnail}
                alt={title}
                className="aspect-video w-full object-cover"
              />
            </a>
          )}
          <div className="p-2.5">
            <div className="text-[10px] font-mono uppercase opacity-60">VIDEO</div>
            <div className="mt-0.5 text-sm font-medium">{title}</div>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-xs opacity-70 hover:underline"
              >
                바로가기 →
              </a>
            )}
          </div>
        </div>
      );
    }

    case "PROFILE":
      return (
        <div className={`rounded-lg border p-3 ${surfaceClass}`}>
          <div className="text-[10px] font-mono uppercase opacity-60">PROFILE</div>
          <div className="mt-1 text-sm font-semibold">
            {safeStr(payload.name) ?? "신청자"}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
            {safeStr(payload.nationality) && (
              <>
                <dt className="opacity-60">국적</dt>
                <dd>{safeStr(payload.nationality)}</dd>
              </>
            )}
            {safeStr(payload.language) && (
              <>
                <dt className="opacity-60">언어</dt>
                <dd>{safeStr(payload.language)}</dd>
              </>
            )}
            {safeStr(payload.visa) && (
              <>
                <dt className="opacity-60">비자</dt>
                <dd>{safeStr(payload.visa)}</dd>
              </>
            )}
          </dl>
        </div>
      );

    case "HOUSING": {
      const url = safeUrl(payload.link);
      return (
        <div className={`rounded-lg border p-3 ${surfaceClass}`}>
          <div className="text-[10px] font-mono uppercase opacity-60">HOUSING</div>
          <div className="mt-1 text-sm font-semibold">
            {safeStr(payload.title) ?? "주거 안내"}
          </div>
          {safeStr(payload.region) && (
            <div className="mt-1 text-xs opacity-80">
              {safeStr(payload.region)}
            </div>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-xs opacity-70 hover:underline"
            >
              상세 보기 →
            </a>
          )}
        </div>
      );
    }

    case "RESUME": {
      const fields = (payload.fields ?? {}) as CardPayloadAny;
      const entries = Object.entries(fields).filter(([, v]) => safeStr(v));
      return (
        <div className={`rounded-lg border p-3 ${surfaceClass}`}>
          <div className="text-[10px] font-mono uppercase opacity-60">RESUME</div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {entries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="opacity-60">{k}</dt>
                <dd>{safeStr(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    }

    case "GENERIC":
    default: {
      const url = safeUrl(payload.link);
      const image = safeUrl(payload.image);
      return (
        <div className={`overflow-hidden rounded-lg border ${surfaceClass}`}>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={safeStr(payload.title) ?? ""}
              className="max-h-40 w-full object-cover"
            />
          )}
          <div className="p-2.5">
            <div className="text-[10px] font-mono uppercase opacity-60">
              {cardType}
            </div>
            {safeStr(payload.title) && (
              <div className="mt-0.5 text-sm font-medium">
                {safeStr(payload.title)}
              </div>
            )}
            {safeStr(payload.body) && (
              <p className="mt-1 whitespace-pre-wrap text-xs opacity-80">
                {safeStr(payload.body)}
              </p>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-xs opacity-70 hover:underline"
              >
                바로가기 →
              </a>
            )}
          </div>
        </div>
      );
    }
  }
}

/**
 * cardPayload(JSON 문자열)을 안전 파싱.
 * 실패 시 null. 컴포넌트 호출 측에서 null이면 텍스트 폴백.
 */
export function parseCardPayload(raw: string | null): CardPayloadAny | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as CardPayloadAny) : null;
  } catch {
    return null;
  }
}

export const CARD_TYPES: CardType[] = [
  "PLAN",
  "VIDEO",
  "PROFILE",
  "HOUSING",
  "RESUME",
  "GENERIC",
];
