import { MessageCircle, Languages, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ChatPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">채팅</h2>
        <p className="text-sm text-muted-foreground">
          신청자와 채팅으로 소통합니다 · 자동번역 지원
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Week 3-4 구현 예정
          </Badge>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            자동번역 채팅 시스템
          </CardTitle>
          <CardDescription>
            FICS 클론의 핵심 기능 — 곧 구현됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Feature
              icon={<Languages className="h-4 w-4" />}
              title="양방향 자동번역"
              desc="신청자 자국어 ↔ 한국어 실시간 번역 (Google Cloud Translation v3)"
            />
            <Feature
              icon={<Shield className="h-4 w-4" />}
              title="메시지 손실 0"
              desc="Outbox 패턴 + Socket.IO ack + 클라이언트 재전송 큐"
            />
            <Feature
              icon={<MessageCircle className="h-4 w-4" />}
              title="풀 메시지 타입"
              desc="텍스트, 이미지, 파일, 음성, 카드(이력서/주거/요금제)"
            />
          </div>

          <div className="rounded-md bg-muted/50 p-4 text-sm">
            <p className="font-medium mb-2">계획된 기술 스택:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Socket.IO + Redis Pub/Sub (멀티 인스턴스)</li>
              <li>BullMQ Outbox 워커 (트랜잭션 안전 broadcast)</li>
              <li>Google Cloud Translation v3 + Redis 30일 캐시</li>
              <li>클라이언트 IndexedDB 재전송 큐</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
