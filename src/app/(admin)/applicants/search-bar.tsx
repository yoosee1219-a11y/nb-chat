"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { NATIONALITY, CONSULTATION_STATUS } from "@/lib/constants";

const ALL = "__all__";

export function ApplicantSearchBar({
  partners,
}: {
  partners?: { code: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [nationality, setNationality] = useState(params.get("nationality") ?? ALL);
  const [status, setStatus] = useState(params.get("status") ?? ALL);
  const [partner, setPartner] = useState(params.get("partner") ?? ALL);

  useEffect(() => {
    const t = setTimeout(() => apply(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function apply() {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (nationality !== ALL) sp.set("nationality", nationality);
    if (status !== ALL) sp.set("status", status);
    if (partner !== ALL) sp.set("partner", partner);
    startTransition(() => router.replace(`/applicants?${sp.toString()}`));
  }

  function reset() {
    setQ("");
    setNationality(ALL);
    setStatus(ALL);
    setPartner(ALL);
    startTransition(() => router.replace("/applicants"));
  }

  const hasFilter =
    !!q || nationality !== ALL || status !== ALL || partner !== ALL;
  const partnerLookup = Object.fromEntries(
    (partners ?? []).map((p) => [p.code, p.name])
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="이름 검색..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select
        value={nationality}
        onValueChange={(v) => {
          setNationality(v);
          startTransition(() => {
            const sp = new URLSearchParams(params.toString());
            if (v === ALL) sp.delete("nationality");
            else sp.set("nationality", v);
            router.replace(`/applicants?${sp.toString()}`);
          });
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          {nationality === ALL ? (
            <span className="text-muted-foreground">국적 전체</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span>{NATIONALITY[nationality]?.flag}</span>
              <span>{NATIONALITY[nationality]?.label ?? nationality}</span>
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>국적 전체</SelectItem>
          {Object.entries(NATIONALITY).map(([code, n]) => (
            <SelectItem key={code} value={code}>
              {n.flag} {n.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status}
        onValueChange={(v) => {
          setStatus(v);
          startTransition(() => {
            const sp = new URLSearchParams(params.toString());
            if (v === ALL) sp.delete("status");
            else sp.set("status", v);
            router.replace(`/applicants?${sp.toString()}`);
          });
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          {status === ALL ? (
            <span className="text-muted-foreground">상태 전체</span>
          ) : (
            <span>
              {CONSULTATION_STATUS[status as keyof typeof CONSULTATION_STATUS]
                ?.label ?? status}
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>상태 전체</SelectItem>
          {Object.entries(CONSULTATION_STATUS).map(([code, s]) => (
            <SelectItem key={code} value={code}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {partners && partners.length > 0 && (
        <Select
          value={partner}
          onValueChange={(v) => {
            setPartner(v);
            startTransition(() => {
              const sp = new URLSearchParams(params.toString());
              if (v === ALL) sp.delete("partner");
              else sp.set("partner", v);
              router.replace(`/applicants?${sp.toString()}`);
            });
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            {partner === ALL ? (
              <span className="text-muted-foreground">유입 전체</span>
            ) : (
              <span>
                {partner === "DIRECT"
                  ? "자체광고"
                  : (partnerLookup[partner] ?? partner)}
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>유입 전체</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.code === "DIRECT" ? "자체광고" : p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hasFilter && (
        <Button
          variant="ghost"
          size="icon"
          onClick={reset}
          disabled={isPending}
          title="초기화"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
