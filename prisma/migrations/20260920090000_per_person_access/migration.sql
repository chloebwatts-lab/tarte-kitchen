-- Per-person access: signed confidentiality deeds, access trail, owner alerts.
CREATE TYPE "AccessEventKind" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'VIEW', 'DEED_SIGNED', 'CAPTURE_ATTEMPT');

CREATE TABLE "ConfidentialityDeed" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "signedName" TEXT NOT NULL,
    "signatureImg" TEXT NOT NULL,
    "guardianName" TEXT,
    "guardianSignatureImg" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "copySentTo" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConfidentialityDeed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConfidentialityDeed_staffId_version_key" ON "ConfidentialityDeed"("staffId", "version");
CREATE INDEX "ConfidentialityDeed_staffId_idx" ON "ConfidentialityDeed"("staffId");

CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "kind" "AccessEventKind" NOT NULL,
    "staffId" TEXT,
    "staffName" TEXT,
    "attemptedName" TEXT,
    "path" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessEvent_staffId_at_idx" ON "AccessEvent"("staffId", "at");
CREATE INDEX "AccessEvent_kind_at_idx" ON "AccessEvent"("kind", "at");
CREATE INDEX "AccessEvent_at_idx" ON "AccessEvent"("at");

CREATE TABLE "AccessAlert" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "staffId" TEXT,
    "staffName" TEXT,
    "summary" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessAlert_key_key" ON "AccessAlert"("key");
