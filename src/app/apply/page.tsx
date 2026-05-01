import type { Viewport, Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  Globe2,
  ShieldCheck,
  CreditCard,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

export const metadata: Metadata = {
  title: "외국인 통신 가입 — 모국어 5분 상담 | NB Chat",
  description:
    "E·D 비자 외국인 전용 LGU+ 요금제 가입을 모국어로 도와드립니다. 통역 비용 0원. 베트남어·미얀마어·네팔어·몽골어·태국어 자동 번역.",
};

/**
 * 게스트 진입 미니 랜딩 (Phase 6.0)
 *
 * 흐름: 광고 배너 → /r/{partner} (추적) → /apply (이 페이지) → /apply/form (신청)
 *
 * 톤: 깔끔/안전 (토스 영감) — 신뢰 시그널 강조 + 마찰 최소화
 * 1 viewport, 모바일 first, 한+영 듀얼 카피
 */
export default async function ApplyLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const sourceRaw = cookieStore.get("fics_source")?.value;

  // 진입 거래처 라벨 (투명성용 — 추후 거래처별 customization 여지)
  let fromLabel: string | null = null;
  if (sp.from) {
    const partner = await prisma.partner.findUnique({
      where: { code: sp.from },
      select: { name: true, code: true },
    });
    fromLabel =
      partner?.code === "DIRECT" ? null : (partner?.name ?? null);
  }

  const formHref = sp.from ? `/apply/form?from=${sp.from}` : "/apply/form";

  return (
    <main className="min-h-dvh bg-gradient-to-b from-white via-white to-indigo-50/40">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-6 sm:max-w-lg sm:pt-10">
        {/* ── 헤더 ─────────────────────── */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
              N
            </div>
            <span className="text-sm font-semibold text-gray-900">NB Chat</span>
          </div>
          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
            LGU+ 공식 대리점
          </span>
        </header>

        {/* ── 히어로 ─────────────────────── */}
        <section className="mb-10">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            외국인 통신 가입,
            <br />
            <span className="text-indigo-600">모국어로 5분 끝</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500 sm:text-base">
            Phone Plan for E·D Visa Foreigners
            <br />
            <span className="text-gray-400">— in your own language</span>
          </p>
        </section>

        {/* ── USP 3가지 ─────────────────────── */}
        <ul className="mb-8 space-y-3">
          <FeatureRow
            Icon={Globe2}
            title="모국어 자동 번역 채팅"
            desc="🇻🇳 🇲🇲 🇳🇵 🇲🇳 🇹🇭 + 영어"
          />
          <FeatureRow
            Icon={ShieldCheck}
            title="통역 비용 0원"
            desc="처음부터 끝까지 무료 상담"
          />
          <FeatureRow
            Icon={CreditCard}
            title="E·D 비자 외국인 전용 요금제"
            desc="선불·후불 모두 가능 / 최저 22,000원"
          />
        </ul>

        {/* ── 유심 일러스트 ─────────────────────── */}
        <div className="mb-8 flex items-center justify-center">
          <SimCardIllustration />
        </div>

        {/* ── CTA ─────────────────────── */}
        <div className="mb-6">
          <Button
            asChild
            className="h-14 w-full bg-indigo-600 text-base font-semibold shadow-sm hover:bg-indigo-700"
          >
            <Link href={formHref}>
              내 언어로 채팅 시작
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <p className="mt-2.5 text-center text-xs text-gray-400">
            Start chat in your language
          </p>
        </div>

        {/* ── 안전 안내 ─────────────────────── */}
        <ul className="mb-8 space-y-1.5 text-xs text-gray-500">
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            가입 정보는 가입 외 용도로 사용되지 않습니다
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            상담은 무료, 가입 강요 없음
          </li>
        </ul>

        {/* ── footer 신뢰 영역 ─────────────────────── */}
        <footer className="mt-auto border-t border-gray-100 pt-5">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
            <span className="font-medium text-gray-500">LGU+ 공식 대리점</span>
            <span>·</span>
            <span>통신판매업 신고번호 등록</span>
          </div>
          {fromLabel && (
            <p className="mt-2 text-center text-[10px] text-gray-300">
              via {fromLabel}
            </p>
          )}
          {!sourceRaw && (
            <p className="mt-2 text-center text-[10px] text-gray-300">
              안전한 HTTPS 연결로 보호됩니다
            </p>
          )}
        </footer>
      </div>
    </main>
  );
}

function FeatureRow({
  Icon,
  title,
  desc,
}: {
  Icon: typeof Globe2;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
        <Icon className="h-5 w-5 text-indigo-600" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
      </div>
    </li>
  );
}

function SimCardIllustration() {
  return (
    <svg
      width="180"
      height="120"
      viewBox="0 0 180 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="drop-shadow-sm"
    >
      <defs>
        <linearGradient id="simBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="chip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      {/* SIM body */}
      <rect
        x="20"
        y="14"
        width="140"
        height="90"
        rx="14"
        fill="url(#simBody)"
      />
      {/* Notch (top-right cut) */}
      <path d="M160 14 L160 38 L142 14 Z" fill="white" opacity="0.12" />
      {/* Chip */}
      <rect x="40" y="38" width="42" height="48" rx="6" fill="url(#chip)" />
      {/* Chip lines */}
      <g stroke="#92400e" strokeWidth="1.2" opacity="0.55">
        <line x1="40" y1="50" x2="82" y2="50" />
        <line x1="40" y1="62" x2="82" y2="62" />
        <line x1="40" y1="74" x2="82" y2="74" />
        <line x1="61" y1="38" x2="61" y2="86" />
      </g>
      {/* LGU+ accent dot */}
      <circle cx="135" cy="78" r="6" fill="white" opacity="0.95" />
      <circle cx="135" cy="78" r="3" fill="#ec4899" />
      {/* "5G" label */}
      <text
        x="100"
        y="58"
        fill="white"
        fontSize="14"
        fontWeight="700"
        opacity="0.95"
      >
        5G
      </text>
      <text
        x="100"
        y="74"
        fill="white"
        fontSize="9"
        fontWeight="500"
        opacity="0.75"
      >
        LGU+
      </text>
    </svg>
  );
}

export const dynamic = "force-dynamic";
