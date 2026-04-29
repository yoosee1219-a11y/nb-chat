-- Phase 5.8 — 메시지 수정/삭제 (soft-delete)
ALTER TABLE "messages" ADD COLUMN "editedAt" DATETIME;
ALTER TABLE "messages" ADD COLUMN "deletedAt" DATETIME;
