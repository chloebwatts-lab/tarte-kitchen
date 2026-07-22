-- One OPEN alert per ingredient, enforced at the database. The compute
-- upsert is a non-atomic findFirst-then-create; a manual "Recompute" racing
-- the nightly cron could create duplicate OPEN rows that then never close.
-- Duplicate-proof it with a partial unique index (dedupe any existing
-- duplicates first, keeping the most recently seen row).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "ingredientId" ORDER BY "lastSeenAt" DESC) rn
  FROM "PriceAlert" WHERE status = 'OPEN'
)
UPDATE "PriceAlert" a SET status = 'DISMISSED', "resolvedAt" = NOW()
FROM ranked r WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX "PriceAlert_open_ingredient_unique"
  ON "PriceAlert" ("ingredientId") WHERE status = 'OPEN';
