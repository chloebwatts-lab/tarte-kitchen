-- Beach House: one prep list for both kitchens (Jose, 2026-09-22).
--
-- The Restaurant and Cafe count sheets are replaced by one sheet (station
-- MAIN) where every item carries the section responsible for it: Restaurant,
-- Café, KP, or Main prep (Michelle's production list). The items come from
-- Jose's two spreadsheets, names as he typed them apart from four obvious
-- typos. Anyone can still add a prep from the sheet.
--
-- The old RESTAURANT and CAFE items are switched off, not deleted, so past
-- counts and reports still read. Where a new item matches an old one by
-- name (either kitchen), its unit, par level, recipe link and notes carry
-- over. Safe to re-apply: an item that already exists on the MAIN list is
-- left alone.

CREATE TEMP TABLE jose_prep (name text, category text, sort_order int);
INSERT INTO jose_prep (name, category, sort_order) VALUES
  ('Crumpets', 'Restaurant', 1),
  ('Dry crumpets', 'KP', 2),
  ('Pancake mix', 'Café', 3),
  ('Tempura mix', 'KP', 4),
  ('Avo seasoning', 'Restaurant', 5),
  ('Chives', 'Restaurant', 6),
  ('Shallots', 'Restaurant', 7),
  ('Parsley', 'Café', 8),
  ('Sliced onion burger', 'Café', 9),
  ('Lemon', 'Café', 10),
  ('Lime', 'Restaurant', 11),
  ('Jalapenos', 'Café', 12),
  ('W.C.', 'KP', 13),
  ('Coriander', 'KP', 14),
  ('Mint', 'Café', 15),
  ('Lettuces', 'Restaurant', 16),
  ('Radicchio', 'Restaurant', 17),
  ('Finesse', 'Restaurant', 18),
  ('Fresh salad', 'Restaurant', 19),
  ('Pickles f. onion', 'Restaurant', 20),
  ('Diced pickle red onion', 'Restaurant', 21),
  ('Mince garlic', 'Restaurant', 22),
  ('Roast leek', 'Restaurant', 23),
  ('Potato salad', 'Restaurant', 24),
  ('Hash OG', 'Restaurant', 25),
  ('Chicken skin', 'Restaurant', 26),
  ('Capers', 'Café', 27),
  ('Hash bits', 'Café', 28),
  ('Fry wonton', 'Café', 29),
  ('Diced bacon', 'Restaurant', 30),
  ('Steak', 'Café', 31),
  ('Pc burger', 'Restaurant', 32),
  ('Pc barramundi', 'KP', 33),
  ('Pc fish', 'KP', 34),
  ('Pc salmon', 'Restaurant', 35),
  ('Prawns', 'Restaurant', 36),
  ('Eggplant', 'Restaurant', 37),
  ('Napolitan sauce', 'Restaurant', 38),
  ('Cook pasta', 'KP', 39),
  ('Pc pasta', 'Café', 40),
  ('Goats curd', 'Restaurant', 41),
  ('Parmesan', 'Restaurant', 42),
  ('Gruyere', 'Restaurant', 43),
  ('Mozzarella', 'Restaurant', 44),
  ('Roast hazelnuts', 'Café', 45),
  ('Parsley oil', 'Café', 46),
  ('Buns BE', 'Café', 47),
  ('Guacamole', 'Café', 48),
  ('Pico de gallo', 'Restaurant', 49),
  ('Halloumi', 'Café', 50),
  ('Leek dressing', 'KP', 51),
  ('Miso dressing', 'KP', 52),
  ('Bottles miso mayo', 'KP', 53),
  ('Bottles BBQ', 'KP', 54),
  ('Bottles gochu mayo', 'KP', 55),
  ('Bottles hot honey', 'KP', 56),
  ('Bottles jalapeno', 'KP', 57),
  ('Bottle lemon dressing', 'KP', 58),
  ('Bottles miso dressing', 'KP', 59),
  ('Bottles chilli sauce', 'KP', 60),
  ('Bottles leek dressing', 'KP', 61),
  ('Bottles white wine', 'KP', 62),
  ('Bottle lemon juice', 'KP', 63),
  ('Amazun dressing', 'Main prep', 64),
  ('OG hash wet', 'Main prep', 65),
  ('Jalapeno sauce', 'Main prep', 66),
  ('Hot honey', 'Main prep', 67),
  ('Sweet chilli sauce', 'Main prep', 68),
  ('Green curry', 'Main prep', 69),
  ('Chilli sauce', 'Main prep', 70),
  ('Lemon dressing', 'Main prep', 71),
  ('BBQ sauce', 'Main prep', 72),
  ('Guzzy sauce', 'Main prep', 73),
  ('Miso mayo', 'Main prep', 74),
  ('Gochujang mayo', 'Main prep', 75),
  ('L''Entrecote', 'Main prep', 76),
  ('Poach chicken', 'Main prep', 77),
  ('Mustard butter', 'Main prep', 78),
  ('Garlic butter', 'Main prep', 79),
  ('Pea fritter', 'Main prep', 80),
  ('Egg mix', 'Main prep', 81),
  ('Bechamel', 'Main prep', 82),
  ('Potato hash', 'Main prep', 83),
  ('Maple bacon', 'Main prep', 84),
  ('Bacon jam', 'Main prep', 85),
  ('Confit tomato', 'Main prep', 86),
  ('Crispy chilli', 'Main prep', 87),
  ('Wombok', 'Main prep', 88),
  ('Slice chips', 'Main prep', 89),
  ('Avo', 'Main prep', 90),
  ('Caramelized peanut', 'Main prep', 91),
  ('Herb cream cheese', 'Main prep', 92),
  ('Pickle red onion', 'Main prep', 93),
  ('Pickles', 'Main prep', 94),
  ('Tomato soup', 'Main prep', 95),
  ('Onion soup', 'Main prep', 96),
  ('Milanese', 'Main prep', 97),
  ('Barramundi', 'Main prep', 98),
  ('Fish', 'Main prep', 99);

INSERT INTO "PrepStockItem"
  (id, venue, station, name, unit, category, "parLevel", "sortOrder", "preparationId", notes, "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'BEACH_HOUSE', 'MAIN', j.name, o.unit, j.category, o."parLevel", j.sort_order, o."preparationId", o.notes,
  true, now(), now()
FROM jose_prep j
LEFT JOIN LATERAL (
  SELECT unit, "parLevel", "preparationId", notes
  FROM "PrepStockItem" p
  WHERE p.venue = 'BEACH_HOUSE' AND p.station IN ('RESTAURANT', 'CAFE')
    AND lower(trim(p.name)) = lower(j.name)
  ORDER BY p.station LIMIT 1
) o ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "PrepStockItem" e
  WHERE e.venue = 'BEACH_HOUSE' AND e.station = 'MAIN' AND e.name = j.name
);

UPDATE "PrepStockItem"
SET "isActive" = false, "updatedAt" = now()
WHERE venue = 'BEACH_HOUSE' AND station IN ('RESTAURANT', 'CAFE') AND "isActive";

DROP TABLE jose_prep;
