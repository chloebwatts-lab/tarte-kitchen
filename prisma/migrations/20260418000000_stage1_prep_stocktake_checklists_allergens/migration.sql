-- Stage 1: Prep / stocktake / checklists / allergens
-- Adds the Allergen enum + ingredient array column, the Stocktake and
-- StocktakeItem tables, and the ChecklistTemplate / TemplateItem / Run /
-- RunItem tables. No changes to existing tables beyond the allergens column.

-- ---------- ENUMS ----------
CREATE TYPE "Allergen" AS ENUM (
  'MILK',
  'EGG',
  'FISH',
  'SHELLFISH',
  'CRUSTACEAN',
  'MOLLUSC',
  'TREE_NUT',
  'PEANUT',
  'WHEAT',
  'GLUTEN',
  'SOY',
  'SESAME',
  'LUPIN',
  'SULPHITE'
);

CREATE TYPE "StocktakeStatus" AS ENUM ('DRAFT', 'SUBMITTED');

CREATE TYPE "ChecklistCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ON_DEMAND');
CREATE TYPE "ChecklistShift" AS ENUM ('OPEN', 'MID', 'CLOSE', 'ANY');
CREATE TYPE "ChecklistRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- ---------- ALLERGENS ----------
ALTER TABLE "Ingredient"
  ADD COLUMN "allergens" "Allergen"[] NOT NULL DEFAULT ARRAY[]::"Allergen"[];

-- ---------- STOCKTAKE ----------
CREATE TABLE "Stocktake" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "venue" "Venue" NOT NULL,
  "status" "StocktakeStatus" NOT NULL DEFAULT 'DRAFT',
  "totalValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "countedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Stocktake_date_venue_key" ON "Stocktake"("date", "venue");
CREATE INDEX "Stocktake_venue_date_idx" ON "Stocktake"("venue", "date");

CREATE TABLE "StocktakeItem" (
  "id" TEXT NOT NULL,
  "stocktakeId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "countedQty" DECIMAL(12,3) NOT NULL,
  "countedUnit" TEXT NOT NULL,
  "countedBaseQty" DECIMAL(12,3) NOT NULL,
  "unitCost" DECIMAL(12,4) NOT NULL,
  "lineValue" DECIMAL(12,2) NOT NULL,
  "expectedBaseQty" DECIMAL(12,3),
  "varianceBaseQty" DECIMAL(12,3),
  "varianceValue" DECIMAL(12,2),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StocktakeItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StocktakeItem_stocktakeId_ingredientId_key"
  ON "StocktakeItem"("stocktakeId", "ingredientId");
CREATE INDEX "StocktakeItem_ingredientId_idx" ON "StocktakeItem"("ingredientId");

ALTER TABLE "StocktakeItem"
  ADD CONSTRAINT "StocktakeItem_stocktakeId_fkey"
  FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StocktakeItem"
  ADD CONSTRAINT "StocktakeItem_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- CHECKLISTS ----------
CREATE TABLE "ChecklistTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "area" TEXT,
  "venue" "Venue" NOT NULL DEFAULT 'BOTH',
  "cadence" "ChecklistCadence" NOT NULL DEFAULT 'DAILY',
  "shift" "ChecklistShift" NOT NULL DEFAULT 'ANY',
  "isFoodSafety" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChecklistTemplate_venue_cadence_idx"
  ON "ChecklistTemplate"("venue", "cadence");

CREATE TABLE "ChecklistTemplateItem" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "label" TEXT NOT NULL,
  "instructions" TEXT,
  "requireTemp" BOOLEAN NOT NULL DEFAULT false,
  "requireNote" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ChecklistTemplateItem"
  ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChecklistRun" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "venue" "Venue" NOT NULL,
  "runDate" DATE NOT NULL,
  "shift" "ChecklistShift" NOT NULL DEFAULT 'ANY',
  "status" "ChecklistRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "completedBy" TEXT,
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChecklistRun_templateId_venue_runDate_shift_key"
  ON "ChecklistRun"("templateId", "venue", "runDate", "shift");
CREATE INDEX "ChecklistRun_runDate_venue_idx" ON "ChecklistRun"("runDate", "venue");
ALTER TABLE "ChecklistRun"
  ADD CONSTRAINT "ChecklistRun_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChecklistRunItem" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "templateItemId" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3),
  "checkedBy" TEXT,
  "tempCelsius" DECIMAL(5,2),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistRunItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChecklistRunItem_runId_templateItemId_key"
  ON "ChecklistRunItem"("runId", "templateItemId");
ALTER TABLE "ChecklistRunItem"
  ADD CONSTRAINT "ChecklistRunItem_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ChecklistRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistRunItem"
  ADD CONSTRAINT "ChecklistRunItem_templateItemId_fkey"
  FOREIGN KEY ("templateItemId") REFERENCES "ChecklistTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
