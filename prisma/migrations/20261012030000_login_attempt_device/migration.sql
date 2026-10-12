-- Lockout by device, not only by address (12 Oct 2026). Every phone and iPad
-- on a venue's wifi shares one public IP, so five mistyped PINs by anyone
-- there locked the whole venue out of the staff sign-in for 15 minutes.
-- The browser's tk_device id is recorded alongside the address.
ALTER TABLE "LoginAttempt" ADD COLUMN IF NOT EXISTS "device" TEXT;
CREATE INDEX IF NOT EXISTS "LoginAttempt_gate_device_createdAt_idx" ON "LoginAttempt"("gate", "device", "createdAt");
