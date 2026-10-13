-- Chloe, 13 Oct 2026: Georgia, Savannah and Chloe's own staff sign in could
-- not open the Managers area. Their Shifts roles sit below Supervisor, so
-- the tier gate refused them, the same as Jess last night. Burleigh managers:
-- Manager. Savannah stays on the managers quiet list (11 Oct), which hides
-- the commercial pages inside. Same shape as 20261012060000: merged into the
-- existing override row, and a later edit from the app wins (keys are only
-- added when absent).
UPDATE "AppSetting"
SET "value" = (
  '{
    "Georgia Farquhar": "MANAGER", "Georgia": "MANAGER",
    "Savannah Hjorth": "MANAGER", "Savannah": "MANAGER", "Sav": "MANAGER",
    "Chloe Johns": "MANAGER", "Chloe": "MANAGER"
  }'::jsonb || "value"::jsonb
)::text,
"updatedAt" = NOW()
WHERE "key" = 'tierOverrides';

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('tierOverrides', '{
  "Georgia Farquhar": "MANAGER", "Georgia": "MANAGER",
  "Savannah Hjorth": "MANAGER", "Savannah": "MANAGER", "Sav": "MANAGER",
  "Chloe Johns": "MANAGER", "Chloe": "MANAGER"
}', NOW())
ON CONFLICT ("key") DO NOTHING;
