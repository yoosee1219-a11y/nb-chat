import { Bot, Workflow, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ChatbotFlowPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">챗봇 플로우</h2>
        <p className="text-sm text-muted-foreground">
          노드 기반 챗봇 시나리오 빌더
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Week 5 구현 예정
          </Badge>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            챗봇 플로우 빌더 — Vijob v1 미구현 기능
          </CardTitle>
          <CardDescription>
            Vijob 시스템에서 메뉴만 있고 구현되지 않은 부분. 우리 v2의 핵심
            차별화입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Feature
              icon={<Workflow className="h-4 w-4" />}
              title="비주얼 플로우 빌더"
              desc="@xyflow/react 기반 드래그&드롭 노드 에디터 (n8n/Typebot 패턴)"
            />
            <Feature
              icon={<Zap className="h-4 w-4" />}
              title="LLM 노드"
              desc="Claude/GPT API 호출 노드로 FAQ 자동응답·요약·분류"
            />
            <Feature
              icon={<Bot className="h-4 w-4" />}
              title="조건/분기 노드"
              desc="언어/국적/상태별 분기, 사람 매니저로 에스컬레이션"
            />
          </div>

          <div className="rounded-md bg-muted/50 p-4 text-sm">
            <p className="font-medium mb-2">노드 타입 (계획):</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>메시지 노드 — 정적 텍스트 / 카드 / 이미지 발송</li>
              <li>조건 노드 — 신청자 속성 기반 분기</li>
              <li>LLM 노드 — Claude/GPT 호출 + 프롬프트 관리</li>
              <li>번역 노드 — 명시적 번역 단계</li>
              <li>사람 연결 노드 — 매니저 채팅으로 전환</li>
              <li>대기 노드 — 시간 지연 / 응답 대기</li>
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
