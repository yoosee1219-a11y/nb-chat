# 부하 테스트 (Phase 5.9)

광고 라이브 직전 트래픽 시뮬레이션.

## 설치 (k6)
```bash
# Windows
choco install k6
# 또는 winget
winget install k6 --source winget
```

## 실행

### 1. 로컬 dev 서버 (안전, 권장)
```bash
# webapp 폴더에서
npm run dev:socket &
npm run dev &
# 다른 터미널에서
k6 run -e BASE_URL=http://localhost:3000 loadtest/click-burst.js
```

### 2. Vercel prod (D-1, SSO 해제 후)
```bash
k6 run -e BASE_URL=https://nb-chat.vercel.app loadtest/click-burst.js
```

## 시나리오 추가 가능
- `chat-burst.js` — 동시 채팅 1000 메시지 (Socket 부하)
- `apply-burst.js` — 동시 가입 폼 제출 (DB 트랜잭션 부하)

## 부하 후 정리

```sql
-- Turso 또는 dev.db에서
DELETE FROM partner_clicks WHERE campaign LIKE 'loadtest-%';
```

## 통과 기준
- `p(95) < 800ms` — Vercel Edge + Turso 일본 리전 RTT 고려
- `http_req_failed < 5%` — rate-limit (60/min) 제외 실패율
- 정상 클릭 ≥ 70% (나머지는 rate-limited 의도된 차단)
