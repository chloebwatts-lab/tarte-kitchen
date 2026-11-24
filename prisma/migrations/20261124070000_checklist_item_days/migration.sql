-- Checklist lines that only apply on some days, plus a section heading
-- (Currumbin cafe opening and closing sheets, 24 Nov 2026). Additive only.
ALTER TABLE "ChecklistTemplateItem" ADD COLUMN "section" TEXT;
ALTER TABLE "ChecklistTemplateItem" ADD COLUMN "days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "ChecklistTemplateItem" ADD COLUMN "alsoOnPublicHolidays" BOOLEAN NOT NULL DEFAULT false;
