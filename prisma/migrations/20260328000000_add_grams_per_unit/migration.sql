-- AddColumn: gramsPerUnit on Ingredient
-- For COUNT ingredients (ea, bunch, etc.) used in WEIGHT (g/kg) recipes.
-- Stores the gram weight of one purchase unit so the cost formula can
-- correctly calculate (recipeGrams ÷ gramsPerUnit) × pricePerUnit.
ALTER TABLE "Ingredient" ADD COLUMN "gramsPerUnit" DECIMAL;
