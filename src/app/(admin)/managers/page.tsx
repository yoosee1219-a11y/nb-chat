import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { MANAGER_ROLE } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ManagerForm } from "./manager-form";
import { DeactivateManagerButton } from "./deactivate-button";

export default async function ManagersPage() {
  const session = await requireSession();

  // ADMIN 외 forbidden
  if (session.role !== "ADMIN") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Lock className="h-5 w-5" />
            접근 권한 없음
          </CardTitle>
          <CardDescription>
            매니저 관리 기능은 관리자(ADMIN) 권한만 사용 가능합니다.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const managers = await prisma.manager.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">매니저 관리</h2>
          <p className="text-sm text-muted-foreground">
            상담사 계정 · 전체 {managers.length}명 (활성{" "}
            {managers.filter((m) => m.isActive).length})
          </p>
        </div>
        <ManagerForm />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">매니저 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>활성</TableHead>
                <TableHead>최근 로그인</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {managers.map((m) => {
                const role = MANAGER_ROLE[m.role as keyof typeof MANAGER_ROLE];
                const isMe = m.id === session.managerId;
                const initials = m.name.slice(0, 2).toUpperCase();

                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{m.name}</span>
                        {isMe && (
                          <Badge variant="secondary" className="text-xs">
                            본인
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{m.email}</TableCell>
                    <TableCell>
                      {role ? (
                        <Badge variant="outline" className={role.className}>
                          {role.label}
                        </Badge>
                      ) : (
                        m.role
                      )}
                    </TableCell>
                    <TableCell>
                      {m.isActive ? (
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
                      {m.lastLoginAt
                        ? formatDistanceToNow(m.lastLoginAt, {
                            locale: ko,
                            addSuffix: true,
                          })
                        : "기록 없음"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(m.createdAt, "yyyy.MM.dd", { locale: ko })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end">
                        <ManagerForm
                          existing={{
                            id: m.id,
                            email: m.email,
                            name: m.name,
                            role: m.role,
                            isActive: m.isActive,
                          }}
                        />
                        {!isMe && m.isActive && (
                          <DeactivateManagerButton
                            id={m.id}
                            email={m.email}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
