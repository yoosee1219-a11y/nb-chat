# NB Chat 핸드오프 (2026-04-30 시점)

## 🎯 프로젝트 목적
- **Vijob FICS** 외국인 통신사 가입 상담 시스템 클론 + 향상
- 광고 라이브 직전. 거래처 신뢰성 + 광고비 loss 방지가 최우선

## 🚀 현재 prod 상태
- **Vercel**: `https://nb-chat-pi.vercel.app` (alias: nb-chat-yoosee1219-3402s-projects.vercel.app)
- **Railway Socket**: `https://nb-chat-production.up.railway.app` (port 8080)
- **Turso DB**: `libsql://nb-chat-yoosee1219-a11y.aws-ap-northeast-1.turso.io` (도쿄)
- **최근 commit**: `e08c452` — 첫 ADMIN 매니저 자동 시드 (managers 0명일 때만)

## ✅ 완료된 검증
| 항목 | 결과 |
|---|---|
| Vercel 빌드 | Ready |
| Turso 자동 마이그레이션 (build hook) | 14 테이블, _nb_migrations 메타 정상 |
| Railway Socket 응답 | `{"ok":true,"service":"nb-chat-socket","port":8080}` |
| `/api/health` | DB 475ms / Socket 767ms — `status:ok` |
| `/r/stealup` HMAC 쿠키 | 정상 발급, CSP에 Railway WS 자동 반영 |
| **prod E2E 광고 클릭→가입→채팅** | **4/4 통과** (qa-prod-full-flow.mjs) |
| 부하 (10 VU × 30s) | p50=591ms, p95=1443ms, 실패율 0%, rate-limit 60/min 정확 |
| 부하 (50 VU × 30s) | p95=4092ms (cold start 비율 높음 — 봇 시나리오) |

## 🔴 다시 PC 켜면 즉시 진행할 작업

### 1. prod 매니저 계정 재설정 (#49 — 2026-04-30 진행)
**현황 (이전)**: prod Turso에 매니저 3명 존재하지만 비밀번호 분실.
**해결**: 기존 매니저 3명 비활성화 + 신규 `admin`/`user` 2명 (아이디 형식).

**실행**: Turso 대시보드 → `nb-chat-yoosee1219-a11y` DB → SQL Console에 `scripts/reset-prod-managers.sql` 통째로 붙여넣기.

새 계정:
- `admin` / `admin1234` (ADMIN)
- `user`  / `user1234`  (MANAGER)

**보안 주의**: 첫 로그인 후 `/managers`에서 즉시 비밀번호 변경.

### 2. 부하 개선 (선택, 광고 라이브 후 천천히)
- p95 1.4초 → 800ms 미만 목표
- 옵션 A: Vercel 함수 memory 1024MB (`vercel.json`에 functions config 추가)
- 옵션 B: rate-limit count 쿼리 in-memory cache (5초 TTL, Vercel function 인스턴스 단위)
- 옵션 C: Turso edge replica (비용 발생)

### 3. Sentry DSN 등록 (사고 추적)
- https://sentry.io 가입
- Next.js 프로젝트 생성 → DSN 복사
- Vercel env에 추가:
  - `SENTRY_DSN`
  - `NEXT_PUBLIC_SENTRY_DSN` (같은 값)
- 코드는 이미 통합됨 (DSN 미설정 시 no-op). DSN 등록되면 자동 동작.

### 4. 추가 QA 시나리오 (#51 미완)
- 메시지 수정/삭제 prod 동작 검증
- typing indicator + read receipt prod
- /partner-stats 페이지 prod 데이터 표시
- 클릭 → 가입 후 prod DB의 partner_clicks/applicants raw 데이터 분석

## 📋 모든 환경변수 정리

### Vercel (Production)
- `AUTH_SECRET` — JWT 서명 키 (Encrypted)
- `DATABASE_URL` — Turso libsql:// URL
- `DATABASE_AUTH_TOKEN` — Turso 인증 토큰 (사용자가 발급, 메모장 백업 권장)
- `NEXT_PUBLIC_SOCKET_URL` — `https://nb-chat-production.up.railway.app`

### Vercel (선택, Sentry 가입 후)
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (source map 업로드용)
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (첫 ADMIN 시드 커스터마이징)

### Railway (Socket service)
- `AUTH_SECRET` — Vercel과 동일
- `DATABASE_URL` — Vercel과 동일
- `DATABASE_AUTH_TOKEN` — Vercel과 동일
- `SOCKET_ALLOWED_ORIGINS` = `https://nb-chat-pi.vercel.app,https://nb-chat-yoosee1219-3402s-projects.vercel.app`
- `SOCKET_PORT` (이제 무시됨 — `PORT` 자동 주입 사용)
- ~~`NEXT_PUBLIC_SOCKET_URL`~~ (이전에 있었으면 삭제 권장)

## 📄 핵심 문서
- `docs/PERMISSIONS.md` — VIEWER/MANAGER/ADMIN 권한 매트릭스
- `loadtest/README.md` — 부하 테스트 가이드
- `scripts/qa-prod-full-flow.mjs` — prod E2E (신청자측 4/4 통과)
- `scripts/qa-prod-manager.mjs` — prod 매니저 측 (계정 확보 후 검증)
- `scripts/verify-source-cookie.mjs` — HMAC 단위 (5/5 통과)

## 🛠 자주 쓰는 명령

```bash
# 로컬 dev
npm run dev:socket   # 터미널 1
npm run dev          # 터미널 2

# 풀 회귀 (모든 E2E)
node scripts/verify-source-cookie.mjs        # 5/5
node scripts/verify-tracking-scenarios.mjs   # 8/8
node scripts/verify-phase57-features.mjs     # 4/4
node scripts/verify-phase58-features.mjs     # 4/4
node scripts/verify-outbox.mjs               # 2/2
node scripts/verify-card-typing-read.mjs     # 3/3

# prod E2E
node scripts/qa-prod-full-flow.mjs

# 부하 (정상)
node loadtest/burst-node.mjs https://nb-chat-pi.vercel.app 10 30

# 부하 (봇 시나리오)
node loadtest/burst-node.mjs https://nb-chat-pi.vercel.app 100 60
```

## 🎬 광고 라이브 시 거래처에 줄 URL 형태

```
스텔업 배너:    https://nb-chat-pi.vercel.app/r/stealup?utm_campaign=2026q2&utm_medium=banner
워크온 SMS:     https://nb-chat-pi.vercel.app/r/workon?utm_campaign=spring&utm_medium=sms
QR 포스터:      https://nb-chat-pi.vercel.app/r/stealup?campaign=qr-busan&medium=qr
유튜브 자체광고: https://nb-chat-pi.vercel.app/r/DIRECT?utm_campaign=yt-vn&utm_medium=video
```

거래처 코드는 `/partners` 페이지에서 추가/수정.

## 통계 페이지
👉 https://nb-chat-pi.vercel.app/partner-stats (매니저 로그인 후)
