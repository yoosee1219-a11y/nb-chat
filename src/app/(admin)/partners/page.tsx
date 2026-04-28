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
import { PartnerForm } from "./partner-form";
import { DeletePartnerButton } from "./delete-button";
import { CopyLinkButton } from "./copy-link-button";
import { PageHeader } from "../_components/page-header";

export default async function PartnersPage() {
  const partners = await prisma.partner.findMany({
    include: {
      _count: { select: { applicants: true } },
    },
    orderBy: [
      { isActive: "desc" },
      { createdAt: "asc" }, // DIRECT가 시드에서 가장 먼저 만들어지므로 자연스럽게 위
    ],
  });

  const total = partners.length;
  const active = partners.filter((p) => p.isActive).length;

  return (
    <div>
      <PageHeader
        title="거래처 관리"
        description={`전체 ${total}개 (활성 ${active}) — 유입 추적용`}
        breadcrumbs={[
          { label: "홈", href: "/dashboard" },
          { label: "거래처 관리" },
        ]}
        actions={<PartnerForm />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">거래처 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              거래처가 없습니다. 우측 상단 '거래처 추가'로 등록하세요.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>거래처명</TableHead>
                  <TableHead>코드 / 진입 URL</TableHead>
                  <TableHead>담당자/연락처</TableHead>
                  <TableHead>유입 신청자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>등록일</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => {
                  const isDirect = p.code === "DIRECT";
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {isDirect && (
                            <Badge
                              variant="outline"
                              className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]"
                            >
                              자체광고
                            </Badge>
                          )}
                        </div>
                        {p.memo && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {p.memo}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                            /r/{p.code}
                          </code>
                          <CopyLinkButton code={p.code} />
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.contact ?? "-"}
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
                          <PartnerForm
                            existing={{
                              id: p.id,
                              code: p.code,
                              name: p.name,
                              contact: p.contact,
                              memo: p.memo,
                              isActive: p.isActive,
                            }}
                          />
                          <DeletePartnerButton
                            id={p.id}
                            name={p.name}
                            isDirect={isDirect}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
