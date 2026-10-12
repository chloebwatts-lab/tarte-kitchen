-- Chloe, 12 Oct 2026 (evening): Jess could not open the Managers area. Her
-- Shifts role sits below Manager, so the tier gate refused her. Head of
-- pastry: Manager. Merged into the existing override row (the seed used
-- ON CONFLICT DO NOTHING, so a plain insert would not reach it). A later
-- edit from the app wins: this only adds the two keys if absent.
UPDATE "AppSetting"
SET "value" = (
  '{"Jess Passos": "MANAGER", "Jessica Passos": "MANAGER"}'::jsonb || "value"::jsonb
)::text,
"updatedAt" = NOW()
WHERE "key" = 'tierOverrides';

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('tierOverrides', '{"Jess Passos": "MANAGER", "Jessica Passos": "MANAGER"}', NOW())
ON CONFLICT ("key") DO NOTHING;
