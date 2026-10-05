-- Which sides each person sold (name -> units), so the challenge page can
-- open a name and show what made up their number.
ALTER TABLE "DailyStaffUpsell" ADD COLUMN IF NOT EXISTS "breakdown" JSONB;
