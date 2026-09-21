-- Pastry area in the Cleaning section, at both venues (asked in the Burleigh
-- Management chat, 2026-09-22). Three checklists per venue:
--
--   Daily    fridge, cookie machine, lamination machine
--   Weekly   ovens, cold room, dry storage
--   Monthly  pastry room freezer, main kitchen freezer, pastry racks with KP
--
-- Runs with the migrations on deploy, so nobody has to run a script by hand.
-- ChecklistTemplate has no unique key on (venue, name), so each template is
-- only created when that venue does not already have one by that name. A
-- re-apply, or a template a manager already made by hand, is left alone.
--
-- Daily is a close-of-day list due by 4 pm, like every other daily clean.
-- Weekly and monthly stay open all cycle (shift ANY), like KP's.

DO $$
DECLARE
  v text;
  tid text;
BEGIN
  FOREACH v IN ARRAY ARRAY['BURLEIGH', 'BEACH_HOUSE'] LOOP

    -- Daily
    IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = v::"Venue" AND name = 'Pastry — Daily Clean') THEN
      INSERT INTO "ChecklistTemplate"
        (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid()::text, 'Pastry — Daily Clean', 'Pastry', v::"Venue", 'DAILY', 'CLOSE', false, 16, true, now(), now())
      RETURNING id INTO tid;
      INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "createdAt", "updatedAt") VALUES
        (gen_random_uuid()::text, tid, 0, 'Clean pastry fridge',
          'Wipe shelves, door, handle and seals with hot soapy water then sanitiser. Check everything inside is wrapped, labelled and dated.', now(), now()),
        (gen_random_uuid()::text, tid, 1, 'Clean cookie machine',
          'Remove and wash the hopper and depositing parts. Wipe down the body and the bench underneath.', now(), now()),
        (gen_random_uuid()::text, tid, 2, 'Clean lamination machine',
          'Brush all flour off the belts and rollers, then wipe down the belts, scrapers and frame. Never hose the motor.', now(), now());
    END IF;

    -- Weekly
    IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = v::"Venue" AND name = 'Pastry — Weekly Deep Clean') THEN
      INSERT INTO "ChecklistTemplate"
        (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid()::text, 'Pastry — Weekly Deep Clean', 'Pastry', v::"Venue", 'WEEKLY', 'ANY', false, NULL, true, now(), now())
      RETURNING id INTO tid;
      INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "createdAt", "updatedAt") VALUES
        (gen_random_uuid()::text, tid, 0, 'Deep clean ovens',
          'Interior, door glass, seals and racks. Wipe down the exterior and controls.', now(), now()),
        (gen_random_uuid()::text, tid, 1, 'Clean cold room',
          'Rotate stock, clear the shelves, wash and sanitise shelves, walls, floor and door seals.', now(), now()),
        (gen_random_uuid()::text, tid, 2, 'Clean dry storage',
          'Clear and wipe the shelves, check dates, rotate stock and sweep and mop the floor.', now(), now());
    END IF;

    -- Monthly
    IF NOT EXISTS (SELECT 1 FROM "ChecklistTemplate" WHERE venue = v::"Venue" AND name = 'Pastry — Monthly Deep Clean') THEN
      INSERT INTO "ChecklistTemplate"
        (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid()::text, 'Pastry — Monthly Deep Clean', 'Pastry', v::"Venue", 'MONTHLY', 'ANY', false, NULL, true, now(), now())
      RETURNING id INTO tid;
      INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "createdAt", "updatedAt") VALUES
        (gen_random_uuid()::text, tid, 0, 'Deep clean pastry room freezer',
          'Move stock to another freezer, defrost if iced up, wash and sanitise the inside, shelves and door seals.', now(), now()),
        (gen_random_uuid()::text, tid, 1, 'Deep clean main kitchen freezer',
          'Move stock to another freezer, defrost if iced up, wash and sanitise the inside, shelves and door seals.', now(), now()),
        (gen_random_uuid()::text, tid, 2, 'Organise with KP to clean pastry racks',
          'Agree a time with the KP, then wash and sanitise every rack and tray and let them dry fully before restacking.', now(), now());
    END IF;

  END LOOP;
END $$;
