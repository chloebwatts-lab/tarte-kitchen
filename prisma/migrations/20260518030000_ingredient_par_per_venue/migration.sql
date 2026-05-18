-- Per-venue par levels for ingredients. Replaces the single Ingredient.parLevel
-- where present; the old column stays as a fallback for ingredients with no
-- per-venue row yet.

CREATE TYPE "ParSource" AS ENUM ('SUGGESTED', 'MANUAL');

CREATE TABLE "IngredientPar" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "parLevel" DECIMAL(12,3) NOT NULL,
    "parUnit" TEXT NOT NULL,
    "source" "ParSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngredientPar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IngredientPar_ingredientId_venue_key" ON "IngredientPar"("ingredientId", "venue");
CREATE INDEX "IngredientPar_venue_idx" ON "IngredientPar"("venue");

ALTER TABLE "IngredientPar" ADD CONSTRAINT "IngredientPar_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: any existing Ingredient.parLevel becomes a BURLEIGH MANUAL par.
INSERT INTO "IngredientPar" ("id", "ingredientId", "venue", "parLevel", "parUnit", "source", "createdAt", "updatedAt")
SELECT 'cmp' || substr(md5(random()::text), 1, 22), id, 'BURLEIGH', "parLevel", COALESCE("parUnit", "purchaseUnit"), 'MANUAL', NOW(), NOW()
FROM "Ingredient"
WHERE "parLevel" IS NOT NULL;
