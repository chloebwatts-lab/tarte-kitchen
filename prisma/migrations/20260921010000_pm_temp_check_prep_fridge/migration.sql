-- Burleigh's "Temperature Check — PM" is missing the prep/ingredient fridge
-- that the AM check has (Vini, Burleigh Management chat, 2026-09-20).
-- Copy the AM item onto the PM list, wording and capture rules included, so
-- the two stay in step. Falls back to the seed wording if the AM item has
-- gone. Nothing happens when PM already has it, so this is safe to re-apply.

DO $$
DECLARE
  pm_id text;
  am_id text;
  am_item record;
BEGIN
  SELECT id INTO pm_id FROM "ChecklistTemplate"
   WHERE venue = 'BURLEIGH' AND name = 'Temperature Check — PM' AND "isActive";
  IF pm_id IS NULL THEN
    RAISE NOTICE 'No Burleigh "Temperature Check — PM" template, nothing to add';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM "ChecklistTemplateItem"
              WHERE "templateId" = pm_id AND NOT archived
                AND label ILIKE 'Prep/ingredient fridge%') THEN
    RETURN;
  END IF;

  SELECT id INTO am_id FROM "ChecklistTemplate"
   WHERE venue = 'BURLEIGH' AND name = 'Temperature Check — AM' AND "isActive";
  IF am_id IS NOT NULL THEN
    SELECT label, instructions, "requireTemp", "requireNote", "hotCheck" INTO am_item
      FROM "ChecklistTemplateItem"
     WHERE "templateId" = am_id AND NOT archived AND label ILIKE 'Prep/ingredient fridge%'
     ORDER BY "sortOrder" LIMIT 1;
  END IF;

  INSERT INTO "ChecklistTemplateItem"
    (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, pm_id, COALESCE(MAX("sortOrder"), -1) + 1,
         COALESCE(am_item.label, 'Prep/ingredient fridge — temperature check'),
         COALESCE(am_item.instructions, 'Must be ≤5°C.'),
         COALESCE(am_item."requireTemp", true),
         COALESCE(am_item."requireNote", true),
         COALESCE(am_item."hotCheck", false),
         now(), now()
    FROM "ChecklistTemplateItem" WHERE "templateId" = pm_id;
END $$;
