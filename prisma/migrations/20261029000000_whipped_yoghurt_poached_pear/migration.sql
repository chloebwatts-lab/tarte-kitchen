-- Whipped Yoghurt & Poached Pear: the kitchen prep and portion guide
-- (29 Oct 2026) costed into Tarte Kitchen as three preparations and one
-- dish, so the plate shows on /dishes with a live food cost. It rides the
-- migrations on deploy because the session that costed it had no database
-- access to run a script by hand.
--
-- Ingredients are matched to what the book already has (first by the id
-- the June snapshot carried, then by name). Mascarpone and star anise get
-- created with an ASSUMED price only when the book has neither, flagged in
-- their notes for the next invoice to correct. Line costs use the same
-- arithmetic as recalculatePreparationCost / recalculateDishCost in
-- src/lib/actions/ingredients.ts, so the next price change recalculates
-- them the usual way.
--
-- Safe to re-apply: preparations are found by name, the dish by its
-- (name, venue); nothing is duplicated.

CREATE FUNCTION pg_temp.wyp_line_cost(p_ing text, p_qty numeric, p_unit text)
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

-- Find an ingredient by known id, then by name pattern (cheapest sane match
-- wins); create it from the spec when the book has nothing.
CREATE FUNCTION pg_temp.wyp_ingredient(
  p_ids text[], p_patterns text[],
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

CREATE FUNCTION pg_temp.wyp_prep_item(p_prep text, p_sort int, p_ing text, p_qty numeric, p_unit text)
RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE
  c numeric;
BEGIN
  IF p_ing IS NULL THEN RETURN 0; END IF;
  c := pg_temp.wyp_line_cost(p_ing, p_qty, p_unit);
  INSERT INTO "PreparationItem" ("id", "preparationId", "sortOrder", "ingredientId", "quantity", "unit", "lineCost", "updatedAt")
  VALUES (gen_random_uuid()::text, p_prep, p_sort, p_ing, p_qty, p_unit, c, now());
  RETURN c;
END $f$;

CREATE FUNCTION pg_temp.wyp_prep(
  p_name text, p_category "PreparationCategory", p_method text,
  p_yield_qty numeric, p_yield_unit text, p_yield_grams numeric, OUT prep_id text, OUT created boolean
) LANGUAGE plpgsql AS $f$
BEGIN
  SELECT id INTO prep_id FROM "Preparation" WHERE name = p_name;
  created := prep_id IS NULL;
  IF created THEN
    prep_id := gen_random_uuid()::text;
    INSERT INTO "Preparation"
      ("id", "name", "category", "method", "yieldQuantity", "yieldUnit", "yieldWeightGrams", "updatedAt")
    VALUES (prep_id, p_name, p_category, p_method, p_yield_qty, p_yield_unit, p_yield_grams, now());
  END IF;
END $f$;

CREATE FUNCTION pg_temp.wyp_finish_prep(p_prep text) RETURNS numeric LANGUAGE plpgsql AS $f$
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

-- Dish component against a preparation, costed like calcPrepLineCost:
-- count units against a count yield share the batch by count, anything
-- else goes by weight.
CREATE FUNCTION pg_temp.wyp_dish_prep(p_dish text, p_sort int, p_prep text, p_qty numeric, p_unit text)
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

DO $$
DECLARE
  sup_bidfood text := (SELECT id FROM "Supplier" WHERE name ILIKE 'bidfood%' ORDER BY name LIMIT 1);
  i_yoghurt text; i_masc text; i_vanilla_ext text; i_icing text; i_lime text;
  i_pear text; i_caster text; i_star text; i_vanilla_paste text; i_orange text; i_lemon text;
  i_straw text; i_lime_juice text;
  p_granola text;
  wy record; pp record; ms record;
  dish_id text;
  total numeric := 0;
  price numeric := 21.90;
  ex_gst numeric;
BEGIN
  -- ── Ingredients ─────────────────────────────────────────────────────
  i_yoghurt := pg_temp.wyp_ingredient(
    ARRAY['cmn8ccdg5004h16qzf12k0poq'], ARRAY['chobani%', '%chobani%', 'yoghurt greek style plain%', 'natural yoghurt%', 'yoghurt%'],
    'Natural yoghurt (Chobani)', 'DAIRY', 'WEIGHT', sup_bidfood, 2000, 'g', 11.50, 2000,
    ARRAY['MILK']::"Allergen"[], 'Chobani 2kg tub. Price carried from the June 2026 book, confirm on the next Bidfood invoice.');
  i_masc := pg_temp.wyp_ingredient(
    ARRAY[]::text[], ARRAY['mascarpone%', '%mascarpone%'],
    'Cheese Mascarpone Tatua 1kg', 'DAIRY', 'WEIGHT', sup_bidfood, 1, 'kg', 16.06, 1000,
    ARRAY['MILK']::"Allergen"[], 'Bidfood CHEESE MASCARPONE TATUA 1KG, last invoiced 11 Jun 2026 at $16.06/kg (created for Whipped Yoghurt & Poached Pear, 29 Oct 2026). Confirm on the next Bidfood invoice.');
  i_vanilla_ext := pg_temp.wyp_ingredient(
    ARRAY[]::text[], ARRAY['vanilla extract%', 'vanilla essence%', '%vanilla extract%'],
    NULL, 'OTHER', 'VOLUME', NULL, 0, '', 0, 0, ARRAY[]::"Allergen"[], NULL);
  IF i_vanilla_ext IS NULL THEN
    -- No extract in the book: vanilla bean paste is the closest priced line.
    i_vanilla_ext := pg_temp.wyp_ingredient(
      ARRAY['cmn8ccf7000h116qzzkon5bb1', 'cmn8ccf7500h316qzcibsobqu'], ARRAY['vanilla bean paste%', 'vanilla paste%', 'vanilla%'],
      'Vanilla extract', 'OTHER', 'VOLUME', sup_bidfood, 1, 'l', 45.00, 1000,
      ARRAY[]::"Allergen"[], 'ASSUMED $45.00/L, created for Whipped Yoghurt (29 Oct 2026). Correct from the next invoice.');
  END IF;
  i_icing := pg_temp.wyp_ingredient(
    ARRAY['cmn8cce20008l16qz5no08ewr', 'cmn8cce23008m16qzzgdw5zsa'], ARRAY['icing sugar%', '%icing sugar%'],
    'Icing sugar', 'DRY_GOOD', 'WEIGHT', sup_bidfood, 15, 'kg', 39.65, 15000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_lime := pg_temp.wyp_ingredient(
    ARRAY['cmn8cce60009h16qzmb90kuwm', 'cmn8cce66009i16qz06jzmxrp'], ARRAY['lime', 'lime - tahitian%', 'lime %'],
    'Lime', 'FRUIT', 'WEIGHT', NULL, 1, 'kg', 5.52, 1000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next produce invoice.');
  i_pear := pg_temp.wyp_ingredient(
    ARRAY['cmn8cceg500bw16qz2m8w92g6'], ARRAY['pear', 'pear %', 'pears%', '%pear%'],
    'Pear', 'FRUIT', 'WEIGHT', NULL, 1, 'kg', 4.06, 1000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next produce invoice.');
  i_caster := pg_temp.wyp_ingredient(
    ARRAY['cmn8ccd5g003i16qzk6nj0wf8'], ARRAY['caster sugar%', '%caster sugar%', 'sugar caster%'],
    'Caster Sugar', 'DRY_GOOD', 'WEIGHT', sup_bidfood, 25, 'kg', 44.10, 25000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_star := pg_temp.wyp_ingredient(
    ARRAY[]::text[], ARRAY['star anise%', '%star anise%'],
    'Star anise', 'SPICE', 'WEIGHT', sup_bidfood, 1, 'kg', 45.00, 1000,
    ARRAY[]::"Allergen"[], 'ASSUMED $45.00/kg whole (no star anise in the book when Poached Pears was costed, 29 Oct 2026). Correct from the next invoice.');
  i_vanilla_paste := pg_temp.wyp_ingredient(
    ARRAY['cmn8ccf7500h316qzcibsobqu', 'cmn8ccf7000h116qzzkon5bb1', 'cmn8ccctg002g16qz3mns6yns'], ARRAY['vanilla paste%', 'vanilla bean paste%', '%vanilla paste%', 'vanilla%'],
    'Vanilla paste', 'OTHER', 'WEIGHT', sup_bidfood, 320, 'g', 27.80, 320,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_orange := pg_temp.wyp_ingredient(
    ARRAY['cmn8cceda00b716qz0h7areay'], ARRAY['orange valencia%', 'orange navel%', 'orange', 'oranges%'],
    'Orange Valencia', 'FRUIT', 'WEIGHT', NULL, 1, 'kg', 1.87, 1000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next produce invoice.');
  i_lemon := pg_temp.wyp_ingredient(
    ARRAY['cmn8cce4r009916qz44vriunw', 'cmn8cce4l009816qziv1pk29j'], ARRAY['lemon juice%', '%lemon juice%'],
    'Lemon juice premium Only Juice', 'CONDIMENT', 'VOLUME', sup_bidfood, 2000, 'ml', 9.41, 2000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');
  i_straw := pg_temp.wyp_ingredient(
    ARRAY['cmn8ccf1j00fr16qzglr5y1mj'], ARRAY['strawberry - tarte%', 'strawberries%', 'strawberry%'],
    'Strawberry - Tarte', 'FRUIT', 'WEIGHT', NULL, 1, 'kg', 11.00, 1000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next produce invoice.');
  i_lime_juice := pg_temp.wyp_ingredient(
    ARRAY['cmn8cce6b009j16qzg2s1w0j3'], ARRAY['lime juice%', '%lime juice%'],
    'Lime Juice', 'CONDIMENT', 'VOLUME', sup_bidfood, 1, 'l', 10.61, 1000,
    ARRAY[]::"Allergen"[], 'Price carried from the June 2026 book, confirm on the next invoice.');

  SELECT id INTO p_granola FROM "Preparation" WHERE id = 'prep_house_granola_01';
  IF p_granola IS NULL THEN
    SELECT id INTO p_granola FROM "Preparation" WHERE name ILIKE '%granola%' AND "batchCost" > 0 ORDER BY name LIMIT 1;
  END IF;

  -- ── 1. Whipped yoghurt (1,160 g batch, 155 g per serve) ─────────────
  wy := pg_temp.wyp_prep('Whipped Yoghurt', 'COMPONENT',
    E'1. Place the mascarpone, yoghurt, vanilla extract, icing sugar and lime zest in a mixing bowl.\n'
    '2. Whisk until smooth and light, without over-whipping.\n'
    '3. Transfer to a clean container, cover and refrigerate until service.\n\n'
    'Lime zest is costed as one whole lime (about 70 g). Portion 155 g per serve.',
    1160, 'g', 1160);
  IF wy.created THEN
    PERFORM pg_temp.wyp_prep_item(wy.prep_id, 0, i_masc, 300, 'g');
    PERFORM pg_temp.wyp_prep_item(wy.prep_id, 1, i_yoghurt, 800, 'g');
    PERFORM pg_temp.wyp_prep_item(wy.prep_id, 2, i_vanilla_ext, 10, 'g');
    PERFORM pg_temp.wyp_prep_item(wy.prep_id, 3, i_icing, 50, 'g');
    PERFORM pg_temp.wyp_prep_item(wy.prep_id, 4, i_lime, 70, 'g');
    PERFORM pg_temp.wyp_finish_prep(wy.prep_id);
  END IF;

  -- ── 2. Poached pears & star anise syrup (4 pears = 8 serves) ────────
  -- Half a pear plus 30 g syrup is one serve; the whole batch, syrup
  -- included, is spread over the 8 pear halves. Water is free.
  pp := pg_temp.wyp_prep('Poached Pears & Star Anise Syrup', 'COMPONENT',
    E'Pears 4 peeled, water 1,500 g, caster sugar 300 g, star anise 3, vanilla paste 20 g, zest of 1 orange, lemon juice 20 g.\n\n'
    '1. Dissolve the caster sugar in the water, then add star anise, vanilla paste and orange zest.\n'
    '2. Add the peeled pears and cook over medium heat for approximately 30 minutes.\n'
    '3. Check that the pears are tender but still hold their shape. Do not overcook. If necessary, cook for another 5 minutes and check again.\n'
    '4. Remove the pears and continue reducing the liquid until it reaches a light syrup consistency. Add the 20 g lemon juice.\n'
    '5. Cool the pears and syrup safely; refrigerate until service.\n\n'
    'One serve is half a pear with 30 g of syrup. Pears costed at about 200 g each, orange zest as one whole orange.',
    8, 'serves', 1480);
  IF pp.created THEN
    PERFORM pg_temp.wyp_prep_item(pp.prep_id, 0, i_pear, 800, 'g');
    PERFORM pg_temp.wyp_prep_item(pp.prep_id, 1, i_caster, 300, 'g');
    PERFORM pg_temp.wyp_prep_item(pp.prep_id, 2, i_star, 3, 'g');
    PERFORM pg_temp.wyp_prep_item(pp.prep_id, 3, i_vanilla_paste, 20, 'g');
    PERFORM pg_temp.wyp_prep_item(pp.prep_id, 4, i_orange, 200, 'g');
    PERFORM pg_temp.wyp_prep_item(pp.prep_id, 5, i_lemon, 20, 'ml');
    PERFORM pg_temp.wyp_finish_prep(pp.prep_id);
  END IF;

  -- ── 3. Macerated strawberries (380 g batch, 20 g per serve) ─────────
  ms := pg_temp.wyp_prep('Macerated Strawberries', 'COMPONENT',
    E'1. Combine the quartered strawberries, caster sugar and lime juice in a clean bowl.\n'
    '2. Mix gently and allow to macerate until the sugar dissolves and the strawberries release their juices. Keep refrigerated.\n\n'
    'Portion 20 g per serve.',
    380, 'g', 380);
  IF ms.created THEN
    PERFORM pg_temp.wyp_prep_item(ms.prep_id, 0, i_straw, 230, 'g');
    PERFORM pg_temp.wyp_prep_item(ms.prep_id, 1, i_caster, 100, 'g');
    PERFORM pg_temp.wyp_prep_item(ms.prep_id, 2, i_lime_juice, 50, 'ml');
    PERFORM pg_temp.wyp_finish_prep(ms.prep_id);
  END IF;

  -- ── Dish ────────────────────────────────────────────────────────────
  SELECT id INTO dish_id FROM "Dish" WHERE name = 'Whipped Yoghurt & Poached Pear' AND venue = 'BOTH';
  IF dish_id IS NOT NULL THEN
    RAISE NOTICE 'Whipped Yoghurt & Poached Pear already in the book (%), left as is', dish_id;
    RETURN;
  END IF;

  ex_gst := round(price / 1.1, 4);
  dish_id := gen_random_uuid()::text;
  INSERT INTO "Dish"
    ("id", "name", "menuCategory", "venue", "sellingPrice", "sellingPriceExGst", "notes", "updatedAt")
  VALUES
    (dish_id, 'Whipped Yoghurt & Poached Pear', 'BREAKFAST', 'BOTH', price, ex_gst,
     'Added 29 Oct 2026 from the kitchen prep and portion guide. Per serve: granola 70 g, whipped yoghurt 155 g, macerated strawberries 20 g, half a poached pear with 30 g star anise syrup. '
     || 'Priced at $21.90 to sit between the Acai Bowl and the Summer Yoghurt. '
     || 'Mascarpone falls back to the June 2026 Bidfood invoice price and star anise to an assumed one if the book has neither; check their ingredient notes.',
     now());

  total := total + pg_temp.wyp_dish_prep(dish_id, 0, p_granola, 70, 'g');
  total := total + pg_temp.wyp_dish_prep(dish_id, 1, wy.prep_id, 155, 'g');
  total := total + pg_temp.wyp_dish_prep(dish_id, 2, ms.prep_id, 20, 'g');
  total := total + pg_temp.wyp_dish_prep(dish_id, 3, pp.prep_id, 1, 'serve');

  UPDATE "Dish" SET
    "totalCost"          = round(total, 2),
    "foodCostPercentage" = CASE WHEN ex_gst > 0 THEN round(total / ex_gst * 100, 1) ELSE 0 END,
    "grossProfit"        = round(ex_gst - total, 2),
    "updatedAt"          = now()
  WHERE id = dish_id;

  RAISE NOTICE 'Whipped Yoghurt & Poached Pear added: cost %, price %', round(total, 2), price;
END $$;

DROP FUNCTION pg_temp.wyp_dish_prep(text, int, text, numeric, text);
DROP FUNCTION pg_temp.wyp_finish_prep(text);
DROP FUNCTION pg_temp.wyp_prep(text, "PreparationCategory", text, numeric, text, numeric);
DROP FUNCTION pg_temp.wyp_prep_item(text, int, text, numeric, text);
DROP FUNCTION pg_temp.wyp_ingredient(text[], text[], text, "IngredientCategory", "BaseUnitType", text, numeric, text, numeric, numeric, "Allergen"[], text);
DROP FUNCTION pg_temp.wyp_line_cost(text, numeric, text);
