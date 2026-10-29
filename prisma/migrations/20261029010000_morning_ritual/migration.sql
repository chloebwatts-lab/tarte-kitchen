-- Morning Ritual: the kitchen portion guide (29 Oct 2026) costed into Tarte
-- Kitchen as four dishes, one per protein choice. Chloe's pricing: $24.90
-- with greens, smoked salmon or prosciutto; $27.90 with hot maple smoked
-- salmon. Rides the migrations on deploy like Whipped Yoghurt & Poached Pear.
--
-- Per plate: buttered everything bagel, 1 serve Potato Hash with 10 g
-- parmesan, 50 g Pickled Red Onion, 55 g Avocado Prepped, 55 g goat's cream,
-- 30 g Crispy Chilli, 1 boiled egg, plus ONE of: 70 g sauteed greens,
-- 60 g smoked salmon, 50 g prosciutto (3 slices), 60 g hot maple smoked
-- salmon.
--
-- Two lines are placeholders until the kitchen supplies the recipe or the
-- first invoice lands, flagged in notes: goat's cream is costed as 55 g of
-- goat curd, and hot maple smoked salmon is created at an ASSUMED $60/kg if
-- the book has none. Sauteed Greens is created as a simple kale prep
-- (ASSUMED build) when the book has no greens prep.
--
-- Line costs use the same arithmetic as recalculatePreparationCost /
-- recalculateDishCost in src/lib/actions/ingredients.ts. Safe to re-apply:
-- preparations are found by name, dishes by (name, venue).

CREATE FUNCTION pg_temp.mr_line_cost(p_ing text, p_qty numeric, p_unit text)
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

