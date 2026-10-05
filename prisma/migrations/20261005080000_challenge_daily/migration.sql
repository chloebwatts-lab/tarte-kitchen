-- Challenges can crown a winner each day, and score the week per hour worked.
ALTER TABLE "SalesChallenge" ADD COLUMN IF NOT EXISTS "daily" BOOLEAN NOT NULL DEFAULT false;
