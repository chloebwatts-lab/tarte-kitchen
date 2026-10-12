-- Chloe, 12 Oct 2026, after the first day of tiers.
--
-- 1. Tier overrides. Tarte Shifts roles are the base; these entries raise the
--    named people to Senior in the app now, without waiting on Shifts edits.
--    A single word matches a first name, a full name matches exactly
--    (src/lib/access/match.ts). Seeded once; later edits are never overwritten.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('tierOverrides', '{
  "Lacey Corby": "SENIOR",
  "Lacey": "SENIOR",
  "Ana": "SENIOR",
  "Carmen": "SENIOR",
  "Lola": "SENIOR",
  "Michelle Malbog": "SENIOR",
  "Michelle": "SENIOR",
  "Julian Mauricio": "SENIOR",
  "Julian": "SENIOR",
  "Cande": "SENIOR",
  "Candela": "SENIOR",
  "Candelaria": "SENIOR",
  "Debbie Embalsado": "SENIOR",
  "Debbie": "SENIOR",
  "Tais Mansur": "SENIOR",
  "Tais": "SENIOR",
  "Gab": "SENIOR",
  "Gabriel": "SENIOR",
  "Gabriela": "SENIOR",
  "Gabriella": "SENIOR",
  "Gabrielle": "SENIOR",
  "Vinicius": "MANAGER",
  "Vini": "MANAGER"
}', NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Copy-quiet list: Senior for running shifts, with the order sheet,
--    portions, high tea and functions, but not the supplier map (where to
--    buy, serves, price check, preferred supplier lookup). See
--    src/lib/manager-quiet.ts COPY_QUIET_PREFIXES.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('copyQuietStaff', '["Cande", "Candela", "Candelaria"]', NOW())
ON CONFLICT ("key") DO NOTHING;

-- 3. Jazz has left: off the Burleigh team list (Jobs board columns, Morning
--    board owners). Kept, inactive, so history still names her.
UPDATE "VenueTeamMember" SET "isActive" = false, "updatedAt" = NOW()
WHERE "venue" = 'BURLEIGH' AND "name" = 'Jazz' AND "isActive" = true;
