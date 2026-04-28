-- AlterTable
ALTER TABLE "plans" ADD COLUMN "commitment" TEXT;

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "memo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_applicants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "visa" TEXT,
    "privacyConsent" BOOLEAN NOT NULL DEFAULT false,
    "thirdPartyConsent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedPlanId" TEXT,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourcePartnerId" TEXT,
    "sourceCampaign" TEXT,
    "sourceMedium" TEXT,
    "sourceReferrer" TEXT,
    "sourceLandedAt" DATETIME,
    CONSTRAINT "applicants_appliedPlanId_fkey" FOREIGN KEY ("appliedPlanId") REFERENCES "plans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "applicants_sourcePartnerId_fkey" FOREIGN KEY ("sourcePartnerId") REFERENCES "partners" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_applicants" ("appliedAt", "appliedPlanId", "createdAt", "email", "id", "name", "nationality", "phone", "preferredLanguage", "privacyConsent", "status", "thirdPartyConsent", "updatedAt", "visa") SELECT "appliedAt", "appliedPlanId", "createdAt", "email", "id", "name", "nationality", "phone", "preferredLanguage", "privacyConsent", "status", "thirdPartyConsent", "updatedAt", "visa" FROM "applicants";
DROP TABLE "applicants";
ALTER TABLE "new_applicants" RENAME TO "applicants";
CREATE INDEX "applicants_status_idx" ON "applicants"("status");
CREATE INDEX "applicants_nationality_idx" ON "applicants"("nationality");
CREATE INDEX "applicants_sourcePartnerId_appliedAt_idx" ON "applicants"("sourcePartnerId", "appliedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "partners_code_key" ON "partners"("code");
