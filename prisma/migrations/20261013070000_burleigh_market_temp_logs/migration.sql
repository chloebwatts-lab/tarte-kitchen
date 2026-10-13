-- Burleigh's Market station has no temperature logs of its own (Vini, Burleigh
-- Management WhatsApp, 13 Oct 2026). The main kitchen's AM and PM checks cover
-- the cool room, dairy fridge, pastry cabinet, prep fridge and pie warmer; the
-- Market's cool room, fruit, acai and alcohol fridges and its two freezers were
-- never on any list. Two new Food Temp Logs under the Market area, mirroring
-- the main kitchen's AM (open, by 10 am) and PM (mid shift, by 3 pm) checks.
-- Units are the ones on the maintenance register for Market Kitchen and the
-- juice bar (docs/maintenance/maintainx-assets.md).
--
-- Runs with the migrations on deploy. ChecklistTemplate has no unique key on
-- (venue, name), so each template is only created when Burleigh does not
-- already have one by that name; a re-apply is a no-op.

DO $$
DECLARE
  tid text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BURLEIGH' AND name = 'Market — Temperature Check AM') THEN
    INSERT INTO "ChecklistTemplate"
      (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, 'Market — Temperature Check AM', 'Market', 'BURLEIGH', 'DAILY', 'OPEN', true, 10, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem"
      (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, tid, 0, 'Market cool room — temperature check',
        'Walk-in cool room. Use the wall thermometer or a calibrated probe. Must be ≤5°C. If above range, move stock to another fridge, note what was discarded and report it on the maintenance page.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Fruit fridge — temperature check',
        'Three door prep chiller. Must be ≤5°C. Check at product level near the doors (warmest point).',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Acai fridge — temperature check',
        'Must be ≤5°C. If above range, move the acai to the cool room and note it.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 3, 'Alcohol fridge — temperature check',
        'Back bar cooler. Must be ≤5°C.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 4, 'Frozen fruit freezer — temperature check',
        'Must be ≤-18°C and everything hard frozen. If it is thawing, move stock to the juice bar freezer and report it.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 5, 'Juice bar prep freezer — temperature check',
        'Must be ≤-18°C and everything hard frozen.',
        true, true, false, now(), now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = 'BURLEIGH' AND name = 'Market — Temperature Check PM') THEN
    INSERT INTO "ChecklistTemplate"
      (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, 'Market — Temperature Check PM', 'Market', 'BURLEIGH', 'DAILY', 'MID', true, 15, true, now(), now())
    RETURNING id INTO tid;
    INSERT INTO "ChecklistTemplateItem"
      (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, tid, 0, 'Market cool room — temperature check',
        'Must be ≤5°C. If above range, move stock, note what was discarded and report it.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 1, 'Fruit fridge — temperature check',
        'Must be ≤5°C. Check at product level.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 2, 'Acai fridge — temperature check',
        'Must be ≤5°C.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 3, 'Alcohol fridge — temperature check',
        'Must be ≤5°C.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 4, 'Frozen fruit freezer — temperature check',
        'Must be ≤-18°C and everything hard frozen.',
        true, true, false, now(), now()),
      (gen_random_uuid()::text, tid, 5, 'Juice bar prep freezer — temperature check',
        'Must be ≤-18°C and everything hard frozen.',
        true, true, false, now(), now());
  END IF;
END $$;
