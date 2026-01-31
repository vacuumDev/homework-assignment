/*
  Warnings:

  - You are about to drop the column `lockedUntil` on the `CronLock` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CronLock" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "lockedBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CronLock" ("lockedBy", "name", "updatedAt") SELECT "lockedBy", "name", "updatedAt" FROM "CronLock";
DROP TABLE "CronLock";
ALTER TABLE "new_CronLock" RENAME TO "CronLock";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
