-- Tarte Shifts labour feed: roster rows carry whether the shift is published
-- (GM desk roster-horizon check). Nullable, nothing existing changes.
ALTER TABLE "LabourShift" ADD COLUMN IF NOT EXISTS "published" BOOLEAN;
