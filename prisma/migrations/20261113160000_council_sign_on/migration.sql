-- Council sign-ons (Burleigh roadside dining fee campaign, Nov 2026). Additive only.
CREATE TABLE "CouncilSignOn" (
    "id" TEXT NOT NULL,
    "campaign" TEXT NOT NULL DEFAULT 'roadside-dining-2026',
    "name" TEXT NOT NULL,
    "sortName" TEXT NOT NULL,
    "street" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'seed',
    "unsure" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "owner" TEXT NOT NULL DEFAULT '',
    "permit" TEXT NOT NULL DEFAULT '',
    "worksPct" TEXT NOT NULL DEFAULT '',
    "openedPct" TEXT NOT NULL DEFAULT '',
    "nowPct" TEXT NOT NULL DEFAULT '',
    "setupHours" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "signature" TEXT,
    "signatureUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilSignOn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CouncilSignOnEvent" (
    "id" TEXT NOT NULL,
    "signOnId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouncilSignOnEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CouncilSignOn_campaign_sortName_key" ON "CouncilSignOn"("campaign", "sortName");

CREATE INDEX "CouncilSignOnEvent_signOnId_createdAt_idx" ON "CouncilSignOnEvent"("signOnId", "createdAt");

ALTER TABLE "CouncilSignOnEvent" ADD CONSTRAINT "CouncilSignOnEvent_signOnId_fkey" FOREIGN KEY ("signOnId") REFERENCES "CouncilSignOn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Starting list: 45 Burleigh venues from web listings (13 Nov 2026). None is
-- confirmed to have footpath tables; "unsure" ones show a check tag on the iPad.
INSERT INTO "CouncilSignOn" ("id", "name", "sortName", "street", "unsure", "updatedAt") VALUES
  ('seed-apres-surf', 'Apres Surf', 'apres surf', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-betty-s-burgers', 'Betty''s Burgers', 'betty s burgers', 'Connor St', true, CURRENT_TIMESTAMP),
  ('seed-burleigh-baker', 'Burleigh Baker', 'burleigh baker', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-burleigh-british-chippy', 'Burleigh British Chippy', 'burleigh british chippy', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-burleigh-heads-fishmongers', 'Burleigh Heads Fishmongers', 'burleigh heads fishmongers', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-burleigh-pavilion', 'Burleigh Pavilion', 'burleigh pavilion', 'Goodwin Terrace', true, CURRENT_TIMESTAMP),
  ('seed-canteen-coffee', 'Canteen Coffee', 'canteen coffee', 'Park Ave', false, CURRENT_TIMESTAMP),
  ('seed-canteen-kitchen', 'Canteen Kitchen', 'canteen kitchen', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-choubidou-cafe', 'Choubidou Cafe', 'choubidou cafe', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-commune', 'Commune', 'commune', 'Gold Coast Hwy', false, CURRENT_TIMESTAMP),
  ('seed-costa-taco', 'Costa Taco', 'costa taco', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-crew', 'Crew', 'crew', 'Connor St', false, CURRENT_TIMESTAMP),
  ('seed-crispy-italian-bar', 'Crispy Italian Bar', 'crispy italian bar', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-fletcher-s-pantry-espresso', 'Fletcher''s Pantry & Espresso', 'fletcher s pantry espresso', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-fuel-bakehouse', 'Fuel Bakehouse', 'fuel bakehouse', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-george-s-pizza-wine-bar', 'George''s Pizza Wine Bar', 'george s pizza wine bar', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-globe-cafe', 'Globe Cafe', 'globe cafe', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-golosi-food-emporium', 'Golosi Food Emporium', 'golosi food emporium', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-greenhouse-the-bathhouse', 'Greenhouse The Bathhouse', 'greenhouse the bathhouse', 'The Esplanade', true, CURRENT_TIMESTAMP),
  ('seed-hail-mary', 'Hail Mary', 'hail mary', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-iku-yakitori-bar', 'Iku Yakitori Bar', 'iku yakitori bar', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-jimmy-wah-s', 'Jimmy Wah''s', 'jimmy wah s', 'Gold Coast Hwy', false, CURRENT_TIMESTAMP),
  ('seed-justin-lane', 'Justin Lane', 'justin lane', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-kefi-cafe', 'Kefi Cafe', 'kefi cafe', 'Connor St', true, CURRENT_TIMESTAMP),
  ('seed-kostel-milk-bar', 'Kostel Milk Bar', 'kostel milk bar', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-la-fira', 'La Fira', 'la fira', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-local-burleigh-heads', 'Local Burleigh Heads', 'local burleigh heads', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-magnolia-lane', 'Magnolia Lane', 'magnolia lane', 'Gold Coast Hwy', false, CURRENT_TIMESTAMP),
  ('seed-maman-bar-kitchen', 'Maman Bar & Kitchen', 'maman bar kitchen', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-manny-s-wine-fish', 'Manny''s Wine & Fish', 'manny s wine fish', 'Park Ave', true, CURRENT_TIMESTAMP),
  ('seed-masu-izakaya', 'Masu Izakaya', 'masu izakaya', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-memento', 'Memento', 'memento', 'The Esplanade', true, CURRENT_TIMESTAMP),
  ('seed-mohr', 'Mohr', 'mohr', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-naami', 'Naami', 'naami', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-osteria-del-mare', 'Osteria del Mare', 'osteria del mare', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-palm-springs', 'Palm Springs', 'palm springs', 'Gold Coast Hwy', false, CURRENT_TIMESTAMP),
  ('seed-pantry', 'The Pantry', 'pantry', 'Connor St', false, CURRENT_TIMESTAMP),
  ('seed-piada-co', 'Piada Co', 'piada co', 'James St', true, CURRENT_TIMESTAMP),
  ('seed-quest-burleigh-cafe', 'Quest Burleigh Cafe', 'quest burleigh cafe', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-restaurant-labart', 'Restaurant Labart', 'restaurant labart', 'Park Ave', true, CURRENT_TIMESTAMP),
  ('seed-rick-shores', 'Rick Shores', 'rick shores', 'Goodwin Terrace', true, CURRENT_TIMESTAMP),
  ('seed-seadog', 'Seadog', 'seadog', 'Connor St', false, CURRENT_TIMESTAMP),
  ('seed-social-brew', 'Social Brew', 'social brew', 'James St', false, CURRENT_TIMESTAMP),
  ('seed-t-ang-court', 'T''ang Court', 't ang court', 'Goodwin Terrace', true, CURRENT_TIMESTAMP),
  ('seed-urbanistar-burleigh', 'Urbanistar Burleigh', 'urbanistar burleigh', 'Park Ave', true, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
