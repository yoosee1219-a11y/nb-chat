import {
  Users,
  Clock,
  MessagesSquare,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NATIONALITY, type ConsultationStatus } from "@/lib/constants";
import { PageHeader } from "../_components/page-header";
import { StatusDonut } from "./status-donut";

export default async function DashboardPage() {
  const [
    totalApplicants,
    pending,
    inProgress,
    confirmed,
    cancelled,
    unconfirmed,
    unrespondedRooms,
    byNationality,
  ] = await Promise.all([
    prisma.applicant.count(),
    prisma.applicant.count({ where: { status: "PENDING" } }),
    prisma.applicant.count({ where: { status: "IN_PROGRESS" } }),
    prisma.applicant.count({ where: { status: "CONFIRMED" } }),
    prisma.applicant.count({ where: { status: "CANCELLED" } }),
    prisma.applicant.count({ where: { status: "UNCONFIRMED" } }),
    prisma.chatRoom.count({ where: { unreadCount: { gt: 0 } } }),
    prisma.applicant.groupBy({
      by: ["nationality"],
      _count: { _all: true },
      orderBy: { _count: { nationality: "desc" } },
    }),
  ]);

  const stats: KpiStat[] = [
    {
      label: "전체 신청자",
      value: totalApplicants,
      unit: "명",
      hint: "누적 신청 건수",
      icon: Users,
      tone: "indigo",
    },
    {
      label: "대기중",
      value: pending,
      unit: "건",
      hint: "신규 상담 대기",
      icon: Clock,
      tone: "amber",
    },
    {
      label: "상담 중",
      value: inProgress,
      unit: "건",
      hint: "진행 중인 케이스",
      icon: MessagesSquare,
      tone: "cyan",
    },
    {
      label: "확정",
      value: confirmed,
      unit: "건",
      hint: "가입 확정",
      icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "미응답 채팅",
      value: unrespondedRooms,
      unit: "건",
      hint: "응답 필요",
      icon: AlertCircle,
      tone: "rose",
    },
  ];

  const statusData: { status: ConsultationStatus; count: number }[] = [
    { status: "PENDING", count: pending },
    { status: "IN_PROGRESS", count: inProgress },
    { status: "CONFIRMED", count: confirmed },
    { status: "UNCONFIRMED", count: unconfirmed },
    { status: "CANCELLED", count: cancelled },
  ];

  return (
    <div>
      <PageHeader
        title="대시보드"
        description="외국인 통신사 가입 상담 현황을 한눈에 확인하세요"
        breadcrumbs={[{ label: "홈", href: "/dashboard" }, { label: "대시보드" }]}
      />

      <div className="space-y-6">
      {/* KPI 카드 — 5열 */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <KpiCard key={s.label} stat={s} />
        ))}
      </div>

      {/* 2열: 도넛 차트 + 국적별 분포 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">상담 상태 분포</CardTitle>
            <CardDescription className="text-xs">
              현재 신청자 상태별
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatusDonut data={statusData} />
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
              {statusData
                .filter((d) => d.count > 0)
                .map((d) => (
                  <StatusLegend key={d.status} status={d.status} count={d.count} />
                ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">국적별 신청자</CardTitle>
            <CardDescription className="text-xs">
              다국어 자동번역 채팅 대상
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byNationality.length === 0 ? (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {byNationality.map((row) => {
                  const nat = NATIONALITY[row.nationality];
                  return (
                    <Badge
                      key={row.nationality}
                      variant="outline"
                      className="gap-1.5 px-2.5 py-1 text-xs"
                    >
                      <span>{nat?.flag}</span>
                      <span>{nat?.label ?? row.nationality}</span>
                      <span className="font-semibold">{row._count._all}</span>
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

// ─── 컴포넌트 ─────────────────────────────────────────

type Tone = "indigo" | "amber" | "cyan" | "emerald" | "rose";

type KpiStat = {
  label: string;
  value: number;
  unit: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
};

const TONE_BG: Record<Tone, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  cyan: "bg-cyan-50 text-cyan-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
};

function KpiCard({ stat }: { stat: KpiStat }) {
  const Icon = stat.icon;
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1.5 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight">
                {stat.value.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">{stat.unit}</span>
            </p>
          </div>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_BG[stat.tone]}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{stat.hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusLegend({
  status,
  count,
}: {
  status: ConsultationStatus;
  count: number;
}) {
  const COLORS: Record<ConsultationStatus, string> = {
    PENDING: "bg-[var(--color-chart-3)]",
    IN_PROGRESS: "bg-[var(--color-chart-1)]",
    CONFIRMED: "bg-[var(--color-chart-5)]",
    CANCELLED: "bg-[var(--color-chart-4)]",
    UNCONFIRMED: "bg-[var(--color-chart-2)]",
  };
  const LABELS: Record<ConsultationStatus, string> = {
    PENDING: "대기중",
    IN_PROGRESS: "상담 중",
    CONFIRMED: "확정",
    CANCELLED: "취소",
    UNCONFIRMED: "미확정",
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${COLORS[status]}`} />
      <span className="text-muted-foreground">{LABELS[status]}</span>
      <span className="ml-auto font-medium">{count}</span>
    </div>
  );
}
