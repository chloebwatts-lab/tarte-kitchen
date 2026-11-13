-- 13 Nov 2026: price alerts store per-g / per-ml prices. At 4 decimal places
-- $8.78 per 500g (0.01756/g) was saved as 0.0176 and the digest showed
-- $17.60/kg instead of $17.56. Widen to 8 places (same as the pricing
-- rebuild tables). Widening only, no data lost.
ALTER TABLE "PriceAlert" ALTER COLUMN "currentPrice" TYPE DECIMAL(14,8);
ALTER TABLE "PriceAlert" ALTER COLUMN "priorPrice" TYPE DECIMAL(14,8);
ALTER TABLE "PriceAlert" ALTER COLUMN "priorPeriodMedian" TYPE DECIMAL(14,8);
