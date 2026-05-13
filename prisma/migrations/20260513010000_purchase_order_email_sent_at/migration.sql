-- Track when the order email actually went out via the Gmail integration,
-- separate from `submittedAt` (which only means the user marked the order
-- as SUBMITTED in-app). Lets the UI tell apart "snapshot ready, copy/paste
-- it yourself" from "we already sent it for you at 09:14."
ALTER TABLE "PurchaseOrder"
  ADD COLUMN "emailSentAt" TIMESTAMP(3);