-- Find an ingredient by known id, then by name pattern; create it from the
-- spec when the book has nothing. p_by_weight = true skips COUNT ingredients
-- with no gramsPerUnit, which cannot be used by the gram.
CREATE FUNCTION pg_temp.mr_ingredient(
  p_ids text[], p_patterns text[], p_by_weight boolean,
  p_name text, p_category "IngredientCategory", p_type "BaseUnitType",
  p_supplier text, p_qty numeric, p_unit text, p_price numeric, p_base numeric,
  p_allergens "Allergen"[], p_notes text
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
       AND (NOT p_by_weight OR "baseUnitType" <> 'COUNT' OR coalesce("gramsPerUnit", 0) > 0)
     ORDER BY ("purchasePrice" / "baseUnitsPerPurchase") ASC, name
     LIMIT 1;
    IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  END LOOP;
  IF p_name IS NULL THEN RETURN NULL; END IF;
  new_id := gen_random_uuid()::text;
  INSERT INTO "Ingredient"
    ("id", "name", "category", "baseUnitType", "supplierId", "purchaseQuantity", "purchaseUnit",
     "purchasePrice", "baseUnitsPerPurchase", "wastePercentage", "allergens", "notes", "updatedAt")
  VALUES
    (new_id, p_name, p_category, p_type, p_supplier, p_qty, p_unit,
     p_price, p_base, 0, p_allergens, p_notes, now());
  RETURN new_id;
END $f$;

CREATE FUNCTION pg_temp.mr_find_prep(p_id text, p_patterns text[]) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  found_id text;
  pat text;
BEGIN
  SELECT id INTO found_id FROM "Preparation" WHERE id = p_id;
  IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  FOREACH pat IN ARRAY p_patterns LOOP
    SELECT id INTO found_id FROM "Preparation" WHERE name ILIKE pat AND "batchCost" > 0 ORDER BY name LIMIT 1;
    IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  END LOOP;
  RETURN NULL;
END $f$;

CREATE FUNCTION pg_temp.mr_prep_item(p_prep text, p_sort int, p_ing text, p_qty numeric, p_unit text)
RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE
  c numeric;
BEGIN
  IF p_ing IS NULL THEN RETURN 0; END IF;
  c := pg_temp.mr_line_cost(p_ing, p_qty, p_unit);
  INSERT INTO "PreparationItem" ("id", "preparationId", "sortOrder", "ingredientId", "quantity", "unit", "lineCost", "updatedAt")
  VALUES (gen_random_uuid()::text, p_prep, p_sort, p_ing, p_qty, p_unit, c, now());
  RETURN c;
END $f$;

CREATE FUNCTION pg_temp.mr_finish_prep(p_prep text) RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE
  batch numeric;
  p record;
BEGIN
  SELECT coalesce(sum("lineCost"), 0) INTO batch FROM "PreparationItem" WHERE "preparationId" = p_prep;
  SELECT "yieldQuantity", "yieldWeightGrams" INTO p FROM "Preparation" WHERE id = p_prep;
  UPDATE "Preparation" SET
    "batchCost"    = round(batch, 2),
    "costPerGram"  = CASE WHEN p."yieldWeightGrams" > 0 THEN round(batch / p."yieldWeightGrams", 4) ELSE 0 END,
    "costPerServe" = CASE WHEN p."yieldQuantity" > 0 THEN round(batch / p."yieldQuantity", 2) ELSE 0 END,
    "updatedAt"    = now()
  WHERE id = p_prep;
  RETURN batch;
END $f$;

CREATE FUNCTION pg_temp.mr_dish_ing(p_dish text, p_sort int, p_ing text, p_qty numeric, p_unit text)
RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE
  c numeric;
BEGIN
  IF p_ing IS NULL THEN RETURN 0; END IF;
  c := pg_temp.mr_line_cost(p_ing, p_qty, p_unit);
  INSERT INTO "DishComponent" ("id", "dishId", "sortOrder", "ingredientId", "quantity", "unit", "lineCost", "updatedAt")
  VALUES (gen_random_uuid()::text, p_dish, p_sort, p_ing, p_qty, p_unit, c, now());
  RETURN c;
END $f$;

-- Dish component against a preparation, costed like calcPrepLineCost.
CREATE FUNCTION pg_temp.mr_dish_prep(p_dish text, p_sort int, p_prep text, p_qty numeric, p_unit text)
RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE
  p record;
  c numeric := 0;
  u text := lower(p_unit);
  yu text;
BEGIN
  IF p_prep IS NULL THEN RETURN 0; END IF;
  SELECT "batchCost", "yieldQuantity", "yieldUnit", "yieldWeightGrams" INTO p FROM "Preparation" WHERE id = p_prep;
  yu := lower(p."yieldUnit");
  IF u IN ('ea', 'dozen', 'serve', 'serves') AND yu IN ('serve', 'serves', 'ea') THEN
    IF p."yieldQuantity" > 0 THEN
      c := (p_qty * CASE u WHEN 'dozen' THEN 12 ELSE 1 END) / p."yieldQuantity" * p."batchCost";
    END IF;
  ELSIF p."yieldWeightGrams" > 0 THEN
    c := (p_qty * CASE u WHEN 'kg' THEN 1000 WHEN 'l' THEN 1000 ELSE 1 END) / p."yieldWeightGrams" * p."batchCost";
  END IF;
  c := round(c, 4);
  INSERT INTO "DishComponent" ("id", "dishId", "sortOrder", "preparationId", "quantity", "unit", "lineCost", "updatedAt")
  VALUES (gen_random_uuid()::text, p_dish, p_sort, p_prep, p_qty, p_unit, c, now());
  RETURN c;
END $f$;

CREATE FUNCTION pg_temp.mr_finish_dish(p_dish text) RETURNS numeric LANGUAGE plpgsql AS $f$
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
  sup_bidfood text := (SELECT id FROM "Supplier" WHERE name ILIKE 'bidfood%' ORDER BY name LIMIT 1);
  i_bagel text; i_butter text; i_parmesan text; i_egg text; i_goat text;
  i_salmon text; i_prosciutto text; i_hot_salmon text;
  i_kale text; i_oil text; i_garlic text; i_salt text;
  p_hash text; p_onion text; p_avo text; p_chilli text; p_greens text;
  greens_created boolean := false;
  base_notes text;
  v record;
  dish_id text;
  ex_gst numeric;
  sort int;
  total numeric;
BEGIN
  -- ── Ingredients ─────────────────────────────────────────────────────
  i_bagel := pg_temp.mr_ingredient(
    ARRAY['cmn8cccgz001f16qzu0k0bce2'], ARRAY['bagel (everything)%', 'bagel%'], false,
    'Bagel (everything)', 'BAKERY', 'COUNT', NULL, 1, 'piece', 0.12, 1,
    ARRAY['GLUTEN', 'SESAME']::"Allergen"[], 'House bagel at the June 2026 book cost. Created for Morning Ritual (29 Oct 2026).');
  i_butter := pg_temp.mr_ingredient(
    ARRAY['cmn8ccer200e616qzwbqhl3tt', 'cmn8ccer600e716qz7yv3o9fe'], ARRAY['salted butter%', 'butter%salted%'], true,
    'Salted butter', 'DAIRY', 'WEIGHT', sup_bidfood, 500, 'g', 6.69, 500,
    ARRAY['MILK']::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_parmesan := pg_temp.mr_ingredient(
    ARRAY['cmn8cceec00bj16qzai0g0899', 'cmn8cceek00bl16qztl7zybk3'], ARRAY['parmesan cheese%', 'parmesan%'], true,
    'Parmesan cheese', 'CHEESE', 'WEIGHT', sup_bidfood, 1, 'kg', 29.56, 1000,
    ARRAY['MILK']::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_egg := pg_temp.mr_ingredient(
    ARRAY['cmn8ccdwm007916qzosd7ljjv'], ARRAY['gc eggs%', 'eggs %', 'egg - %'], false,
    'GC Eggs - Individual', 'EGG', 'COUNT', NULL, 1, 'piece', 0.48, 1,
    ARRAY['EGG']::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next GC Eggs invoice.');
  i_goat := pg_temp.mr_ingredient(
    ARRAY['cmn8ccdxs007k16qzzj28skv3'], ARRAY['goat%curd%', 'goat%cream%', 'goat - marinated%', 'goat%'], true,
    'Goats curd', 'CHEESE', 'WEIGHT', NULL, 1, 'kg', 22.50, 1000,
    ARRAY['MILK']::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_salmon := pg_temp.mr_ingredient(
    ARRAY['cmn8ccexd00f216qzlr01hvnx', 'cmn8ccex200f116qzlrivqktf'], ARRAY['smoked salmon - sliced%', 'smoked salmon%'], true,
    'Smoked Salmon - Sliced Atlantic', 'SEAFOOD', 'WEIGHT', sup_bidfood, 1000, 'g', 34.12, 1000,
    ARRAY['FISH']::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next Bidfood invoice.');
  i_prosciutto := pg_temp.mr_ingredient(
    ARRAY['cmn8ccele00cx16qzgixdrrve'], ARRAY['prosciutto', 'prosciutto%'], true,
    'Prosciutto', 'MEAT', 'WEIGHT', NULL, 1000, 'g', 49.00, 1000,
    ARRAY[]::"Allergen"[], 'Son Of A Bunn Prosciutto Sliced, $49/kg (inv 2026-06-03). Confirm on the next invoice.');
  i_hot_salmon := pg_temp.mr_ingredient(
    ARRAY[]::text[], ARRAY['hot%smoked%salmon%', 'salmon%hot smoked%', 'maple%smoked%salmon%', 'salmon%maple%'], true,
    'Hot Maple Smoked Salmon', 'SEAFOOD', 'WEIGHT', sup_bidfood, 1, 'kg', 60.00, 1000,
    ARRAY['FISH']::"Allergen"[], 'ASSUMED $60.00/kg (not yet bought when Morning Ritual was costed, 29 Oct 2026). Correct from the first invoice.');
  i_kale := pg_temp.mr_ingredient(
    ARRAY['cmn8ccdyp007s16qzi464zhkn'], ARRAY['green kale%', 'kale%', 'cavolo nero%', 'silverbeet%'], true,
    'Green Kale', 'VEGETABLE', 'WEIGHT', NULL, 1, 'kg', 5.65, 1000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next produce invoice.');
  i_oil := pg_temp.mr_ingredient(
    ARRAY['cmn8cceb500ay16qzjl2lz5ko', 'cmn8cceb200ax16qzyoeb56yv'], ARRAY['olive oil 2nd%', 'olive oil%'], true,
    'Olive oil 2nd grade', 'OIL', 'VOLUME', sup_bidfood, 4, 'l', 45.50, 4000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_garlic := pg_temp.mr_ingredient(
    ARRAY['cmn8ccdw7007616qzawph4ea6'], ARRAY['garlic (peeled)%', 'garlic peeled%', 'garlic%'], true,
    'Garlic (peeled)', 'VEGETABLE', 'WEIGHT', NULL, 1, 'kg', 5.99, 1000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next produce invoice.');
  i_salt := pg_temp.mr_ingredient(
    ARRAY['cmn8ccf3400g616qzc5i2k5g2'], ARRAY['table salt%', 'salt%'], true,
    NULL, 'OTHER', 'WEIGHT', NULL, 0, '', 0, 0, ARRAY[]::"Allergen"[], NULL);

  -- ── Existing preparations ───────────────────────────────────────────
  p_hash   := pg_temp.mr_find_prep('cmn8ccflr00lr16qzsh8vckiz', ARRAY['potato hash%', '%hash%']);
  p_onion  := pg_temp.mr_find_prep('cmn8ccflc00lk16qzt2kyevl3', ARRAY['pickled red onion%', 'pickled%onion%']);
  p_avo    := pg_temp.mr_find_prep('cmn8ccfcr00ih16qzhfxo2es6', ARRAY['avocado prepped%', 'avocado%']);
  p_chilli := pg_temp.mr_find_prep('cmn8ccffs00jl16qzp7ordld9', ARRAY['crispy chilli%', 'crispy chili%']);

  -- ── Sauteed Greens (created only if the book has no greens prep) ────
  p_greens := pg_temp.mr_find_prep('', ARRAY['saut%ed greens%', 'sauteed greens%', 'sautéed greens%', 'wilted greens%', 'greens%']);
  IF p_greens IS NULL THEN
    p_greens := gen_random_uuid()::text;
    greens_created := true;
    INSERT INTO "Preparation"
      ("id", "name", "category", "method", "yieldQuantity", "yieldUnit", "yieldWeightGrams", "updatedAt")
    VALUES (p_greens, 'Sauteed Greens', 'COMPONENT',
      E'ASSUMED build for costing (29 Oct 2026): 1 kg kale, stripped and chopped, wilted in olive oil with garlic and salt. 1 kg raw gives about 700 g cooked. Portion 70 g per serve.\n'
      'Replace with the kitchen''s own recipe and re-save so the cost follows.',
      700, 'g', 700, now());
    PERFORM pg_temp.mr_prep_item(p_greens, 0, i_kale, 1000, 'g');
    PERFORM pg_temp.mr_prep_item(p_greens, 1, i_oil, 40, 'ml');
    PERFORM pg_temp.mr_prep_item(p_greens, 2, i_garlic, 20, 'g');
    PERFORM pg_temp.mr_prep_item(p_greens, 3, i_salt, 5, 'g');
    PERFORM pg_temp.mr_finish_prep(p_greens);
  END IF;

  -- ── Dishes: one per protein choice ──────────────────────────────────
  base_notes :=
    'Added 29 Oct 2026 from the kitchen portion guide. Per plate: buttered everything bagel, 1 serve Potato Hash with 10 g parmesan, '
    || '50 g Pickled Red Onion, 55 g avocado, 55 g goat''s cream, 30 g Crispy Chilli, 1 boiled egg, plus ONE of greens / smoked salmon / prosciutto at $24.90, '
    || 'or hot maple smoked salmon at $27.90. Goat''s cream is costed as 55 g goat curd until the kitchen supplies the recipe. ';

  FOR v IN SELECT * FROM (VALUES
      ('Morning Ritual - Greens',            24.90, 'greens'),
      ('Morning Ritual - Smoked Salmon',     24.90, 'salmon'),
      ('Morning Ritual - Prosciutto',        24.90, 'prosciutto'),
      ('Morning Ritual - Hot Smoked Salmon', 27.90, 'hot_salmon')
    ) AS t(name, price, choice)
  LOOP
    SELECT id INTO dish_id FROM "Dish" WHERE name = v.name AND venue = 'BOTH';
    IF dish_id IS NOT NULL THEN
      RAISE NOTICE '% already in the book (%), left as is', v.name, dish_id;
      CONTINUE;
    END IF;

    ex_gst := round(v.price / 1.1, 4);
    dish_id := gen_random_uuid()::text;
    INSERT INTO "Dish"
      ("id", "name", "menuCategory", "venue", "sellingPrice", "sellingPriceExGst", "notes", "updatedAt")
    VALUES
      (dish_id, v.name, 'BREAKFAST', 'BOTH', v.price, ex_gst,
       base_notes || CASE v.choice
         WHEN 'greens'     THEN 'This variant: 70 g sauteed greens' || CASE WHEN greens_created THEN ' (Sauteed Greens prep is an ASSUMED kale build, replace with the kitchen''s recipe).' ELSE '.' END
         WHEN 'salmon'     THEN 'This variant: 60 g sliced smoked salmon.'
         WHEN 'prosciutto' THEN 'This variant: 3 slices prosciutto (50 g).'
         ELSE 'This variant: 60 g hot maple smoked salmon, +$3. Salmon price is ASSUMED until the first invoice, see the ingredient note.'
       END,
       now());

    sort := 0;
    PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_bagel,    1,  'ea');    sort := sort + 1;
    PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_butter,   15, 'g');     sort := sort + 1;
    PERFORM pg_temp.mr_dish_prep(dish_id, sort, p_hash,     1,  'serve'); sort := sort + 1;
    PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_parmesan, 10, 'g');     sort := sort + 1;
    PERFORM pg_temp.mr_dish_prep(dish_id, sort, p_onion,    50, 'g');     sort := sort + 1;
    PERFORM pg_temp.mr_dish_prep(dish_id, sort, p_avo,      55, 'g');     sort := sort + 1;
    PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_goat,     55, 'g');     sort := sort + 1;
    PERFORM pg_temp.mr_dish_prep(dish_id, sort, p_chilli,   30, 'g');     sort := sort + 1;
    PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_egg,      1,  'ea');    sort := sort + 1;
    CASE v.choice
      WHEN 'greens'     THEN PERFORM pg_temp.mr_dish_prep(dish_id, sort, p_greens,     70, 'g');
      WHEN 'salmon'     THEN PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_salmon,     60, 'g');
      WHEN 'prosciutto' THEN PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_prosciutto, 50, 'g');
      ELSE                   PERFORM pg_temp.mr_dish_ing (dish_id, sort, i_hot_salmon, 60, 'g');
    END CASE;

    total := pg_temp.mr_finish_dish(dish_id);
    RAISE NOTICE '% added: cost %, price %', v.name, round(total, 2), v.price;
  END LOOP;
END $$;

DROP FUNCTION pg_temp.mr_finish_dish(text);
DROP FUNCTION pg_temp.mr_dish_prep(text, int, text, numeric, text);
DROP FUNCTION pg_temp.mr_dish_ing(text, int, text, numeric, text);
DROP FUNCTION pg_temp.mr_finish_prep(text);
DROP FUNCTION pg_temp.mr_prep_item(text, int, text, numeric, text);
DROP FUNCTION pg_temp.mr_find_prep(text, text[]);
DROP FUNCTION pg_temp.mr_ingredient(text[], text[], boolean, text, "IngredientCategory", "BaseUnitType", text, numeric, text, numeric, numeric, "Allergen"[], text);
DROP FUNCTION pg_temp.mr_line_cost(text, numeric, text);
