-- Burleigh stock walk: four storage locations and what is in them, from
-- Georgia's stocktake (23 Sep 2026). Every item is counted (QUANTITY) with
-- her count as the opening on-hand, written as a COUNT movement so the
-- ledger explains the number. Pars are a starting point for her to adjust
-- on the Stock list screen: 1 for anything kept by the box or packet
-- (reorder when down to the last one), 10 for loose lids, 0 for toner
-- (one of each on hand, flag when it is gone).
--
-- Safe to re-apply: an area or item that already exists at Burleigh is left
-- alone, counts included.

CREATE TEMP TABLE g_area (name text, sort_order int, note text);
INSERT INTO g_area VALUES
  ('Tarte Market cupboards', 1, 'Mediterranean Markets crockery, boxes on hand'),
  ('Carpark garden shed', 2, NULL),
  ('Carpark storage units', 3, 'Plasdene retail jars and bottles'),
  ('Location tbc', 4, 'Georgia to confirm where these live');

CREATE TEMP TABLE g_item (area text, name text, unit text, on_hand numeric, par numeric, sort_order int, notes text);
INSERT INTO g_item VALUES
  ('Tarte Market cupboards', 'Mugs FL034DE', 'box', 4, 1, 1, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Large cups FL046DE', 'box', 5, 1, 2, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Small cups FL019DE', 'box', 5, 1, 3, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Pastry plates FL028DE', 'box', 5, 1, 4, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Saucers FL029DE', 'box', 5, 1, 5, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Sugar pots FL002DE', 'box', 5, 1, 6, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Health bowls FL021WH', 'box', 2, 1, 7, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Milk jugs FL011DE', 'box', 2, 1, 8, 'Mediterranean Markets'),
  ('Tarte Market cupboards', 'Piccolo FL07DE', 'box', 2, 1, 9, 'Mediterranean Markets'),
  ('Carpark garden shed', 'Glass cleaner', 'bottle', 3, 1, 1, NULL),
  ('Carpark storage units', 'Retail jars', 'box', 3, 1, 1, 'Plasdene'),
  ('Carpark storage units', 'Tarte bottles', 'box', 4, 1, 2, 'Plasdene'),
  ('Carpark storage units', 'Bottle lids', NULL, 40, 10, 3, 'Plasdene'),
  ('Carpark storage units', 'Jar lids', NULL, 30, 10, 4, 'Plasdene'),
  ('Location tbc', 'A4 printing paper', 'packet', 2, 1, 1, 'Premium 160gsm A4 Digital Copy Paper'),
  ('Location tbc', 'Toner, black (BLK)', NULL, 1, 0, 2, NULL),
  ('Location tbc', 'Toner, cyan (C)', NULL, 1, 0, 3, NULL),
  ('Location tbc', 'Toner, magenta (M)', NULL, 1, 0, 4, NULL),
  ('Location tbc', 'Toner, yellow (Y)', NULL, 1, 0, 5, NULL),
  ('Location tbc', 'Dinner plates and side B&E plates', 'box', 3, 1, 6, NULL),
  ('Location tbc', 'Cutlery', 'box', 5, 1, 7, NULL),
  ('Location tbc', 'Iced latte / market juice glasses', 'box', 3, 1, 8, NULL);

-- Areas go on the end of Burleigh's walk, in Georgia's order.
INSERT INTO "VenueStockArea" (id, venue, name, "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'BURLEIGH', a.name,
       (SELECT COALESCE(MAX("sortOrder"), -1) FROM "VenueStockArea" WHERE venue = 'BURLEIGH') + a.sort_order,
       true, now(), now()
FROM g_area a
WHERE NOT EXISTS (SELECT 1 FROM "VenueStockArea" e WHERE e.venue = 'BURLEIGH' AND e.name = a.name);

-- Items, with the opening count on the ledger.
WITH created AS (
  INSERT INTO "VenueStockItem"
    (id, "areaId", name, unit, tracking, "parLevel", "onHand", signal, "sortOrder", notes, "isActive", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, ar.id, i.name, i.unit, 'QUANTITY', i.par, i.on_hand, 'OK', i.sort_order, i.notes, true, now(), now()
  FROM g_item i
  JOIN "VenueStockArea" ar ON ar.venue = 'BURLEIGH' AND ar.name = i.area
  WHERE NOT EXISTS (SELECT 1 FROM "VenueStockItem" e WHERE e."areaId" = ar.id AND e.name = i.name)
  RETURNING id, "onHand"
)
INSERT INTO "VenueStockMovement" (id, "itemId", kind, delta, balance, "countedTo", "by", note, "createdAt")
SELECT gen_random_uuid()::text, c.id, 'COUNT', c."onHand", c."onHand", c."onHand", 'Georgia', 'Opening count, 23 Sep 2026', now()
FROM created c;

DROP TABLE g_item;
DROP TABLE g_area;
