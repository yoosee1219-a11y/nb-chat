-- CreateTable
CREATE TABLE "chatbot_flows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trigger" TEXT,
    "nodesData" TEXT NOT NULL DEFAULT '[]',
    "edgesData" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "chatbot_flows_status_idx" ON "chatbot_flows"("status");
