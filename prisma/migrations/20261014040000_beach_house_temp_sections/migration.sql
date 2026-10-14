-- Beach House temperature checks in three sections, Kitchen, Pastry and
-- FOH (Jose, 14 Oct 2026), with the kitchen split into his two sides:
--
--   Restaurant   Pass fridge, Grill fridge, Back prep fridge, Freezer room,
--                Cool room
--   Café         Larder fridge, Grill fridge, Main cool room
--
-- The staff Food Temp Logs page groups templates by area, so the sections
-- are areas. The old one-list "Temperature Check — AM/PM" (service fridge,
-- grill fridge, pastry fridge and freezer, walk-in, coolroom, kitchen
-- freezer, milk fridge) is switched off, not deleted: its runs stay in the
-- reports and it can be turned back on in the admin app. Its pastry and
-- milk fridge readings move to the new Pastry and FOH lists.
--
-- Pastry and FOH units are a first pass for Jess and Georgia to adjust in
-- the admin app; Jose named only the kitchen ones. Every other Beach House
-- food safety list (deliveries, pest, date labels, cooling) goes under
-- Kitchen. Safe to re-apply: templates are created only when missing.

DO $$
DECLARE
  tid text;
BEGIN
  -- Old one-list kitchen temp checks off.
  UPDATE "ChecklistTemplate"
     SET "isActive" = false, "updatedAt" = now()
   WHERE venue = 'BEACH_HOUSE' AND "isActive"
     AND name IN ('Temperature Check — AM', 'Temperature Check — PM',
                  'Cold storage temps — Opening', 'Cold storage temps — Midday', 'Cold storage temps — Close');

  -- Existing food safety lists into a section.
  UPDATE "ChecklistTemplate" SET area = 'Pastry', "updatedAt" = now()
   WHERE venue = 'BEACH_HOUSE' AND ("isFoodSafety" OR area = 'Food Safety')
     AND (name ILIKE '%pastry%') AND COALESCE(area, '') <> 'Pastry';
  UPDATE "ChecklistTemplate" SET area = 'FOH', "updatedAt" = now()
   WHERE venue = 'BEACH_HOUSE' AND ("isFoodSafety" OR area = 'Food Safety')
     AND (name ILIKE '%FOH%' OR name ILIKE '%barista%' OR name ILIKE '%front of house%' OR COALESCE(area, '') ILIKE 'FOH%')
     AND COALESCE(area, '') <> 'FOH';
  UPDATE "ChecklistTemplate" SET area = 'Kitchen', "updatedAt" = now()
   WHERE venue = 'BEACH_HOUSE' AND ("isFoodSafety" OR area = 'Food Safety')
     AND COALESCE(area, '') NOT IN ('Kitchen', 'Pastry', 'FOH');

  -- Kitchen, Restaurant side.
  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BEACH_HOUSE' AND name = 'Restaurant — Temperature Check AM') THEN
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'Restaurant — Temperature Check AM', 'Kitchen', 'BEACH_HOUSE', 'DAILY', 'OPEN', true, 10, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Pass fridge — temperature check', 'Must be ≤5°C. Check at product level near the door (warmest point).', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Grill fridge — temperature check', 'Must be ≤5°C. Check at product level.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Back prep fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 3, 'Freezer room — temperature check', 'Must be ≤-18°C and everything hard frozen.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 4, 'Cool room — temperature check', 'Must be ≤5°C. Check the door seal and clear any spills.', true, true, false, now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BEACH_HOUSE' AND name = 'Restaurant — Temperature Check PM') THEN
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'Restaurant — Temperature Check PM', 'Kitchen', 'BEACH_HOUSE', 'DAILY', 'MID', true, 15, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Pass fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Grill fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Back prep fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 3, 'Freezer room — temperature check', 'Must be ≤-18°C and everything hard frozen.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 4, 'Cool room — temperature check', 'Must be ≤5°C.', true, true, false, now(), now());
  END IF;

  -- Kitchen, Café side.
  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BEACH_HOUSE' AND name = 'Café — Temperature Check AM') THEN
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'Café — Temperature Check AM', 'Kitchen', 'BEACH_HOUSE', 'DAILY', 'OPEN', true, 10, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Larder fridge — temperature check', 'Must be ≤5°C. Check at product level near the door (warmest point).', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Grill fridge — temperature check', 'Must be ≤5°C. Check at product level.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Main cool room — temperature check', 'Must be ≤5°C. Check the door seal and clear any spills.', true, true, false, now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BEACH_HOUSE' AND name = 'Café — Temperature Check PM') THEN
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'Café — Temperature Check PM', 'Kitchen', 'BEACH_HOUSE', 'DAILY', 'MID', true, 15, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Larder fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Grill fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Main cool room — temperature check', 'Must be ≤5°C.', true, true, false, now(), now());
  END IF;

  -- Pastry (first pass for Jess; the old list's pastry fridge and freezer).
  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BEACH_HOUSE' AND area = 'Pastry' AND "isFoodSafety" AND "isActive") THEN
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'Pastry — Temperature Check AM', 'Pastry', 'BEACH_HOUSE', 'DAILY', 'OPEN', true, 10, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Pastry fridge — temperature check', 'Must be ≤5°C. Check at product level.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Pastry freezer — temperature check', 'Must be ≤-18°C and everything hard frozen.', true, true, false, now(), now());
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'Pastry — Temperature Check PM', 'Pastry', 'BEACH_HOUSE', 'DAILY', 'MID', true, 15, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Pastry fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Pastry freezer — temperature check', 'Must be ≤-18°C and everything hard frozen.', true, true, false, now(), now());
  END IF;

  -- FOH (first pass for Georgia; the old list's milk fridge plus the display and bar fridges).
  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BEACH_HOUSE' AND area = 'FOH' AND "isFoodSafety" AND "isActive") THEN
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'FOH — Temperature Check AM', 'FOH', 'BEACH_HOUSE', 'DAILY', 'OPEN', true, 10, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Milk fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Display fridge — temperature check', 'Must be ≤5°C. Check at product level.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Bar fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now());
    INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'FOH — Temperature Check PM', 'FOH', 'BEACH_HOUSE', 'DAILY', 'MID', true, 15, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt") VALUES
      (gen_random_uuid()::text, tid, 0, 'Milk fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Display fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Bar fridge — temperature check', 'Must be ≤5°C.', true, true, false, now(), now());
  END IF;
END $$;
