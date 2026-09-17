-- Brute-force lockout log for every password gate. Additive only.
CREATE TABLE "LoginAttempt" (
  "id" TEXT NOT NULL,
  "gate" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginAttempt_gate_ip_createdAt_idx" ON "LoginAttempt"("gate", "ip", "createdAt");
CREATE INDEX "LoginAttempt_gate_createdAt_idx" ON "LoginAttempt"("gate", "createdAt");

-- GM desk phone alerts (web push subscriptions). Additive only.
CREATE TABLE "GmPushSub" (
  "id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GmPushSub_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GmPushSub_endpoint_key" ON "GmPushSub"("endpoint");
