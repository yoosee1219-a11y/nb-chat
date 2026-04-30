-- ============================================================
-- prod Turso 매니저 재설정 (2026-04-30)
--   - 기존 매니저 3명 비활성화 (외래키 보존)
--   - 새 admin / user 2명 생성 (아이디 형식)
--
-- 실행 방법:
--   1) Turso 대시보드 (https://turso.tech) → DB nb-chat-yoosee1219-a11y → SQL Console
--   2) 아래 블록 통째로 붙여넣고 RUN
--
-- 비밀번호 (bcrypt 사전 해시):
--   admin / admin1234
--   user  / user1234
-- ============================================================

-- 1. 기존 매니저 전부 비활성화 (DELETE 대신 — 외래키 유지)
UPDATE managers SET isActive = 0, updatedAt = datetime('now');

-- 2. admin (ADMIN) 생성
INSERT INTO managers (id, email, name, passwordHash, role, isActive, createdAt, updatedAt)
VALUES (
  'admin-2026',
  'admin',
  '관리자',
  '$2b$10$U9TZIzmPOzdSIuQl0l69ieEEZLg/qZqE/LKn1r1GMkFpA0IV.Foee',
  'ADMIN',
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(email) DO UPDATE SET
  passwordHash = excluded.passwordHash,
  role         = 'ADMIN',
  isActive     = 1,
  updatedAt    = datetime('now');

-- 3. user (MANAGER) 생성
INSERT INTO managers (id, email, name, passwordHash, role, isActive, createdAt, updatedAt)
VALUES (
  'user-2026',
  'user',
  '일반매니저',
  '$2b$10$pBF.5S.boAZaRgpkMeHiA.3gbPbjH8vaOFa3k2KyhT6wgszRbgCgq',
  'MANAGER',
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(email) DO UPDATE SET
  passwordHash = excluded.passwordHash,
  role         = 'MANAGER',
  isActive     = 1,
  updatedAt    = datetime('now');

-- 4. 검증
SELECT id, email, name, role, isActive FROM managers ORDER BY isActive DESC, createdAt DESC;
