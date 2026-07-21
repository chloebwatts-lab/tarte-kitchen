-- Retired checklist items keep their run history but are excluded from new runs.
ALTER TABLE "ChecklistTemplateItem" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
