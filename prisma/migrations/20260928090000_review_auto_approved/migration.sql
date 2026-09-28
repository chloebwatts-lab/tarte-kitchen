-- Rating-only 5-star replies post without a human tap (Chloe, 2026-09-28).
-- Flag them so the approval email and any audit can tell them apart.
ALTER TABLE "GoogleReview" ADD COLUMN IF NOT EXISTS "autoApproved" BOOLEAN NOT NULL DEFAULT false;
