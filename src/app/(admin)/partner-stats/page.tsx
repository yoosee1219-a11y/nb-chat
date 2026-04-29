import { redirect } from "next/navigation";
import { TrendingUp, MousePointerClick, UserCheck, Percent } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../_components/page-header";

/**
 * 거래처별 통계 대시보드 — Phase 5.9
 *
 * 핵심 지표:
 *  - 클릭 수 (PartnerClick raw)
 *  - 가입 수 (Applicant.sourcePartnerId — last-touch / firstTouchPartnerId)
 *  - 전환율 = 가입 / 클릭
 *  - first vs last touch 차이 (브랜드 임팩트 vs 막판 클로저)
 *  - 일자별 추이 (지난 14일)
 *
 * 광고 제휴사에 그대로 보낼 수 있는 형태.
 */
type RangePreset = "7d" | "14d" | "30d" | "all";

export default async function PartnerStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { range: rangeParam } = await searchParams;
  const range = (["7d", "14d", "30d", "all"].includes(rangeParam ?? "")
    ? rangeParam
    : "14d") as RangePreset;

  const since: Date | null =
    range === "all"
      ? null
      : new Date(
          Date.now() -
            (range === "7d" ? 7 : range === "14d" ? 14 : 30) * 86400_000
        );

  // ───── 데이터 페치 ─────
  const [partners, allClicks, allApplicants] = await Promise.all([
    prisma.partner.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
    prisma.partnerClick.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      select: {
        partnerId: true,
        createdAt: true,
        campaign: true,
        medium: true,
      },
    }),
    prisma.applicant.findMany({
      where: since ? { appliedAt: { gte: since } } : {},
      select: {
        sourcePartnerId: true,
        firstTouchPartnerId: true,
        sourceCampaign: true,
        appliedAt: true,
      },
    }),
  ]);

  // ───── 거래처별 집계 ─────
  type PartnerRow = {
    id: string | null;
    code: string;
    name: string;
    isActive: boolean;
    clicks: number;
    applicants_last: number; // last-touch 기준 가입
    applicants_first: number; // first-touch 기준 가입
    cvr_last: number; // 가입/클릭
  };

  const rowMap = new Map<string, PartnerRow>();
  for (const p of partners) {
    rowMap.set(p.id, {
      id: p.id,
      code: p.code,
      name: p.name,
      isActive: p.isActive,
      clicks: 0,
      applicants_last: 0,
      applicants_first: 0,
      cvr_last: 0,
    });
  }
  // unknown — null partnerId
  rowMap.set("__null__", {
    id: null,
    code: "(미상)",
    name: "(미상/매칭 실패)",
    isActive: false,
    clicks: 0,
    applicants_last: 0,
    applicants_first: 0,
    cvr_last: 0,
  });

  for (const c of allClicks) {
    const key = c.partnerId ?? "__null__";
    const row = rowMap.get(key);
    if (row) row.clicks++;
  }
  for (const a of allApplicants) {
    const lastKey = a.sourcePartnerId ?? "__null__";
    const lastRow = rowMap.get(lastKey);
    if (lastRow) lastRow.applicants_last++;
    const firstKey = a.firstTouchPartnerId ?? "__null__";
    const firstRow = rowMap.get(firstKey);
    if (firstRow) firstRow.applicants_first++;
  }
  for (const row of rowMap.values()) {
    row.cvr_last = row.clicks > 0 ? row.applicants_last / row.clicks : 0;
  }

  const rows = Array.from(rowMap.values())
    .filter((r) => r.clicks > 0 || r.applicants_last > 0 || r.applicants_first > 0)
    .sort((a, b) => b.clicks - a.clicks || b.applicants_last - a.applicants_last);

  // 전체 합계
  const totals = rows.reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.clicks,
      applicants: acc.applicants + r.applicants_last,
    }),
    { clicks: 0, applicants: 0 }
  );
  const totalCvr =
    totals.clicks > 0 ? totals.applicants / totals.clicks : 0;

  // 일자별 추이 (지난 14일 기준)
  const trendDays = range === "7d" ? 7 : 14;
  const trendStart = new Date(
    Date.now() - trendDays * 86400_000
  );
  trendStart.setHours(0, 0, 0, 0);
  const trendBuckets = new Map<string, { clicks: number; applicants: number }>();
  for (let i = 0; i < trendDays; i++) {
    const d = new Date(trendStart.getTime() + i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    trendBuckets.set(key, { clicks: 0, applicants: 0 });
  }
  for (const c of allClicks) {
    if (c.createdAt < trendStart) continue;
    const key = c.createdAt.toISOString().slice(0, 10);
    const b = trendBuckets.get(key);
    if (b) b.clicks++;
  }
  for (const a of allApplicants) {
    if (a.appliedAt < trendStart) continue;
    const key = a.appliedAt.toISOString().slice(0, 10);
    const b = trendBuckets.get(key);
    if (b) b.applicants++;
  }
  const trendData = Array.from(trendBuckets.entries()).map(([day, v]) => ({
    day,
    ...v,
  }));
  const trendMaxClick = Math.max(...trendData.map((t) => t.clicks), 1);

  // 캠페인 TOP 10
  const campaignMap = new Map<string, { clicks: number; applicants: number; partnerCode: string }>();
  for (const c of allClicks) {
    if (!c.campaign) continue;
    const partnerRow = c.partnerId ? partners.find((p) => p.id === c.partnerId) : null;
    const key = `${partnerRow?.code ?? "?"}::${c.campaign}`;
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        clicks: 0,
        applicants: 0,
        partnerCode: partnerRow?.code ?? "?",
      });
    }
    campaignMap.get(key)!.clicks++;
  }
  for (const a of allApplicants) {
    if (!a.sourceCampaign) continue;
    const partnerRow = a.sourcePartnerId ? partners.find((p) => p.id === a.sourcePartnerId) : null;
    const key = `${partnerRow?.code ?? "?"}::${a.sourceCampaign}`;
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        clicks: 0,
        applicants: 0,
        partnerCode: partnerRow?.code ?? "?",
      });
    }
    campaignMap.get(key)!.applicants++;
  }
  const campaignRows = Array.from(campaignMap.entries())
    .map(([key, v]) => ({
      key,
      partnerCode: v.partnerCode,
      campaign: key.split("::")[1],
      clicks: v.clicks,
      applicants: v.applicants,
      cvr: v.clicks > 0 ? v.applicants / v.clicks : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return (
    <div>
      <PageHeader
        title="거래처 통계"
        description="제휴사별 광고 클릭/가입/전환율 — Phase 5.7+"
        breadcrumbs={[
          { label: "홈", href: "/dashboard" },
          { label: "거래처 통계" },
        ]}
      />

      <div className="space-y-6">
        {/* 기간 선택 */}
        <div className="flex flex-wrap gap-2">
          {(["7d", "14d", "30d", "all"] as RangePreset[]).map((r) => (
            <a
              key={r}
              href={`/partner-stats?range=${r}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                range === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {r === "7d" ? "7일" : r === "14d" ? "14일" : r === "30d" ? "30일" : "전체"}
            </a>
          ))}
        </div>

        {/* 전체 KPI */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">총 클릭</p>
                  <p className="mt-1 text-3xl font-bold">{totals.clicks.toLocaleString()}</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                  <MousePointerClick className="h-4 w-4" />
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">총 가입</p>
                  <p className="mt-1 text-3xl font-bold">{totals.applicants.toLocaleString()}</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <UserCheck className="h-4 w-4" />
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">전환율</p>
                  <p className="mt-1 text-3xl font-bold">
                    {(totalCvr * 100).toFixed(1)}
                    <span className="ml-0.5 text-sm font-normal text-muted-foreground">%</span>
                  </p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Percent className="h-4 w-4" />
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">활성 거래처</p>
                  <p className="mt-1 text-3xl font-bold">
                    {partners.filter((p) => p.isActive && p.code !== "DIRECT").length}
                  </p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 일자별 추이 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">일자별 추이 (최근 {trendDays}일)</CardTitle>
            <CardDescription className="text-xs">
              막대=클릭, 점=가입
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1.5">
              {trendData.map((d) => {
                const h = (d.clicks / trendMaxClick) * 100;
                return (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${d.day}: 클릭 ${d.clicks} / 가입 ${d.applicants}`}
                  >
                    <div className="relative flex w-full flex-col items-center justify-end" style={{ height: "100px" }}>
                      <div
                        className="w-full rounded-t bg-cyan-400"
                        style={{ height: `${h}%`, minHeight: d.clicks > 0 ? "2px" : "0" }}
                      />
                      {d.applicants > 0 && (
                        <span
                          className="absolute h-2 w-2 rounded-full bg-emerald-600 ring-2 ring-emerald-200"
                          style={{
                            bottom: `${Math.min((d.applicants / trendMaxClick) * 100, 95)}%`,
                          }}
                        />
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground">
                      {d.day.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 거래처별 표 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">거래처별 성과</CardTitle>
            <CardDescription className="text-xs">
              클릭/가입(last-touch)/가입(first-touch)/전환율 (last 기준)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">데이터 없음</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-xs">
                    <tr>
                      <th className="px-4 py-2 text-left">거래처</th>
                      <th className="px-4 py-2 text-right">클릭</th>
                      <th className="px-4 py-2 text-right">가입(last)</th>
                      <th className="px-4 py-2 text-right">가입(first)</th>
                      <th className="px-4 py-2 text-right">전환율</th>
                      <th className="px-4 py-2 text-right">차이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const diff = r.applicants_first - r.applicants_last;
                      return (
                        <tr key={r.code} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-xs">{r.code}</code>
                              <span className="text-xs text-muted-foreground">{r.name}</span>
                              {!r.isActive && r.code !== "(미상)" && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                  비활성
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {r.clicks.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">
                            {r.applicants_last.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                            {r.applicants_first.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {r.clicks > 0 ? `${(r.cvr_last * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td
                            className={`px-4 py-2 text-right tabular-nums ${
                              diff > 0
                                ? "text-blue-600"
                                : diff < 0
                                  ? "text-rose-600"
                                  : "text-muted-foreground"
                            }`}
                            title="first - last (양수 = 첫 진입 후 다른 거래처로 이탈, 음수 = 다른 거래처에서 들어왔다가 여기서 가입)"
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 text-xs">
                    <tr>
                      <td className="px-4 py-2 font-semibold">합계</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {totals.clicks.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {totals.applicants.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {(totalCvr * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 캠페인 TOP 10 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">캠페인 TOP 10 (클릭 순)</CardTitle>
            <CardDescription className="text-xs">
              UTM 캠페인별 성과 — 광고 효율 최적화 참고
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {campaignRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">캠페인 데이터 없음</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-xs">
                    <tr>
                      <th className="px-4 py-2 text-left">거래처</th>
                      <th className="px-4 py-2 text-left">캠페인</th>
                      <th className="px-4 py-2 text-right">클릭</th>
                      <th className="px-4 py-2 text-right">가입</th>
                      <th className="px-4 py-2 text-right">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignRows.map((r) => (
                      <tr key={r.key} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          <code className="font-mono text-xs">{r.partnerCode}</code>
                        </td>
                        <td className="px-4 py-2">
                          <code className="truncate font-mono text-xs">{r.campaign}</code>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.clicks}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.applicants}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {r.clicks > 0 ? `${(r.cvr * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
