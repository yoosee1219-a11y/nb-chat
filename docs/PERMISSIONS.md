# 권한 매트릭스 (Phase 5.10)

## 역할 정의

| 역할 | 설명 |
|---|---|
| **ADMIN** | 모든 권한. 매니저 관리/감사 로그 포함 |
| **MANAGER** | 일상 운영 권한. 본인 담당 또는 미배정 룸 |
| **VIEWER** | read-only. mutation 일체 불가 (감사/매니저 관리 페이지도 X) |

## mutation 권한

| 동작 | ADMIN | MANAGER | VIEWER | 코드 위치 |
|---|---|---|---|---|
| `chat:send` | ✓ | ✓ | ✗ | `socket.ts:canMutate` |
| `chat:edit` | ✓ (본인) | ✓ (본인) | ✗ | `socket.ts:chat:edit` |
| `chat:delete` | ✓ (모두) | ✓ (본인) | ✗ | `socket.ts:chat:delete` |
| `chat:typing` | ✓ | ✓ | ✓ (signal-only) | 의도된 read 보조 |
| `chat:read` | ✓ | ✓ | ✓ (read 표시만) | 의도된 read 보조 |
| 거래처 CRUD | ✓ | ✓ | ✗ | `partners/actions.ts` |
| 요금제 CRUD | ✓ | ✓ | ✗ | `plans/actions.ts` |
| 신청자 상태 변경 | ✓ | ✓ | ✗ | `applicants/actions.ts:changeStatus` |
| 메모 CRUD | ✓ | ✓ (본인) | ✗ | `applicants/actions.ts:*Note` |
| 챗봇 플로우 CRUD | ✓ | ✓ | ✗ | `chatbot-flow/actions.ts` |
| 채팅 즐겨찾기/담당 | ✓ | ✓ | ✗ | `chat/actions.ts` |
| 룸 read 마킹 | ✓ | ✓ | ✓ | 자동 추적 보조 |
| 매니저 관리 | ✓ | ✗ | ✗ | `managers/actions.ts` |
| 감사 로그 조회 | ✓ | ✗ | ✗ | `audit/page.tsx` |

## 룸 read 권한

| 룸 상태 | ADMIN | MANAGER | VIEWER |
|---|---|---|---|
| 본인 담당 | ✓ | ✓ | ✓ |
| 미배정 (managerId=null) | ✓ | ✓ | ✓ |
| 다른 매니저 담당 | ✓ | ✗ | ✗ |

## UI 표시

VIEWER 진입 시:
- 사이드바 "감사 로그" / "매니저 관리" 메뉴 숨김
- 채팅 입력창: "VIEWER 권한 — 읽기 전용" 배지 + textarea disabled
- 거래처/요금제/플로우 페이지: 추가/편집 버튼은 보이지만 클릭 시 server action이 거부

## 핵심 구현

`src/lib/permissions.ts`:
```ts
canMutate(session)   // VIEWER만 차단
canManageOrg(session) // ADMIN만
canAccessRoom(session, room) // 룸 read 권한
```

**모든 mutation server action 첫 줄에 `canMutate` 체크 강제**.
