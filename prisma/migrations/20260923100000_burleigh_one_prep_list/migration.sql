-- Burleigh: one prep list, sectioned by station (Vini, 2026-09-23).
--
-- Vini's three paper prep lists become one count sheet (station MAIN) where
-- every item carries the station that makes it: Main kitchen grill, Main
-- kitchen larder, Market grill, Market larder, or Production. The items come
-- from his three sheets in his order, names as he typed them apart from one
-- obvious typo ("Miso Mayop") and "H C C" written HCC as on his Market
-- sheet. Anyone can still add a prep from the sheet.
--
-- The same prep can sit on two stations' lists (both grills fill Bottle Goji
-- Mayo, Bottle Barbecue, Bottle Lemon Juice and Bottle Garlic Oil; Market
-- grill and Main larder both bottle Miso Mayo and Lemongrass Dressing). Each
-- station counts its own, so the name is now unique within a section rather
-- than the station.
--
-- Existing Burleigh items that match one of Vini's by name keep their id
-- (so past counts still read), move into his section and take his order;
-- their unit, par level, recipe link and notes carry over to a second copy
-- where the same name sits on two stations. Anything on the old Burleigh
-- list that is not on Vini's is switched off, not deleted: admin → Restock
-- can restore it. Safe to re-apply.

DROP INDEX IF EXISTS "PrepStockItem_venue_station_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PrepStockItem_venue_station_category_name_key"
  ON "PrepStockItem"("venue", "station", "category", "name");

