-- Seed Shawna's six compliance jobs as scheduled board items and
-- responsibility areas. Runs once with the migrations on deploy, so nobody
-- has to run a script by hand. ON CONFLICT keeps it safe to re-apply.
--
-- nextDueAt is today on purpose: all six surface on the first board load so
-- Shawna can correct the real dates one by one.

INSERT INTO "VenueTaskSchedule"
  ("id","venue","category","title","detail","defaultOwner","everyMonths","leadDays","nextDueAt","updatedAt")
VALUES
  (gen_random_uuid()::text,'BURLEIGH','BUILDING',
   'Fire extinguisher and fire blanket tag dates',
   'Annual tagging. Needs a contractor booked, so it surfaces a month out. Due date is a placeholder, Shawna to confirm when this was last done and correct it.',
   'Shawna',12,30,CURRENT_DATE,now()),
  (gen_random_uuid()::text,'BURLEIGH','BUILDING',
   'Test and tag electrical gear',
   'Annual. Needs a contractor booked. Due date is a placeholder, Shawna to confirm when this was last done and correct it.',
   'Shawna',12,30,CURRENT_DATE,now()),
  (gen_random_uuid()::text,'BURLEIGH','BUILDING',
   'Book pest control and file the report',
   'Quarterly. The report gets filed, Georgia holds the forms. Due date is a placeholder, Shawna to confirm and correct it.',
   'Shawna',3,21,CURRENT_DATE,now()),
  (gen_random_uuid()::text,'BURLEIGH','MISC',
   'Restock the first aid kit',
   'Quarterly check and restock. Due date is a placeholder, Shawna to confirm and correct it.',
   'Shawna',3,14,CURRENT_DATE,now()),
  (gen_random_uuid()::text,'BURLEIGH','MISC',
   'Review allergen info against the current menu',
   'Backstop only. The real trigger is any menu or recipe change. Due date is a placeholder, Shawna to confirm and correct it.',
   'Shawna',3,7,CURRENT_DATE,now()),
  (gen_random_uuid()::text,'BURLEIGH','CLEANING',
   'Deep cleans with no schedule (extraction filters, ice machine, grinder)',
   'Monthly. Due date is a placeholder, Shawna to confirm and correct it.',
   'Shawna',1,7,CURRENT_DATE,now())
ON CONFLICT ("venue","title") DO NOTHING;

INSERT INTO "ResponsibilityArea"
  ("id","venue","name","description","ownerName","youDecide","youAsk","toTakeThisOn","updatedAt")
VALUES
  (gen_random_uuid()::text,'BURLEIGH','Fire and electrical compliance',
   'Extinguisher and blanket tagging, test and tag.',
   'Shawna','Nothing. Book through Shawna.',
   'Anything that looks out of date, tell Shawna the same day.',
   'Know the tagging cycle, who the contractor is, and where the certificates are filed.',now()),
  (gen_random_uuid()::text,'BURLEIGH','Pest control',
   'Booking the visits and filing the report.',
   'Shawna','Nothing. Report sightings to Shawna or Georgia immediately.',
   'Any sighting, any time. Never wait for the next visit.',
   'Know the provider, the schedule, and where reports are kept.',now()),
  (gen_random_uuid()::text,'BURLEIGH','First aid',
   'Kit contents and restocking.',
   'Shawna','Use what you need from the kit, that is what it is for.',
   'Tell Shawna when you use the last of something.',
   'Know the required contents list and the supplier.',now()),
  (gen_random_uuid()::text,'BURLEIGH','Allergen information',
   'Keeping allergen data current when menus or recipes change.',
   'Shawna','Nothing. Never tell a guest an item is free from something unless Tarte Kitchen says so.',
   'Any menu or recipe change goes to Shawna before it reaches a guest.',
   'Understand the ingredient assessment flow and why an unassessed ingredient blocks a free-from claim.',now()),
  (gen_random_uuid()::text,'BURLEIGH','Scheduled deep cleans',
   'Extraction filters, ice machine, coffee grinder burrs.',
   'Shawna','Nothing scheduled. Normal cleaning is per your section.',
   'Tell Shawna if one of these looks overdue.',
   'Know the cycle for each machine and how each is cleaned.',now())
ON CONFLICT ("venue","name") DO NOTHING;
