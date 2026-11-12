-- Oliver, 12 Nov 2026: add to the Burleigh market / juice bar close
-- (the Market Daily Clean list): wipe down the front marble of the display and the
-- glass above the fruit displays. Goes straight after "Sanitise pass and
-- display marble". Only runs once: skipped if the line is already there.
-- Existing runs keep their own items; new runs pick it up.
DO $$
DECLARE
  tid text;
  after_order int;
BEGIN
  SELECT id INTO tid FROM "ChecklistTemplate"
   WHERE venue = 'BURLEIGH' AND name = 'Market — Daily Clean'
   ORDER BY "createdAt" LIMIT 1;
  IF tid IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM "ChecklistTemplateItem"
              WHERE "templateId" = tid AND label = 'Wipe down front marble of display and glass above fruit displays') THEN
    RETURN;
  END IF;

  SELECT "sortOrder" INTO after_order FROM "ChecklistTemplateItem"
   WHERE "templateId" = tid AND label = 'Sanitise pass and display marble' AND NOT archived
   LIMIT 1;
  IF after_order IS NULL THEN
    SELECT COALESCE(MAX("sortOrder"), -1) INTO after_order FROM "ChecklistTemplateItem" WHERE "templateId" = tid;
  ELSE
    UPDATE "ChecklistTemplateItem" SET "sortOrder" = "sortOrder" + 1, "updatedAt" = now()
     WHERE "templateId" = tid AND "sortOrder" > after_order;
  END IF;

  INSERT INTO "ChecklistTemplateItem"
    (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", archived, "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid()::text, tid, after_order + 1,
     'Wipe down front marble of display and glass above fruit displays',
     'Front face of the marble display, then the glass above the fruit displays. Streak free.',
     false, false, false, false, now(), now());
END $$;
