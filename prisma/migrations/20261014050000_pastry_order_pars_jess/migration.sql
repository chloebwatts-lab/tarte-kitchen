-- Jess's "Suppliers Control" order list (PDF, 14 Oct 2026) onto the Pastry
-- order form: the Burleigh and Currumbin numbers become par levels in the
-- Par column, and the Order column stays empty, like the space on her sheet.
--
-- Each product is matched to the approved supplier item it is (the
-- catalogue name on the right), or added as a new item under her own name
-- when the catalogue has nothing for it, with no price yet. Matched items
-- that were switched off come back on, since pastry orders them. An item
-- lands on the Pastry form unless another department has ordered it in the
-- last 60 days, in which case it stays where it is and the par shows there.
-- Safe to re-apply: pars are upserted, items are created once.

CREATE TEMP TABLE jess_order (supplier text, jess_name text, unit text, burleigh numeric, currumbin numeric, catalogue text, category text);
INSERT INTO jess_order VALUES
  -- Fermex
  ('Fermex', 'Almond flakes', 'box', 1, 1, 'Almond Flakes / Sliced Blanched', 'Nuts'),
  ('Fermex', 'Almond meal', 'box', 1, 1, 'Almond Meal Blanched (Almondco)', 'Nuts'),
  ('Fermex', 'Bakers flour', 'bag', 8, 4, 'Bakers Flour (Manildra)', 'Pastry/Baking'),
  ('Fermex', 'Butter sheet', 'each', 18, 0, 'Tourage French Butter Sheets', 'Dairy'),
  ('Fermex', 'Canola oil spray', 'each', 6, 3, 'Canola Oil Spray (Prochef)', 'Oils'),
  ('Fermex', 'Frozen berries', 'unit', 1, 1, NULL, 'Frozen'),
  ('Fermex', 'Pecan nuts', 'bag', 1, 1, 'Pecan Nut Halves 13.6kg', 'Nuts'),
  ('Fermex', 'Pistachio 13.61 kg', 'box', 1, 1, 'Pistachio Kernels Raw 13.61kg', 'Nuts'),
  ('Fermex', 'Plain flour', 'bag', 8, 4, 'Plain Flour (Manildra)', 'Pastry/Baking'),
  ('Fermex', 'Type 55 flour', 'bag', 4, 0, 'Flour Euro Type 55 (Laucke)', 'Pastry/Baking'),
  ('Fermex', 'Poppy seeds', 'bag', 2, 2, 'Poppy Seed', 'Spices'),
  ('Fermex', 'Raspberries', 'bag', 5, 3, 'Raspberry Frozen IQF 1kg', 'Frozen'),
  ('Fermex', 'Unsalted butter', 'block', 3, 2, 'Butter Unsalted USA 25kg (Fermex)', 'Dairy'),
  ('Fermex', 'Vanilla paste', 'bottle', 3, 5, 'Vanilla Bean Paste 1kg Flavormaster', 'Pastry/Baking'),
  -- Bidfood
  ('Bidfood', 'Apple puree', 'can', 1, 1, 'Apple Purée (Riviana)', 'Pantry'),
  ('Bidfood', 'Almond raw', 'bag', 3, 2, 'Almonds Raw Kernels (Catchoice)', 'Nuts'),
  ('Bidfood', 'Baking paper roll', 'box', 1, 1, 'Baking Paper roll', 'Pastry/Baking'),
  ('Bidfood', 'Biscuits gluten free', 'box', 3, 3, 'Biscuits Arrowroot Egg Dairy Gluten Free (Leda)', 'Pantry'),
  ('Bidfood', 'Black sesame seeds', '15 kg bag', 3, 3, NULL, 'Pantry'),
  ('Bidfood', 'Caster sugar 25 kg', 'bag', 4, 2, 'Sugar Caster (Bundaberg) — 25 kg', 'Pastry/Baking'),
  ('Bidfood', 'Cinnamon', 'bag', 1, 1, NULL, 'Pantry'),
  ('Bidfood', 'Coconut', 'bag', 3, 3, 'Coconut Shredded (Longthread) (Catchoice)', 'Nuts'),
  ('Bidfood', 'Condensed milk bag', 'bag 5 kg', 1, 1, NULL, 'Dairy'),
  ('Bidfood', 'Condensed milk cans', 'box', 3, 2, 'Milk Condensed Sweetened (Nestle)', 'Dairy'),
  ('Bidfood', 'Cranberries dried', 'bag', 2, 1, 'Cranberries Dried Sweetened (Catchoice)', 'Pantry'),
  ('Bidfood', 'Dry rosemary', 'bottle', 2, 2, NULL, 'Pantry'),
  ('Bidfood', 'Frosting', 'bucket', 2, 1, NULL, 'Pastry/Baking'),
  ('Bidfood', 'Gluten-free flour', 'bag', 2, 2, 'Flour Plain Gluten Free (Baking Tec)', 'Pastry/Baking'),
  ('Bidfood', 'Granulated garlic', 'bag', 3, 3, 'Garlic Granules (Catchoice)', 'Pantry'),
  ('Bidfood', 'Onion flakes', 'bag', 4, 4, NULL, 'Pantry'),
  ('Bidfood', 'Passion fruit pulp', 'bottle', 6, 3, 'Pulp Passionfruit (Catchoice)', 'Pantry'),
  ('Bidfood', 'Pepitas', 'bag', 2, 2, NULL, 'Nuts'),
  ('Bidfood', 'Raspberries whole freeze dried', 'bag', 3, 1, 'Raspberries Whole Freeze Dried (Fresh As)', 'Pantry'),
  ('Bidfood', 'Ricotta cheese', 'basket', 5, 3, 'Cheese Ricotta Basket (Fresco)', 'Dairy'),
  ('Bidfood', 'Sea salt', 'pack', 2, 2, 'Salt Sea Flakes Natural (Cornish)', 'Pantry'),
  ('Bidfood', 'Self raising flour', 'bag', 3, 3, 'Flour Self Raising (Gemofthewest)', 'Pastry/Baking'),
  ('Bidfood', 'Sultanas', 'bag', 2, 1, NULL, 'Pantry'),
  ('Bidfood', 'Sunflower seeds', 'bag', 1, 1, 'Seeds Sunflower Kernels (Catchoice)', 'Pantry'),
  ('Bidfood', 'White sesame seeds', 'bag', 3, 3, 'Seeds Sesame (Catchoice)', 'Pantry'),
  ('Bidfood', 'Icing sugar', 'bag', 1, 1, 'Icing Sugar Soft Mixture (Bundaberg)', 'Pastry/Baking'),
  ('Bidfood', 'Nutella', 'bucket', 2, 2, 'Spread Chocolate Hazelnut (Nutella)', 'Pastry/Baking'),
  ('Bidfood', 'Yeast', 'box', 1, 1, NULL, 'Pastry/Baking'),
  ('Bidfood', 'Flan Gel', 'bucket', 2, 1, NULL, 'Pastry/Baking'),
  -- The Provedores
  ('The Provedores', 'Agave', NULL, 1, 1, 'AGAVE Organic Syrup', 'Pantry'),
  ('The Provedores', 'Baking powder', 'bag', 1, 1, 'Baking powder trumps', 'Pastry/Baking'),
  ('The Provedores', 'Brown sugar', 'bag', 2, 1, 'SUGAR Brown', 'Pastry/Baking'),
  ('The Provedores', 'Cling wrap', 'box', 1, 1, NULL, 'Packaging'),
  ('The Provedores', 'Cream', 'bottle', 1, 3, 'Cream Thickened', 'Dairy'),
  ('The Provedores', 'Glucose 5 kg', 'bucket', 1, 1, 'Glucose', 'Pastry/Baking'),
  ('The Provedores', 'Macadamia', 'box', 1, 1, 'Macadamia Pieces', 'Pantry'),
  ('The Provedores', 'Malted milk powder', 'can', 2, 1, 'MALTED Milk Powder', 'Pastry/Baking'),
  ('The Provedores', 'Milo', 'can', 1, 1, 'Milo', 'Beverages'),
  ('The Provedores', 'Oats 25 kg', 'bag', 1, 1, 'Oats Rolled', 'Pantry'),
  ('The Provedores', 'Raw sugar', 'bag', 1, 1, NULL, 'Pastry/Baking'),
  ('The Provedores', 'White chocolate', 'bag', 6, 6, 'CHOCOLATE Picolli White Drops 2.5kg (4)', 'Pastry/Baking'),
  ('The Provedores', 'Whole almond', 'box', 1, 1, 'NUT Almond Natural Kernals', 'Pantry'),
  -- Eustralis
  ('Eustralis', 'Baking paper sheets', 'box', 1, 1, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Chocolate batton', 'box', 5, 0, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Dark chocolate', 'bag', 2, 2, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Milk chocolate', 'bag', 2, 2, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Piping bags', 'box', 1, 1, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Plain croissants', NULL, NULL, NULL, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Mini croissants', NULL, NULL, NULL, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Puff pastry', NULL, NULL, NULL, NULL, 'Pastry/Baking'),
  ('Eustralis', 'Vanilla', 'bottle', 6, 6, 'Vanilla Paste Bourbon with Seeds 500g (Prova)', 'Pastry/Baking');

DO $$
DECLARE
  j record;
  sup_id text;
  item_id text;
  other_dept_recent boolean;
BEGIN
  FOR j IN SELECT * FROM jess_order LOOP
    SELECT id INTO sup_id FROM "Supplier" WHERE lower(name) = lower(j.supplier) LIMIT 1;
    IF sup_id IS NULL THEN
      RAISE NOTICE 'No supplier % for %, skipped', j.supplier, j.jess_name;
      CONTINUE;
    END IF;

    -- The catalogue item, by its name first, then by Jess's name (a re-apply
    -- or a row someone already added by hand).
    item_id := NULL;
    IF j.catalogue IS NOT NULL THEN
      SELECT id INTO item_id FROM "ApprovedSupplierItem"
       WHERE "supplierId" = sup_id AND lower(trim(name)) = lower(j.catalogue) LIMIT 1;
    END IF;
    IF item_id IS NULL THEN
      SELECT id INTO item_id FROM "ApprovedSupplierItem"
       WHERE "supplierId" = sup_id AND lower(trim(name)) = lower(j.jess_name) LIMIT 1;
    END IF;
    IF item_id IS NULL THEN
      INSERT INTO "ApprovedSupplierItem"
        (id, "supplierId", name, "packSize", "packPrice", unit, category, notes, active, "sortOrder", dept, "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid()::text, sup_id, j.jess_name, j.unit, 0, NULL, j.category,
         'From Jess''s Suppliers Control list (14 Oct 2026). Price to confirm.', true, 999, 'PASTRY', now(), now())
      RETURNING id INTO item_id;
    ELSE
      -- Pastry orders it, so it is on the book.
      UPDATE "ApprovedSupplierItem" SET active = true, "updatedAt" = now() WHERE id = item_id AND NOT active;
      -- Onto the Pastry form unless another department ordered it recently.
      SELECT EXISTS (
        SELECT 1 FROM "DeptOrderLine" l JOIN "DeptOrderRequest" r ON r.id = l."requestId"
         WHERE l."approvedItemId" = item_id AND r.dept <> 'PASTRY' AND l."createdAt" > now() - interval '60 days'
      ) INTO other_dept_recent;
      IF NOT other_dept_recent THEN
        UPDATE "ApprovedSupplierItem" SET dept = 'PASTRY', "updatedAt" = now()
         WHERE id = item_id AND (dept IS NULL OR dept <> 'PASTRY');
      END IF;
    END IF;

    -- Par levels, one per venue. 0 or blank on her sheet means no par.
    IF j.burleigh IS NOT NULL AND j.burleigh > 0 THEN
      INSERT INTO "DeptItemPar" (id, venue, "approvedItemId", par, "updatedBy", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'BURLEIGH', item_id, j.burleigh, 'Jess (Suppliers Control list)', now(), now())
      ON CONFLICT (venue, "approvedItemId") DO UPDATE SET par = EXCLUDED.par, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now();
    END IF;
    IF j.currumbin IS NOT NULL AND j.currumbin > 0 THEN
      INSERT INTO "DeptItemPar" (id, venue, "approvedItemId", par, "updatedBy", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'BEACH_HOUSE', item_id, j.currumbin, 'Jess (Suppliers Control list)', now(), now())
      ON CONFLICT (venue, "approvedItemId") DO UPDATE SET par = EXCLUDED.par, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now();
    END IF;
  END LOOP;
END $$;

DROP TABLE jess_order;
