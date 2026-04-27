import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기중",
  IN_PROGRESS: "상담 중",
  CONFIRMED: "확정",
  CANCELLED: "취소",
  UNCONFIRMED: "미확정",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700 border-gray-200",
  IN_PROGRESS: "bg-amber-100 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
  UNCONFIRMED: "bg-sky-100 text-sky-700 border-sky-200",
};

const NATIONALITY: Record<string, string> = {
  VN: "베트남",
  NP: "네팔",
  TW: "대만",
  TL: "동티모르",
  LA: "라오스",
  RU: "러시아",
  MN: "몽골",
  MM: "미얀마",
  US: "미국",
  BD: "방글라데시",
  KR: "대한민국",
  ETC: "기타",
};

export default async function DashboardPage() {
  const [
    totalApplicants,
    pending,
    inProgress,
    confirmed,
    unrespondedRooms,
    byNationality,
  ] = await Promise.all([
    prisma.applicant.count(),
    prisma.applicant.count({ where: { status: "PENDING" } }),
    prisma.applicant.count({ where: { status: "IN_PROGRESS" } }),
    prisma.applicant.count({ where: { status: "CONFIRMED" } }),
    prisma.chatRoom.count({ where: { unreadCount: { gt: 0 } } }),
    prisma.applicant.groupBy({
      by: ["nationality"],
      _count: { _all: true },
      orderBy: { _count: { nationality: "desc" } },
    }),
  ]);

  const stats = [
    { label: "전체 신청자", value: totalApplicants, hint: "누적" },
    { label: "대기중", value: pending, hint: "신규 상담 대기" },
    { label: "상담 중", value: inProgress, hint: "진행 중인 케이스" },
    { label: "확정", value: confirmed, hint: "가입 확정" },
    { label: "미응답 채팅", value: unrespondedRooms, hint: "응답 필요" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">대시보드</h2>
        <p className="text-sm text-muted-foreground">
          외국인 통신사 가입 상담 현황
        </p>
      </div>

      {/* KPI 카드 */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 국적별 분포 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">국적별 신청자</CardTitle>
          <CardDescription>다국어 자동번역 채팅 대상</CardDescription>
        </CardHeader>
        <CardContent>
          {byNationality.length === 0 ? (
            <p className="text-sm text-muted-foreground">데이터 없음</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {byNationality.map((row) => (
                <Badge
                  key={row.nationality}
                  variant="outline"
                  className="text-sm"
                >
                  {NATIONALITY[row.nationality] ?? row.nationality}{" "}
                  <span className="ml-1 font-semibold">
                    {row._count._all}
                  </span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상태 범례 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">상담 상태 체계</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <Badge
                key={key}
                variant="outline"
                className={STATUS_COLOR[key]}
              >
                {label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
