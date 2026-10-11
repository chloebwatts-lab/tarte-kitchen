-- Managers quiet list (Chloe, 11 Oct 2026). People named here still unlock
-- the managers area and keep the operational tools, but the commercial pages
-- (sales, supplier prices, meeting agenda) and yesterday's take on the
-- line-up are withheld. See src/lib/manager-quiet.ts. Seeded once; later
-- edits to the row are never overwritten by a redeploy.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('managerQuietStaff', '["Savannah Hjorth"]', NOW())
ON CONFLICT ("key") DO NOTHING;
