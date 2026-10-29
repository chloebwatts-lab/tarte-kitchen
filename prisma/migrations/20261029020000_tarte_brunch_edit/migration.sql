-- Morning Ritual becomes Tarte Brunch Edit (Chloe, 29 Oct 2026), and the
-- greens option is two broccolini stems and one asparagus spear, like the
-- Greens side, instead of the assumed kale prep. Prices unchanged: $24.90
-- for greens / smoked salmon / prosciutto, $27.90 for hot smoked salmon.
--
-- Broccolini is costed as a quarter bunch (2 stems from a bunch of about 8)
-- and asparagus as a tenth of a bunch (1 spear). The assumed Sauteed Greens
-- prep goes if nothing else uses it. Safe to re-apply.

CREATE FUNCTION pg_temp.tbe_line_cost(p_ing text, p_qty numeric, p_unit text)
RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE
  i record;
  usable numeric;
  cpbu numeric;
  mult numeric;
  u text := lower(p_unit);
BEGIN
  SELECT "purchasePrice", "baseUnitsPerPurchase", "wastePercentage", "baseUnitType", "gramsPerUnit"
    INTO i FROM "Ingredient" WHERE id = p_ing;
  IF NOT FOUND THEN RETURN 0; END IF;
  usable := i."baseUnitsPerPurchase" * (1 - i."wastePercentage" / 100);
  IF usable <= 0 THEN RETURN 0; END IF;
  cpbu := i."purchasePrice" / usable;
  mult := CASE u WHEN 'kg' THEN 1000 WHEN 'l' THEN 1000 WHEN 'dozen' THEN 12 ELSE 1 END;
  IF i."baseUnitType" = 'COUNT' AND u IN ('g', 'kg', 'ml', 'l') AND coalesce(i."gramsPerUnit", 0) > 0 THEN
    RETURN round(p_qty * mult / i."gramsPerUnit" * cpbu, 4);
  END IF;
  RETURN round(p_qty * mult * cpbu, 4);
END $f$;

CREATE FUNCTION pg_temp.tbe_ingredient(
  p_ids text[], p_patterns text[],
  p_name text, p_category "IngredientCategory", p_type "BaseUnitType",
  p_qty numeric, p_unit text, p_price numeric, p_base numeric, p_grams numeric, p_notes text
) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  found_id text;
  pat text;
  new_id text;
BEGIN
  SELECT id INTO found_id FROM "Ingredient" WHERE id = ANY (p_ids)
   ORDER BY array_position(p_ids, id) LIMIT 1;
  IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  FOREACH pat IN ARRAY p_patterns LOOP
    SELECT id INTO found_id FROM "Ingredient"
     WHERE name ILIKE pat AND "purchasePrice" > 0 AND "baseUnitsPerPurchase" > 0
     ORDER BY ("purchasePrice" / "baseUnitsPerPurchase") ASC, name
     LIMIT 1;
    IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  END LOOP;
  new_id := gen_random_uuid()::text;
  INSERT INTO "Ingredient"
    ("id", "name", "category", "baseUnitType", "purchaseQuantity", "purchaseUnit",
     "purchasePrice", "baseUnitsPerPurchase", "gramsPerUnit", "wastePercentage", "notes", "updatedAt")
  VALUES
    (new_id, p_name, p_category, p_type, p_qty, p_unit, p_price, p_base, p_grams, 0, p_notes, now());
  RETURN new_id;
END $f$;

CREATE FUNCTION pg_temp.tbe_finish_dish(p_dish text) RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE
  total numeric;
  ex_gst numeric;
BEGIN
  SELECT coalesce(sum("lineCost"), 0) INTO total FROM "DishComponent" WHERE "dishId" = p_dish;
  SELECT "sellingPriceExGst" INTO ex_gst FROM "Dish" WHERE id = p_dish;
  UPDATE "Dish" SET
    "totalCost"          = round(total, 2),
    "foodCostPercentage" = CASE WHEN ex_gst > 0 THEN round(total / ex_gst * 100, 1) ELSE 0 END,
    "grossProfit"        = round(ex_gst - total, 2),
    "updatedAt"          = now()
  WHERE id = p_dish;
  RETURN total;
END $f$;

DO $$
DECLARE
  i_broccolini text;
  i_asparagus text;
  greens_dish text;
  greens_prep text;
  next_sort int;
  renamed int;
  total numeric;
