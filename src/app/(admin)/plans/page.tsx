import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
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
import { PlanForm } from "./plan-form";
import { DeletePlanButton } from "./delete-button";
import { PageHeader } from "../_components/page-header";

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({
    include: {
      _count: { select: { applicants: true } },
    },
    orderBy: [{ carrier: "asc" }, { monthlyFee: "asc" }],
  });

  const total = plans.length;
  const active = plans.filter((p) => p.isActive).length;

  return (
    <div>
      <PageHeader
        title="요금제 관리"
        description={`전체 ${total}개 (활성 ${active})`}
        breadcrumbs={[
          { label: "홈", href: "/dashboard" },
          { label: "요금제 관리" },
        ]}
        actions={<PlanForm />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">요금제 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              데이터 없음
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>통신사</TableHead>
                  <TableHead>요금제명</TableHead>
                  <TableHead>월 요금</TableHead>
                  <TableHead>데이터</TableHead>
                  <TableHead>통화</TableHead>
                  <TableHead>SMS</TableHead>
                  <TableHead>신청자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>등록일</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline">{p.carrier}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono">
                      {p.monthlyFee.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.dataAllowance ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.voiceMinutes ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.smsCount ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {p._count.applicants}명
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.isActive ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-100 text-emerald-700 border-emerald-200"
                        >
                          활성
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-gray-100 text-gray-600 border-gray-200"
                        >
                          비활성
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(p.createdAt, "yyyy.MM.dd", { locale: ko })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end">
                        <PlanForm
                          existing={{
                            id: p.id,
                            name: p.name,
                            carrier: p.carrier,
                            monthlyFee: p.monthlyFee,
                            dataAllowance: p.dataAllowance,
                            voiceMinutes: p.voiceMinutes,
                            smsCount: p.smsCount,
                            description: p.description,
                            isActive: p.isActive,
                          }}
                        />
                        <DeletePlanButton id={p.id} name={p.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
