import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  IdCard,
  Phone,
  Mail,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CONSULTATION_STATUS,
  LANGUAGE,
  NATIONALITY,
  type ConsultationStatus,
} from "@/lib/constants";

type SidePanelProps = {
  applicant: {
    id: string;
    name: string;
    nationality: string;
    preferredLanguage: string;
    email: string | null;
    phone: string | null;
    visa: string | null;
    privacyConsent: boolean;
    thirdPartyConsent: boolean;
    status: string;
    appliedAt: Date;
  };
  appliedPlan: {
    id: string;
    name: string;
    monthlyFee: number;
    carrier: string;
  } | null;
  roomId: string;
};

export function ApplicantSidePanel({
  applicant,
  appliedPlan,
}: SidePanelProps) {
  const nat = NATIONALITY[applicant.nationality];
  const lang = LANGUAGE[applicant.preferredLanguage];
  const status = CONSULTATION_STATUS[applicant.status as ConsultationStatus];

  return (
    <aside className="flex h-full w-full flex-col border-l bg-background">
      <div className="border-b p-3">
        <h3 className="text-sm font-semibold">상담 정보</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 text-sm">
          {/* 신청자 헤더 */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{nat?.flag}</span>
              <h4 className="text-base font-semibold">{applicant.name}</h4>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {status && (
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                · {nat?.label ?? applicant.nationality}
              </span>
            </div>
          </div>

          <Separator />

          {/* 기본 정보 */}
          <dl className="space-y-2.5">
            <Row icon={<IdCard className="h-3.5 w-3.5" />} label="모국어">
              {lang?.label ?? applicant.preferredLanguage}{" "}
              <span className="font-mono text-[10px] text-muted-foreground">
                ({lang?.bcp47})
              </span>
            </Row>
            <Row icon={<IdCard className="h-3.5 w-3.5" />} label="비자">
              {applicant.visa ?? "-"}
            </Row>
            <Row icon={<Phone className="h-3.5 w-3.5" />} label="연락처">
              {applicant.phone ?? "-"}
            </Row>
            <Row icon={<Mail className="h-3.5 w-3.5" />} label="이메일">
              {applicant.email ?? "-"}
            </Row>
            <Row icon={<Calendar className="h-3.5 w-3.5" />} label="신청 일시">
              {format(applicant.appliedAt, "yyyy.MM.dd HH:mm", { locale: ko })}
            </Row>
          </dl>

          <Separator />

          {/* 동의 */}
          <div className="space-y-2">
            <ConsentRow ok={applicant.privacyConsent} label="개인정보 동의" />
            <ConsentRow
              ok={applicant.thirdPartyConsent}
              label="제3자 제공 동의"
            />
          </div>

          {/* 신청 요금제 */}
          {appliedPlan && (
            <>
              <Separator />
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  신청 요금제
                </p>
                <div className="rounded-md border p-3">
                  <div className="flex items-baseline justify-between">
                    <p className="font-medium">{appliedPlan.name}</p>
                    <p className="text-base font-bold">
                      {appliedPlan.monthlyFee.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}원/월
                      </span>
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {appliedPlan.carrier}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 푸터 액션 */}
      <div className="space-y-2 border-t p-3">
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href={`/applicants/${applicant.id}`}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            신청자 상세 보기
          </Link>
        </Button>
      </div>
    </aside>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-xs font-medium">{children}</dd>
    </div>
  );
}

function ConsentRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>
        {label}: {ok ? "동의" : "미동의"}
      </span>
    </div>
  );
}