BEGIN
  -- ── Rename Morning Ritual to Tarte Brunch Edit ──────────────────────
  UPDATE "Dish" d SET
    name = replace(d.name, 'Morning Ritual', 'Tarte Brunch Edit'),
    notes = replace(coalesce(d.notes, ''), 'Morning Ritual', 'Tarte Brunch Edit'),
    "updatedAt" = now()
  WHERE d.name LIKE 'Morning Ritual - %' AND d.venue = 'BOTH'
    AND NOT EXISTS (SELECT 1 FROM "Dish" x WHERE x.name = replace(d.name, 'Morning Ritual', 'Tarte Brunch Edit') AND x.venue = d.venue);
  GET DIAGNOSTICS renamed = ROW_COUNT;
  RAISE NOTICE '% dish(es) renamed to Tarte Brunch Edit', renamed;

  -- ── Greens variant: broccolini and asparagus instead of the kale prep ─
  SELECT id INTO greens_dish FROM "Dish" WHERE name = 'Tarte Brunch Edit - Greens' AND venue = 'BOTH';
  IF greens_dish IS NULL THEN
    RAISE NOTICE 'Tarte Brunch Edit - Greens not in the book, nothing to change';
    RETURN;
  END IF;

  i_broccolini := pg_temp.tbe_ingredient(
    ARRAY['cmn8cccvw002q16qzytshbb9v'], ARRAY['broccolini%'],
    'Broccolini', 'VEGETABLE', 'COUNT', 1, 'bunch', 4.40, 1, 200,
    'Price carried from the June 2026 book (bunch, about 200 g). Confirm on the next produce invoice.');
  i_asparagus := pg_temp.tbe_ingredient(
    ARRAY['cmn8ccdy7007p16qzs8tn5151'], ARRAY['green asparagus%', 'asparagus%'],
    'Green asparagus', 'VEGETABLE', 'COUNT', 1, 'bunch', 3.99, 1, 250,
    'Price carried from the June 2026 book (bunch, about 10 spears). Confirm on the next produce invoice.');

  -- Drop the kale prep line (any greens prep on this dish) if it is there.
  SELECT dc."preparationId" INTO greens_prep
    FROM "DishComponent" dc JOIN "Preparation" p ON p.id = dc."preparationId"
   WHERE dc."dishId" = greens_dish AND p.name ILIKE '%greens%' LIMIT 1;
  DELETE FROM "DishComponent" dc USING "Preparation" p
   WHERE dc."dishId" = greens_dish AND p.id = dc."preparationId" AND p.name ILIKE '%greens%';

  IF NOT EXISTS (SELECT 1 FROM "DishComponent" WHERE "dishId" = greens_dish AND "ingredientId" = i_broccolini) THEN
    SELECT coalesce(max("sortOrder"), -1) + 1 INTO next_sort FROM "DishComponent" WHERE "dishId" = greens_dish;
    INSERT INTO "DishComponent" ("id", "dishId", "sortOrder", "ingredientId", "quantity", "unit", "lineCost", "updatedAt")
    VALUES (gen_random_uuid()::text, greens_dish, next_sort, i_broccolini, 0.25, 'ea', pg_temp.tbe_line_cost(i_broccolini, 0.25, 'ea'), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "DishComponent" WHERE "dishId" = greens_dish AND "ingredientId" = i_asparagus) THEN
    SELECT coalesce(max("sortOrder"), -1) + 1 INTO next_sort FROM "DishComponent" WHERE "dishId" = greens_dish;
    INSERT INTO "DishComponent" ("id", "dishId", "sortOrder", "ingredientId", "quantity", "unit", "lineCost", "updatedAt")
    VALUES (gen_random_uuid()::text, greens_dish, next_sort, i_asparagus, 0.1, 'ea', pg_temp.tbe_line_cost(i_asparagus, 0.1, 'ea'), now());
  END IF;

  UPDATE "Dish" SET notes = regexp_replace(coalesce(notes, ''), 'This variant: 70 g sauteed greens[^.]*\.', '') ||
    ' This variant: 2 broccolini stems and 1 asparagus spear, like the Greens side (costed as a quarter bunch of broccolini and a tenth of a bunch of asparagus).'
  WHERE id = greens_dish AND coalesce(notes, '') NOT LIKE '%2 broccolini stems%';

  total := pg_temp.tbe_finish_dish(greens_dish);
  RAISE NOTICE 'Tarte Brunch Edit - Greens recosted: %', round(total, 2);

  -- ── Retire the assumed Sauteed Greens prep if nothing uses it ───────
  IF greens_prep IS NOT NULL
     AND EXISTS (SELECT 1 FROM "Preparation" WHERE id = greens_prep AND method LIKE 'ASSUMED build%')
     AND NOT EXISTS (SELECT 1 FROM "DishComponent" WHERE "preparationId" = greens_prep)
     AND NOT EXISTS (SELECT 1 FROM "PreparationItem" WHERE "subPreparationId" = greens_prep)
     AND NOT EXISTS (SELECT 1 FROM "PrepStockItem" WHERE "preparationId" = greens_prep) THEN
    DELETE FROM "PreparationItem" WHERE "preparationId" = greens_prep;
    DELETE FROM "Preparation" WHERE id = greens_prep;
    RAISE NOTICE 'assumed Sauteed Greens prep removed';
  END IF;
END $$;

DROP FUNCTION pg_temp.tbe_finish_dish(text);
DROP FUNCTION pg_temp.tbe_ingredient(text[], text[], text, "IngredientCategory", "BaseUnitType", numeric, text, numeric, numeric, numeric, text);
DROP FUNCTION pg_temp.tbe_line_cost(text, numeric, text);
