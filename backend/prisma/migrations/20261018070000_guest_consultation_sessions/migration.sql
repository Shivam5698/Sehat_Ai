PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Consultation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "guestSessionId" TEXT,
    "symptomsText" TEXT,
    "severity" TEXT,
    "emergencyLevel" TEXT,
    "transcript" TEXT,
    "reportUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'initialized',
    "language" TEXT NOT NULL DEFAULT 'en',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consultation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consultation_owner_check" CHECK (("userId" IS NOT NULL AND "guestSessionId" IS NULL) OR ("userId" IS NULL AND "guestSessionId" IS NOT NULL))
);

INSERT INTO "new_Consultation" (
    "id",
    "userId",
    "guestSessionId",
    "symptomsText",
    "severity",
    "emergencyLevel",
    "transcript",
    "reportUrl",
    "status",
    "language",
    "startedAt",
    "endedAt",
    "createdAt"
)
SELECT
    "id",
    "userId",
    NULL,
    "symptomsText",
    "severity",
    "emergencyLevel",
    "transcript",
    "reportUrl",
    "status",
    "language",
    "startedAt",
    "endedAt",
    "createdAt"
FROM "Consultation";

DROP TABLE "Consultation";
ALTER TABLE "new_Consultation" RENAME TO "Consultation";
CREATE INDEX "Consultation_guestSessionId_idx" ON "Consultation"("guestSessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;