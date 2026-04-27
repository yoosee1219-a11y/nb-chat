-- CreateTable
CREATE TABLE "managers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MANAGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "applicants" (
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
    CONSTRAINT "applicants_appliedPlanId_fkey" FOREIGN KEY ("appliedPlanId") REFERENCES "plans" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'LGU+',
    "monthlyFee" INTEGER NOT NULL,
    "dataAllowance" TEXT,
    "voiceMinutes" TEXT,
    "smsCount" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantId" TEXT NOT NULL,
    "managerId" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chat_rooms_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chat_rooms_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT,
    "type" TEXT NOT NULL,
    "originalText" TEXT,
    "language" TEXT,
    "translatedText" TEXT,
    "attachments" TEXT,
    "cardType" TEXT,
    "cardPayload" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "chat_rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "notes_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notes_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_history_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "status_history_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "managerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "processedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "translation_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentHash" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "managers_email_key" ON "managers"("email");

-- CreateIndex
CREATE INDEX "applicants_status_idx" ON "applicants"("status");

-- CreateIndex
CREATE INDEX "applicants_nationality_idx" ON "applicants"("nationality");

-- CreateIndex
CREATE INDEX "chat_rooms_managerId_lastMessageAt_idx" ON "chat_rooms"("managerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_rooms_applicantId_idx" ON "chat_rooms"("applicantId");

-- CreateIndex
CREATE INDEX "messages_roomId_createdAt_idx" ON "messages"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_roomId_isRead_idx" ON "messages"("roomId", "isRead");

-- CreateIndex
CREATE INDEX "notes_applicantId_idx" ON "notes"("applicantId");

-- CreateIndex
CREATE INDEX "status_history_applicantId_changedAt_idx" ON "status_history"("applicantId", "changedAt");

-- CreateIndex
CREATE INDEX "audit_logs_managerId_createdAt_idx" ON "audit_logs"("managerId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_processedAt_createdAt_idx" ON "outbox"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "translation_cache_contentHash_key" ON "translation_cache"("contentHash");

-- CreateIndex
CREATE INDEX "translation_cache_contentHash_idx" ON "translation_cache"("contentHash");
