-- Prep requests carry the day and time the station needs the item by.
ALTER TABLE "RestockLine" ADD COLUMN "neededBy" TIMESTAMP(3);
