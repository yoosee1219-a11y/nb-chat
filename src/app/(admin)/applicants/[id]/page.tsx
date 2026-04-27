import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  MessageCircle,
  ArrowLeft,
  Phone,
  Mail,
  IdCard,
  Calendar,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  CONSULTATION_STATUS,
  LANGUAGE,
  NATIONALITY,
  type ConsultationStatus,
} from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusChange } from "./status-change";
import { NoteForm } from "./note-form";
import { NoteItem } from "./note-item";

export default async function ApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await getSession())!; // (admin) layout에서 보장

  const applicant = await prisma.applicant.findUnique({
    where: { id },
    include: {
      appliedPlan: true,
      rooms: { select: { id: true, unreadCount: true } },
      notes: {
        include: { manager: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      statusHistory: {
        include: { manager: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!applicant) notFound();

  // 조회 감사 로그
  await audit({
    managerId: session.managerId,
    action: "APPLICANT_VIEWED",
    resource: `applicant:${id}`,
  });

  const nat = NATIONALITY[applicant.nationality];
  const lang = LANGUAGE[applicant.preferredLanguage];
  const room = applicant.rooms[0];

  return (
    <div className="space-y-6">
      {/* 상단 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/applicants">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{applicant.name}</h2>
            <p className="text-sm text-muted-foreground">
              신청 ID:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {applicant.id}
              </code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusChange
            applicantId={applicant.id}
            currentStatus={applicant.status}
          />
          {room && (
            <Button asChild>
              <Link href={`/chat?roomId=${room.id}`}>
                <MessageCircle className="mr-2 h-4 w-4" />
                채팅 열기
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 좌: 기본 정보 */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">신청 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow
                label="국적"
                value={nat ? `${nat.flag} ${nat.label}` : applicant.nationality}
              />
              <InfoRow
                label="모국어 (자동번역 대상)"
                value={lang ? `${lang.label} (${lang.bcp47})` : applicant.preferredLanguage}
              />
              <InfoRow
                label="비자"
                value={applicant.visa ?? "-"}
                icon={<IdCard className="h-4 w-4" />}
              />
              <InfoRow
                label="연락처"
                value={applicant.phone ?? "-"}
                icon={<Phone className="h-4 w-4" />}
              />
              <InfoRow
                label="이메일"
                value={applicant.email ?? "-"}
                icon={<Mail className="h-4 w-4" />}
              />
              <InfoRow
                label="신청 일시"
                value={format(applicant.appliedAt, "yyyy.MM.dd HH:mm:ss", {
                  locale: ko,
                })}
                icon={<Calendar className="h-4 w-4" />}
              />

              <Separator />

              <div className="flex items-center gap-4 text-sm">
                <ConsentBadge label="개인정보 동의" ok={applicant.privacyConsent} />
                <ConsentBadge label="제3자 동의" ok={applicant.thirdPartyConsent} />
              </div>
            </CardContent>
          </Card>

          {applicant.appliedPlan && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">신청 요금제</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-semibold">
                    {applicant.appliedPlan.name}
                  </p>
                  <p className="text-2xl font-bold">
                    {applicant.appliedPlan.monthlyFee.toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}원/월
                    </span>
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {applicant.appliedPlan.carrier}
                </p>
                {applicant.appliedPlan.description && (
                  <p className="text-sm">{applicant.appliedPlan.description}</p>
                )}
                <div className="mt-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/plans`}>요금제 상세 보기 &gt;</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 우: 메모 + 상태 이력 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">메모</CardTitle>
              <CardDescription>매니저 내부용</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NoteForm applicantId={applicant.id} />

              <div className="space-y-2">
                {applicant.notes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    메모가 없습니다.
                  </p>
                ) : (
                  applicant.notes.map((n) => (
                    <NoteItem
                      key={n.id}
                      note={n}
                      currentManagerId={session.managerId}
                      isAdmin={session.role === "ADMIN"}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">상태 변경 이력</CardTitle>
            </CardHeader>
            <CardContent>
              {applicant.statusHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">변경 이력 없음</p>
              ) : (
                <ol className="space-y-2">
                  {applicant.statusHistory.map((h) => {
                    const from =
                      CONSULTATION_STATUS[h.fromStatus as ConsultationStatus];
                    const to =
                      CONSULTATION_STATUS[h.toStatus as ConsultationStatus];
                    return (
                      <li
                        key={h.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        {from && (
                          <Badge variant="outline" className={from.className}>
                            {from.label}
                          </Badge>
                        )}
                        <span>→</span>
                        {to && (
                          <Badge variant="outline" className={to.className}>
                            {to.label}
                          </Badge>
                        )}
                        <span className="ml-auto text-muted-foreground">
                          {h.manager.name} ·{" "}
                          {format(h.changedAt, "MM.dd HH:mm", { locale: ko })}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ConsentBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>
        {label}: {ok ? "동의" : "미동의"}
      </span>
    </span>
  );
}
