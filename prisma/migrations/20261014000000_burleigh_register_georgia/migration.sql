-- Georgia's maintenance register tidy, Burleigh (WhatsApp, 13 Oct 2026):
-- three machines no longer on site come off the staff fix page, four that
-- were never registered go on with the next B-numbers so stickers can be
-- printed from /maintenance/labels.
--
-- Off: retired, not deleted. Retired rows keep their work-order history and
-- stay visible under "show retired" on /maintenance; the fix page only lists
-- ACTIVE machines. Matched on the MaintainX id they were migrated with, with
-- the serial as a fallback for rows re-created by hand.
--
-- On: Georgia sent data-plate photos. Where she did not say which room,
-- location is "To confirm" (the quick-add page's own placeholder, hidden from
-- the location picker) and needsReview is set so the row shows up for
-- checking on /maintenance. Each is only inserted once: by serial where the
-- plate had one, by name otherwise.

DO $$
DECLARE
  n int;
  next_slug text;
  retire_note text := 'Retired 13 Oct 2026 (Georgia): no longer on site.';
BEGIN
  -- ── Off ─────────────────────────────────────────────────────────────────
  UPDATE "MaintenanceAsset"
     SET status = 'RETIRED', "retiredAt" = now(), "updatedAt" = now(),
         notes = concat_ws(' ', retire_note, notes)
   WHERE venue = 'BURLEIGH' AND status = 'ACTIVE'
     AND (
       "mxId" = '10854601'                                   -- Anvil retail drinks fridge, FOH (B44)
       OR "mxId" = '12412010' OR serial = 'J00936H'          -- Hoshizaki KM-55B ice machine, coffee
       OR "mxId" = '10869248' OR serial = '2020D0025527'     -- Unox XEVC-0511-GPRM (small), Takeaway
     );

  -- ── On ──────────────────────────────────────────────────────────────────
  -- Next free B-number, the same rule as nextAssetSlug(): highest numeric
  -- suffix of any B slug, plus one, two digits minimum.
  SELECT COALESCE(MAX(substring(slug from 2)::int), 0) INTO n
    FROM "MaintenanceAsset" WHERE slug ~ '^B[0-9]+$';

  IF NOT EXISTS (SELECT 1 FROM "MaintenanceAsset" WHERE venue = 'BURLEIGH' AND serial = 'KU183E9009') THEN
    n := n + 1; next_slug := 'B' || lpad(n::text, 2, '0');
    INSERT INTO "MaintenanceAsset"
      (id, slug, venue, location, name, aliases, category, status, source, "needsReview", "addedBy",
       manufacturer, model, serial, supplier, "warrantyNotes", notes, "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, next_slug, 'BURLEIGH', 'To confirm',
       'Turbo Air 3 door underbench fridge', ARRAY['three door fridge', 'underbench fridge', 'KUR18-3'],
       'refrigeration', 'ACTIVE', 'manual', true, 'Georgia (WhatsApp, 13 Oct 2026)',
       'Turbo Air', 'KUR18-3', 'KU183E9009', 'Kitchen Knock Pty Ltd',
       'Imported and distributed by Kitchen Knock Pty Ltd, sales and service 02 9648 2805 (sticker on the unit).',
       'Three door underbench fridge in the kitchen with the fryer. Photo from Georgia 13 Oct 2026; confirm which room.',
       now(), now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "MaintenanceAsset" WHERE venue = 'BURLEIGH' AND model = 'KUR18-3D-6-N') THEN
    n := n + 1; next_slug := 'B' || lpad(n::text, 2, '0');
    INSERT INTO "MaintenanceAsset"
      (id, slug, venue, location, name, aliases, category, status, source, "needsReview", "addedBy",
       manufacturer, model, serial, supplier, "warrantyNotes", notes, "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, next_slug, 'BURLEIGH', 'To confirm',
       'Turbo Air drawer fridge (1 door, 6 drawers)', ARRAY['drawer fridge', 'underbench drawers', 'KUR18-3D-6-N'],
       'refrigeration', 'ACTIVE', 'manual', true, 'Georgia (WhatsApp, 13 Oct 2026)',
       'Turbo Air', 'KUR18-3D-6-N', NULL, 'Turbo Air Pty Ltd',
       'Imported and distributed by Turbo Air Pty Ltd, sales and service number on the sticker on the unit (02 9737 ...).',
       'Underbench fridge with one door and six drawers, prep bench on top. Serial on the barcode sticker starts H2KU18, read the rest on site. Photo from Georgia 13 Oct 2026; confirm which room.',
       now(), now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "MaintenanceAsset" WHERE venue = 'BURLEIGH' AND name = 'Vacuum packing machine') THEN
    n := n + 1; next_slug := 'B' || lpad(n::text, 2, '0');
    INSERT INTO "MaintenanceAsset"
      (id, slug, venue, location, name, aliases, category, status, source, "needsReview", "addedBy",
       manufacturer, model, serial, supplier, "warrantyNotes", notes, "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, next_slug, 'BURLEIGH', 'To confirm',
       'Vacuum packing machine', ARRAY['vacuum sealer', 'vac pac', 'cryovac'],
       'other', 'ACTIVE', 'manual', true, 'Georgia (WhatsApp, 13 Oct 2026)',
       NULL, 'DZ-400-2E / DZ-400-2F (per the operation guide on the unit)', NULL, NULL,
       NULL,
       'Chamber vacuum sealer on a wheeled stainless stand. Operation guide on the side gives sealing times per bag type. Photo from Georgia 13 Oct 2026; confirm which room and read the data plate.',
       now(), now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "MaintenanceAsset" WHERE venue = 'BURLEIGH' AND name = 'Hisense chest freezer (outside)') THEN
    n := n + 1; next_slug := 'B' || lpad(n::text, 2, '0');
    INSERT INTO "MaintenanceAsset"
      (id, slug, venue, location, name, aliases, category, status, source, "needsReview", "addedBy",
       manufacturer, model, serial, supplier, "warrantyNotes", notes, "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, next_slug, 'BURLEIGH', 'Outside / back',
       'Hisense chest freezer (outside)', ARRAY['chest freezer', 'white freezer', 'outside freezer'],
       'freezer', 'ACTIVE', 'manual', true, 'Georgia (WhatsApp, 13 Oct 2026)',
       'Hisense', NULL, NULL, NULL,
       NULL,
       'White chest freezer against the back wall under the Onsen 26 hot water unit. Photo from Georgia 13 Oct 2026; read the model and serial off the plate.',
       now(), now());
  END IF;
END $$;