CREATE TEMP TABLE vini_prep (name text, category text, sort_order int);
INSERT INTO vini_prep (name, category, sort_order) VALUES
  -- Prep list Main Kitchen: Grill
  ('Chives', 'Main kitchen grill', 1),
  ('Guacamole', 'Main kitchen grill', 2),
  ('Cut Buns', 'Main kitchen grill', 3),
  ('Bottle Goji Mayo', 'Main kitchen grill', 4),
  ('Bottle Barbecue', 'Main kitchen grill', 5),
  ('Bottle Ghee', 'Main kitchen grill', 6),
  ('Bottle Lemon Juice', 'Main kitchen grill', 7),
  ('Bottle Garlic Oil', 'Main kitchen grill', 8),
  ('Slice Jalapeno', 'Main kitchen grill', 9),
  ('Chicken Skin', 'Main kitchen grill', 10),
  ('Sliced Onion', 'Main kitchen grill', 11),
  ('Cut Halloumi', 'Main kitchen grill', 12),
  ('Potato Hash/Mix', 'Main kitchen grill', 13),
  ('HCC', 'Main kitchen grill', 14),
  ('Mushrooms Portion', 'Main kitchen grill', 15),
  ('Chilli Caramelized Peanuts', 'Main kitchen grill', 16),
  ('Cut Parmesan', 'Main kitchen grill', 17),
  ('Defrost Burger', 'Main kitchen grill', 18),
  ('Mascarpone Cream', 'Main kitchen grill', 19),
  -- Prep list Main Kitchen: Larder
  ('Fry Capers', 'Main kitchen larder', 20),
  ('Capers Tomato Bagel', 'Main kitchen larder', 21),
  ('Bottle Lemon Dressing', 'Main kitchen larder', 22),
  ('Bottle Lemongrass Dressing', 'Main kitchen larder', 23),
  ('Bottle Satay Dressing', 'Main kitchen larder', 24),
  ('Bottle Miso Mayo', 'Main kitchen larder', 25),
  ('Cranberries', 'Main kitchen larder', 26),
  ('Toast Almond', 'Main kitchen larder', 27),
  ('Poach Chicken', 'Main kitchen larder', 28),
  ('Salmon Portion', 'Main kitchen larder', 29),
  ('Watercress', 'Main kitchen larder', 30),
  ('Salted Onion', 'Main kitchen larder', 31),
  ('Lemon Wedge', 'Main kitchen larder', 32),
  ('Lime Wedge', 'Main kitchen larder', 33),
  ('Zucchini', 'Main kitchen larder', 34),
  ('Red Onion Pickled', 'Main kitchen larder', 35),
  ('Green Apple', 'Main kitchen larder', 36),
  ('HB Mix Portion', 'Main kitchen larder', 37),
  ('Satay Mix Portion', 'Main kitchen larder', 38),
  ('Asparagus', 'Main kitchen larder', 39),
  ('Radish', 'Main kitchen larder', 40),
  ('Green Peas', 'Main kitchen larder', 41),
  ('Snow Peas', 'Main kitchen larder', 42),
  ('Leek 01', 'Main kitchen larder', 43),
  ('Leek 02', 'Main kitchen larder', 44),
  ('Finissé', 'Main kitchen larder', 45),
  ('Radicchio', 'Main kitchen larder', 46),
  ('Goat Cream', 'Main kitchen larder', 47),
  ('Potato for Salad', 'Main kitchen larder', 48),
  ('Hazelnuts', 'Main kitchen larder', 49),
  -- Prep list Market: Grill
  ('Scramble Eggs', 'Market grill', 50),
  ('Chips', 'Market grill', 51),
  ('Bottle Miso Mayo', 'Market grill', 52),
  ('Bottle Goji Mayo', 'Market grill', 53),
  ('Bottle Barbecue', 'Market grill', 54),
  ('Bottle Lemon Juice', 'Market grill', 55),
  ('Bottle Garlic Oil', 'Market grill', 56),
  ('Bottle Lemongrass Dressing', 'Market grill', 57),
  ('Caramelized Onion', 'Market grill', 58),
  ('Teriyaki Sauce', 'Market grill', 59),
  ('Slice Brisket', 'Market grill', 60),
  ('Marinated Karaage', 'Market grill', 61),
  ('Bacon Jam', 'Market grill', 62),
  ('HCC', 'Market grill', 63),
  ('Cheese Bagels for Soup', 'Market grill', 64),
  ('Soak Oats', 'Market grill', 65),
  ('Portion Granola', 'Market grill', 66),
  ('Basil Oil', 'Market grill', 67),
  ('Pangratto', 'Market grill', 68),
  ('Portion Rhubarb', 'Market grill', 69),
  ('Ricotta Cream', 'Market grill', 70),
  ('Vanilla Cream', 'Market grill', 71),
  ('Phillip Seasoning', 'Market grill', 72),
  -- Prep list Market: Larder
  ('Kale Mix', 'Market larder', 73),
  ('Wombok', 'Market larder', 74),
  ('Celeriac', 'Market larder', 75),
  ('Coriander', 'Market larder', 76),
  ('S.onion', 'Market larder', 77),
  ('Sliced Red Onion', 'Market larder', 78),
  ('Lemongrass Dressing', 'Market larder', 79),
  ('White Cabbage', 'Market larder', 80),
  ('Fried Onion Portion', 'Market larder', 81),
  -- Prep list Production
  ('Sausage Roll', 'Production', 82),
  ('HB Salad Mix', 'Production', 83),
  ('Bechamel', 'Production', 84),
  ('Slice Ham', 'Production', 85),
  ('Slice Roast Beef', 'Production', 86),
  ('Cut Bread', 'Production', 87),
  ('Toast 5 cheese', 'Production', 88),
  ('Miso Mayo', 'Production', 89),
  ('Goji Mayo', 'Production', 90),
  ('BBQ Sauce', 'Production', 91),
  ('Ketchup', 'Production', 92),
  ('Hash Sauce', 'Production', 93),
  ('Garlic Oil', 'Production', 94),
  ('Sambal', 'Production', 95),
  ('Egg Mix', 'Production', 96),
  ('Avocado', 'Production', 97),
  ('Mushroom Mix', 'Production', 98),
  ('Pickles', 'Production', 99),
  ('Baby Pickles', 'Production', 100),
  ('Brisket', 'Production', 101),
  ('Top Side', 'Production', 102),
  ('Butterfly Chicken', 'Production', 103),
  ('Chicken Flour', 'Production', 104),
  ('Sausage Roll Mix', 'Production', 105),
  ('Burger Ball', 'Production', 106),
  ('Rhubarb', 'Production', 107),
  ('Pie Mix', 'Production', 108),
  ('Tomato Soup', 'Production', 109),
  ('French Toast', 'Production', 110);

