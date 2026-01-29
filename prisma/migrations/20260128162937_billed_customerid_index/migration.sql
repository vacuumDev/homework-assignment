-- CreateIndex
CREATE INDEX "UsageEvent_billedAt_customerId_idx" ON "UsageEvent"("billedAt", "customerId");
