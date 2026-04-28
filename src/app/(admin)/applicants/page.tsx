import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import {
  CONSULTATION_STATUS,
  NATIONALITY,
  type ConsultationStatus,
} from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApplicantSearchBar } from "./search-bar";
import { PageHeader } from "../_components/page-header";

const PAGE_SIZE = 30;

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    nationality?: string;
    status?: string;
    partner?: string;
    page?: string;
  }>;
}) {
  const { q, nationality, status, partner, page } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? "1") || 1);

  const where = {
    ...(q ? { name: { contains: q } } : {}),
    ...(nationality ? { nationality } : {}),
    ...(status ? { status } : {}),
    ...(partner ? { sourcePartner: { code: partner } } : {}),
  };

  const [applicants, total, partners] = await Promise.all([
    prisma.applicant.findMany({
      where,
      include: {
        appliedPlan: { select: { name: true, monthlyFee: true } },
        rooms: { select: { unreadCount: true } },
        sourcePartner: { select: { code: true, name: true } },
      },
      orderBy: { appliedAt: "desc" },
      take: PAGE_SIZE,
      skip: (currentPage - 1) * PAGE_SIZE,
    }),
    prisma.applicant.count({ where }),
    prisma.partner.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="신청자 관리"
        description={`총 ${total.toLocaleString()}명`}
        breadcrumbs={[
          { label: "홈", href: "/dashboard" },
          { label: "신청자 관리" },
        ]}
      />

      <div className="space-y-6">
      <ApplicantSearchBar partners={partners} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            신청자 목록 ({applicants.length}/{total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {applicants.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              데이터 없음
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>국적</TableHead>
                  <TableHead>비자</TableHead>
                  <TableHead>유입 거래처</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>신청 요금제</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>신청 일시</TableHead>
                  <TableHead className="text-right">미응답</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applicants.map((a) => {
                  const nat = NATIONALITY[a.nationality] ?? {
                    label: a.nationality,
                    flag: "",
                  };
                  const st =
                    CONSULTATION_STATUS[a.status as ConsultationStatus] ??
                    null;
                  const unread = a.rooms.reduce(
                    (acc, r) => acc + r.unreadCount,
                    0
                  );

                  return (
                    <TableRow key={a.id} className="cursor-pointer">
                      <TableCell>
                        <Link
                          href={`/applicants/${a.id}`}
                          className="font-medium hover:underline"
                        >
                          {a.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="mr-1">{nat.flag}</span>
                        {nat.label}
                      </TableCell>
                      <TableCell>{a.visa ?? "-"}</TableCell>
                      <TableCell>
                        {a.sourcePartner ? (
                          <Badge
                            variant="outline"
                            className={
                              a.sourcePartner.code === "DIRECT"
                                ? "bg-purple-100 text-purple-700 border-purple-200"
                                : "bg-blue-100 text-blue-700 border-blue-200"
                            }
                          >
                            {a.sourcePartner.code === "DIRECT"
                              ? "자체광고"
                              : a.sourcePartner.name}
                            {a.sourceCampaign && (
                              <span className="ml-1 opacity-60">
                                · {a.sourceCampaign}
                              </span>
                            )}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">미상</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.phone ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.appliedPlan?.name ?? "-"}
                      </TableCell>
                      <TableCell>
                        {st ? (
                          <Badge
                            variant="outline"
                            className={st.className}
                          >
                            {st.label}
                          </Badge>
                        ) : (
                          a.status
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(a.appliedAt, "yyyy.MM.dd HH:mm", {
                          locale: ko,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {unread > 0 ? (
                          <Badge variant="destructive">{unread}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {currentPage} / {totalPages} 페이지
              </p>
              <div className="flex gap-2">
                {currentPage > 1 && (
                  <Link
                    href={{
                      pathname: "/applicants",
                      query: {
                        ...(q ? { q } : {}),
                        ...(nationality ? { nationality } : {}),
                        ...(status ? { status } : {}),
                        page: currentPage - 1,
                      },
                    }}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    이전
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={{
                      pathname: "/applicants",
                      query: {
                        ...(q ? { q } : {}),
                        ...(nationality ? { nationality } : {}),
                        ...(status ? { status } : {}),
                        page: currentPage + 1,
                      },
                    }}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    다음
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
