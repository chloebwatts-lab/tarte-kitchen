-- Per-category food-cost targets behind the menu price recommendation.
CREATE TABLE "MenuCategoryTarget" (
  "category" "MenuCategory" NOT NULL,
  "targetFoodCostPct" DECIMAL(5,2) NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuCategoryTarget_pkey" PRIMARY KEY ("category")
);
