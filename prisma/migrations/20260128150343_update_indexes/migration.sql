-- DropIndex
DROP INDEX "UsageEvent_billedAt_idx";

-- DropIndex
DROP INDEX "UsageEvent_customerId_createdAt_idx";

-- CreateIndex
CREATE INDEX "UsageEvent_customerId_billedAt_createdAt_idx" ON "UsageEvent"("customerId", "billedAt", "createdAt");
