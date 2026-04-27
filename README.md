# NB Chat

> 외국인 통신사 가입 상담 관리 시스템 — 자동번역 채팅 + 챗봇 플로우 빌더

## 개요

외국인 대상 통신사(LGU+/KT/SKT) 가입 상담을 한 곳에서 처리하는 어드민 시스템.
13개국어 자동번역 채팅을 핵심으로, 매니저는 한국어로만 응대해도 신청자는 모국어로 본다.

## 스택

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **TypeScript 5** (strict)
- **Prisma 7** + better-sqlite3 어댑터 (dev) — 운영 시 PostgreSQL
- **Tailwind v4** + **shadcn/ui** + **Pretendard**
- **Socket.IO** standalone 서버 (포트 4001) — Vijob 호환 이벤트 사양
- **next-auth 미사용** — `jose` 기반 자체 JWT 세션 (httpOnly + SameSite=Strict)
- **recharts** (대시보드), **@xyflow/react** (챗봇 빌더)

## 시작

```bash
npm install
npm run seed             # 시드: 매니저 3 / 요금제 4 / 신청자 5 + 메시지 18

# 두 터미널에서 동시 실행
npm run dev              # http://localhost:3000  (Next dev)
npm run dev:socket       # http://localhost:4001  (Socket.IO)
```

### 시드 계정

| 이메일 | 비밀번호 | 권한 |
|---|---|---|
| `admin@fics.local` | `admin123` | ADMIN |
| `manager1@fics.local` | `manager123` | MANAGER |
| `manager2@fics.local` | `manager123` | MANAGER |

## 디렉터리

```
webapp/
├─ prisma/
│  ├─ schema.prisma       # 도메인 모델 (Manager/Applicant/Plan/ChatRoom/Message/...)
│  └─ seed.ts             # 시드 + 다국어 메시지 (RU/VI/MN/MY/NE)
├─ src/
│  ├─ app/
│  │  ├─ (admin)/         # 인증 후 어드민
│  │  │  ├─ _components/  # PageHeader 등 공용
│  │  │  ├─ dashboard/    # KPI + 도넛 차트
│  │  │  ├─ applicants/   # 신청자 CRUD + 상세/메모/상태이력
│  │  │  ├─ plans/        # 요금제 CRUD (사용 중이면 soft-delete)
│  │  │  ├─ managers/     # 매니저 CRUD (ADMIN-only)
│  │  │  ├─ chat/         # 자동번역 3-pane 채팅
│  │  │  └─ chatbot-flow/ # 챗봇 플로우 빌더 (Phase 4)
│  │  └─ login/
│  ├─ lib/
│  │  ├─ auth.ts          # JWT 세션 (jose)
│  │  ├─ prisma.ts        # 클라이언트 싱글톤
│  │  ├─ audit.ts         # 감사 로그
│  │  ├─ constants.ts     # NATIONALITY/LANGUAGE/STATUS/CARRIER 라벨
│  │  ├─ socket-types.ts  # 양방향 이벤트 타입 (클라/서버 공유)
│  │  ├─ socket-client.ts # 브라우저 싱글톤
│  │  └─ translation.ts   # Translator 인터페이스 (mock → 추후 Google v3)
│  ├─ server/
│  │  └─ socket.ts        # Standalone Socket.IO (인증/권한/번역/broadcast)
│  └─ proxy.ts            # Next 16 proxy(미들웨어) — 인증 가드
├─ scripts/
│  └─ capture.mjs         # Edge headless QA 스크린샷 자동화
└─ next.config.ts         # 보안 헤더 (HSTS/CSP/X-Frame/Referrer-Policy/Permissions-Policy)
```

## 진척

- ✅ Phase 1: 인프라 + 인증 + 보안 헤더
- ✅ Phase 2: 어드민 CRUD (대시보드/신청자/요금제/매니저)
- ✅ Phase 3.1: 채팅 UI 셸 (3-pane, 자동번역 듀얼 표시)
- ✅ Phase 3.2: 실시간 송수신 (Standalone Socket.IO + 권한 체크)
- ✅ Phase 5.1~5.2: 디자인 통일 (Pretendard, 다크 사이드바, PageHeader 컴포넌트)
- ⏭ Phase 3.3: Outbox + BullMQ (메시지 손실 방지) — 멀티노드 가면
- ⏭ Phase 3.4: Google Cloud Translation v3 실 연동
- ⏭ Phase 4: 챗봇 플로우 빌더 (xyflow + LLM 노드)

## 확장성 포인트 (코드에 박혀있음)

| 항목 | 현재 | 미래 교체 위치 |
|---|---|---|
| Socket.IO namespace | `/chat` 고정 | `lib/socket-types.ts` `CHAT_NAMESPACE` |
| Pub/Sub 어댑터 | in-memory | `server/socket.ts` Redis adapter 자리 |
| 번역 엔진 | MockTranslator | `lib/translation.ts` `getTranslator()` 분기 |
| 메시지 손실 방지 | 직접 broadcast | `chat:send` 핸들러에 Outbox row 추가로 교체 |
| 인증 | 쿠키 우선 + 토큰 fallback | cross-site 시 토큰 엔드포인트 추가 |
| DB | SQLite | Prisma adapter 교체 → PostgreSQL |
