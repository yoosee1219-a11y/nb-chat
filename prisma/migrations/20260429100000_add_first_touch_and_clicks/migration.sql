-- Phase 5.7 — first-touch attribution + raw click log

-- 1) Applicant — first-touch 컬럼 추가
ALTER TABLE "applicants" ADD COLUMN "firstTouchPartnerId" TEXT;
ALTER TABLE "applicants" ADD COLUMN "firstTouchCampaign" TEXT;
ALTER TABLE "applicants" ADD COLUMN "firstTouchMedium" TEXT;
ALTER TABLE "applicants" ADD COLUMN "firstTouchLandedAt" DATETIME;

CREATE INDEX "applicants_firstTouchPartnerId_appliedAt_idx"
  ON "applicants"("firstTouchPartnerId", "appliedAt");

-- 2) PartnerClick — raw 클릭 로그
CREATE TABLE "partner_clicks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partnerId" TEXT,
  "originalCode" TEXT NOT NULL,
  "campaign" TEXT,
  "medium" TEXT,
  "referrer" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "sessionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_clicks_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "partner_clicks_partnerId_createdAt_idx"
  ON "partner_clicks"("partnerId", "createdAt");
CREATE INDEX "partner_clicks_originalCode_createdAt_idx"
  ON "partner_clicks"("originalCode", "createdAt");
CREATE INDEX "partner_clicks_createdAt_idx"
  ON "partner_clicks"("createdAt");
