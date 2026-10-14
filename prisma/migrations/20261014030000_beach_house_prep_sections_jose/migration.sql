-- Beach House prep list sections, from Jose's handwritten note (14 Oct 2026):
--
--   Café        W.C., Coriander, Pico de gallo, Parmesan, Pc burger,
--               Diced bacon, Avo seasoning
--   Restaurant  Barramundi (Pc barramundi), Cook pasta, Parsley oil,
--               Roast hazelnuts, Steak, Parsley
--
-- Each one moves to that section on the one Beach House list (station
-- MAIN); anything on the note that is not on the list is added to it. The
-- section lives in PrepStockItem.category. Names are matched the way the
-- 22 Sep migration wrote them, case and spacing aside, so "Pico de gallo"
-- on the list and "Pico de Gallo" on the note are the same item.
--
-- (venue, station, category, name) is unique, so where the target section
-- already holds an item of that name the old row is switched off instead
-- of moved. Safe to re-apply.

CREATE TEMP TABLE jose_sections (name text, category text, sort_order int);
INSERT INTO jose_sections (name, category, sort_order) VALUES
  ('W.C.', 'Café', 1),
  ('Coriander', 'Café', 2),
  ('Pico de gallo', 'Café', 3),
  ('Parmesan', 'Café', 4),
  ('Pc burger', 'Café', 5),
  ('Diced bacon', 'Café', 6),
  ('Avo seasoning', 'Café', 7),
  ('Pc barramundi', 'Restaurant', 8),
  ('Cook pasta', 'Restaurant', 9),
  ('Parsley oil', 'Restaurant', 10),
  ('Roast hazelnuts', 'Restaurant', 11),
  ('Steak', 'Restaurant', 12),
  ('Parsley', 'Restaurant', 13);

-- A name as a chef would type it: lower case, one space, no trailing dot.
CREATE OR REPLACE FUNCTION pg_temp.jose_key(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(regexp_replace(trim(t), '\s+', ' ', 'g')), '\.+$', '')
$$;

DO $$
DECLARE
  j record;
  cur record;
  n int;
BEGIN
  FOR j IN SELECT * FROM jose_sections ORDER BY sort_order LOOP
    -- Already in the right section (active or not): make sure it is on.
    UPDATE "PrepStockItem"
       SET "isActive" = true, "updatedAt" = now()
     WHERE venue = 'BEACH_HOUSE' AND station = 'MAIN' AND category = j.category
       AND pg_temp.jose_key(name) = pg_temp.jose_key(j.name)
       AND NOT "isActive";
    GET DIAGNOSTICS n = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM "PrepStockItem"
                WHERE venue = 'BEACH_HOUSE' AND station = 'MAIN' AND category = j.category
                  AND pg_temp.jose_key(name) = pg_temp.jose_key(j.name)) THEN
      -- The note's section already holds it; any copy in another section goes off.
      UPDATE "PrepStockItem"
         SET "isActive" = false, "updatedAt" = now()
       WHERE venue = 'BEACH_HOUSE' AND station = 'MAIN' AND category <> j.category
         AND pg_temp.jose_key(name) = pg_temp.jose_key(j.name) AND "isActive";
      CONTINUE;
    END IF;

    -- On the list under another section: move it (active copy first, else any).
    SELECT id INTO cur FROM "PrepStockItem"
     WHERE venue = 'BEACH_HOUSE' AND station = 'MAIN'
       AND pg_temp.jose_key(name) = pg_temp.jose_key(j.name)
     ORDER BY "isActive" DESC, "updatedAt" DESC LIMIT 1;
    IF cur.id IS NOT NULL THEN
      UPDATE "PrepStockItem"
         SET category = j.category, "isActive" = true, "updatedAt" = now()
       WHERE id = cur.id;
      UPDATE "PrepStockItem"
         SET "isActive" = false, "updatedAt" = now()
       WHERE venue = 'BEACH_HOUSE' AND station = 'MAIN' AND id <> cur.id
         AND pg_temp.jose_key(name) = pg_temp.jose_key(j.name) AND "isActive";
      CONTINUE;
    END IF;

    -- Not on the list at all: add it, carrying anything the old per-kitchen
    -- sheets knew about it (unit, par, recipe link, notes).
    INSERT INTO "PrepStockItem"
      (id, venue, station, name, unit, category, "parLevel", "sortOrder", "preparationId", notes, "isActive", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'BEACH_HOUSE', 'MAIN', j.name, o.unit, j.category, o."parLevel",
           COALESCE((SELECT MAX("sortOrder") FROM "PrepStockItem" WHERE venue = 'BEACH_HOUSE' AND station = 'MAIN'), 0) + j.sort_order,
           o."preparationId", o.notes, true, now(), now()
      FROM (SELECT 1) one
      LEFT JOIN LATERAL (
        SELECT unit, "parLevel", "preparationId", notes
          FROM "PrepStockItem" p
         WHERE p.venue = 'BEACH_HOUSE' AND pg_temp.jose_key(p.name) = pg_temp.jose_key(j.name)
         ORDER BY p."updatedAt" DESC LIMIT 1
      ) o ON true;
  END LOOP;
END $$;

DROP TABLE jose_sections;
