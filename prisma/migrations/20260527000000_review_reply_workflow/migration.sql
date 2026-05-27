-- AlterTable: add AI reply approval workflow fields to GoogleReview
CREATE TYPE "ReviewReplyStatus" AS ENUM ('DRAFTED', 'APPROVED', 'POSTED', 'SKIPPED');

ALTER TABLE "GoogleReview"
  ADD COLUMN "replyStatus"   "ReviewReplyStatus",
  ADD COLUMN "draftReply"    TEXT,
  ADD COLUMN "draftSentAt"   TIMESTAMP(3),
  ADD COLUMN "replyToken"    TEXT,
  ADD COLUMN "approvedAt"    TIMESTAMP(3),
  ADD COLUMN "replyPostedAt" TIMESTAMP(3);

-- Unique constraint on replyToken
CREATE UNIQUE INDEX "GoogleReview_replyToken_key" ON "GoogleReview"("replyToken");

-- Index for efficiently finding reviews that need attention
CREATE INDEX "GoogleReview_replyStatus_idx" ON "GoogleReview"("replyStatus");