-- 1. Everything Burleigh counts today goes quiet; Vini's list switches the
--    items it keeps back on below.
UPDATE "PrepStockItem"
SET "isActive" = false, "updatedAt" = now()
WHERE venue = 'BURLEIGH' AND station = 'MAIN' AND "isActive";

-- 2a. Items already sitting in their slot on Vini's list (a re-run, or an
--     item a chef added after this shipped) come back on in his order.
UPDATE "PrepStockItem" p
SET "sortOrder" = v.sort_order, "isActive" = true, "updatedAt" = now()
FROM vini_prep v
WHERE p.venue = 'BURLEIGH' AND p.station = 'MAIN'
  AND p.category = v.category AND p.name = v.name;

-- 2b. An old Burleigh item that matches one of Vini's by name keeps its id
--     (so past counts still read): it takes his spelling, section and order
--     and comes back on. Where his name appears on two stations, the old
--     item takes the first still-empty slot; where two old items spell the
--     same name differently, the older one is kept.
WITH unfilled AS (
  SELECT DISTINCT ON (lower(v.name)) v.name, v.category, v.sort_order
  FROM vini_prep v
  WHERE NOT EXISTS (
    SELECT 1 FROM "PrepStockItem" e
    WHERE e.venue = 'BURLEIGH' AND e.station = 'MAIN'
      AND e.category = v.category AND e.name = v.name
  )
  ORDER BY lower(v.name), v.sort_order
),
keeper AS (
  SELECT DISTINCT ON (lower(trim(p.name))) p.id, u.name, u.category, u.sort_order
  FROM "PrepStockItem" p
  JOIN unfilled u ON lower(trim(p.name)) = lower(u.name)
  WHERE p.venue = 'BURLEIGH' AND p.station = 'MAIN'
    AND NOT EXISTS (
      SELECT 1 FROM vini_prep v WHERE v.category = p.category AND v.name = p.name
    )
  ORDER BY lower(trim(p.name)), p."createdAt"
)
UPDATE "PrepStockItem" p
SET name = k.name,
    category = k.category,
    "sortOrder" = k.sort_order,
    "isActive" = true,
    "updatedAt" = now()
FROM keeper k
WHERE p.id = k.id;

-- 3. The rest of Vini's list is new. A second copy of a name (the bottles
--    both grills fill) borrows the unit, par, recipe link and notes of the
--    item already carrying that name.
INSERT INTO "PrepStockItem"
  (id, venue, station, name, unit, category, "parLevel", "sortOrder", "preparationId", notes, "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'BURLEIGH', 'MAIN', v.name, o.unit, v.category, o."parLevel", v.sort_order, o."preparationId", o.notes,
  true, now(), now()
FROM vini_prep v
LEFT JOIN LATERAL (
  SELECT unit, "parLevel", "preparationId", notes
  FROM "PrepStockItem" p
  WHERE p.venue = 'BURLEIGH' AND p.station = 'MAIN'
    AND lower(trim(p.name)) = lower(v.name)
  ORDER BY p."isActive" DESC, p."createdAt"
  LIMIT 1
) o ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "PrepStockItem" e
  WHERE e.venue = 'BURLEIGH' AND e.station = 'MAIN'
    AND e.category = v.category AND e.name = v.name
);

DROP TABLE vini_prep;
