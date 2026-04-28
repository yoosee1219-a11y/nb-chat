import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
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
import { AUDIT_ACTIONS } from "@/lib/constants";
import { PageHeader } from "../_components/page-header";

const PAGE_SIZE = 50;

const ACTION_TONE: Record<string, string> = {
  LOGIN: "bg-emerald-100 text-emerald-700 border-emerald-200",
  LOGOUT: "bg-gray-100 text-gray-600 border-gray-200",
  APPLICANT_VIEWED: "bg-blue-100 text-blue-700 border-blue-200",
  APPLICANT_STATUS_CHANGED: "bg-amber-100 text-amber-700 border-amber-200",
  PARTNER_CREATED: "bg-purple-100 text-purple-700 border-purple-200",
  PARTNER_UPDATED: "bg-purple-100 text-purple-700 border-purple-200",
  PARTNER_DELETED: "bg-rose-100 text-rose-700 border-rose-200",
  FLOW_CREATED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  FLOW_SAVED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  FLOW_DELETED: "bg-rose-100 text-rose-700 border-rose-200",
  PLAN_CREATED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PLAN_DELETED: "bg-rose-100 text-rose-700 border-rose-200",
};

function formatAction(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

function safeFormatMetadata(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // 손상된 JSON은 raw로 표시 (페이지 전체 500 방지)
    return raw.length > 500 ? raw.slice(0, 500) + "…" : raw;
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    manager?: string;
    action?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard"); // ADMIN only

  const { page, manager, action } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? "1") || 1);

  const where = {
    ...(manager ? { managerId: manager } : {}),
    ...(action ? { action } : {}),
  };

  const [logs, total, managers, actionGroups] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        manager: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (currentPage - 1) * PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.manager.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 10,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="감사 로그 (Audit)"
        description={`${total.toLocaleString()}건 — ADMIN 전용 보안 추적`}
        breadcrumbs={[
          { label: "홈", href: "/dashboard" },
          { label: "감사 로그" },
        ]}
      />

      <div className="space-y-6">
        {/* 액션 통계 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">액션 TOP 10</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {actionGroups.map((g) => (
                <Badge
                  key={g.action}
                  variant="outline"
                  className={`gap-1.5 ${ACTION_TONE[g.action] ?? ""}`}
                >
                  {formatAction(g.action)}
                  <span className="font-bold">{g._count._all}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 필터 */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <form className="flex flex-wrap gap-3" method="get">
              <select
                name="manager"
                defaultValue={manager ?? ""}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">매니저 전체</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
              <select
                name="action"
                defaultValue={action ?? ""}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">액션 전체</option>
                {Object.entries(AUDIT_ACTIONS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
              >
                필터 적용
              </button>
              {(manager || action) && (
                <a
                  href="/audit"
                  className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                >
                  초기화
                </a>
              )}
            </form>
          </CardContent>
        </Card>

        {/* 로그 표 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              로그 ({logs.length}/{total.toLocaleString()})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                로그 없음
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시간</TableHead>
                    <TableHead>매니저</TableHead>
                    <TableHead>액션</TableHead>
                    <TableHead>리소스</TableHead>
                    <TableHead>메타</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {format(l.createdAt, "MM.dd HH:mm:ss", { locale: ko })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {l.manager.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {l.manager.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={ACTION_TONE[l.action] ?? ""}
                        >
                          {formatAction(l.action)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {l.resource}
                        </code>
                      </TableCell>
                      <TableCell>
                        {l.metadata ? (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              보기
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px]">
                              {safeFormatMetadata(l.metadata)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {l.ipAddress ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                {currentPage > 1 && (
                  <a
                    href={`?page=${currentPage - 1}${manager ? `&manager=${manager}` : ""}${action ? `&action=${action}` : ""}`}
                    className="rounded-md border px-3 py-1 hover:bg-muted"
                  >
                    이전
                  </a>
                )}
                <span className="text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                {currentPage < totalPages && (
                  <a
                    href={`?page=${currentPage + 1}${manager ? `&manager=${manager}` : ""}${action ? `&action=${action}` : ""}`}
                    className="rounded-md border px-3 py-1 hover:bg-muted"
                  >
                    다음
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
