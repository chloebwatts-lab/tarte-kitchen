-- Chloe, 13 Oct 2026 (afternoon): the full list, replacing the 12 and 13 Oct
-- entries. Overrides only ever raise someone above their Shifts role, so a
-- name not here falls back to whatever Shifts says. A single word matches a
-- first name, a full name matches exactly (src/lib/access/match.ts).
--
-- Managers: Chloe Johns, Georgia Rodney, Jose, Shawna, Jess Le Rose, Georgia
-- Farquhar, Savannah (still on the managers quiet list, 11 Oct), Oliver
-- Warren, Vini. Jess Passos (head of pastry, 12 Oct evening) kept.
-- Seniors, Currumbin: Carmen Taylor, Anastasia, Ava, Debbie.
-- Seniors, Burleigh: Lacey, Tais, Gabrielle (chef).
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('tierOverrides', '{
  "Chloe Johns": "MANAGER", "Chloe": "MANAGER",
  "Georgia Rodney": "MANAGER",
  "Georgia Farquhar": "MANAGER",
  "Georgia": "MANAGER",
  "Jose": "MANAGER",
  "Shawna": "MANAGER",
  "Jess Le Rose": "MANAGER", "Jessica Le Rose": "MANAGER",
  "Jess Passos": "MANAGER", "Jessica Passos": "MANAGER",
  "Jess": "MANAGER", "Jessica": "MANAGER",
  "Savannah Hjorth": "MANAGER", "Savannah": "MANAGER", "Sav": "MANAGER",
  "Oliver Warren": "MANAGER", "Oliver": "MANAGER",
  "Vinicius": "MANAGER", "Vini": "MANAGER",
  "Carmen Taylor": "SENIOR", "Carmen": "SENIOR",
  "Anastasia": "SENIOR", "Anastasija": "SENIOR", "Ana": "SENIOR",
  "Ava": "SENIOR",
  "Debbie Embalsado": "SENIOR", "Debbie": "SENIOR",
  "Lacey Corby": "SENIOR", "Lacey": "SENIOR",
  "Tais Mansur": "SENIOR", "Tais": "SENIOR",
  "Gabrielle": "SENIOR", "Gabriela": "SENIOR", "Gabriella": "SENIOR", "Gab": "SENIOR"
}', NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();
