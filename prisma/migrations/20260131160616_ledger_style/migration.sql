/*
  Warnings:

  - You are about to drop the `WalletCredit` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WalletCredit";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "entryType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CronLock" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "lockedUntil" DATETIME NOT NULL,
    "lockedBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LedgerEntry_walletId_createdAt_idx" ON "LedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletId_sourceType_sourceId_idx" ON "LedgerEntry"("walletId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_walletId_idempotencyKey_key" ON "LedgerEntry"("walletId", "idempotencyKey");
