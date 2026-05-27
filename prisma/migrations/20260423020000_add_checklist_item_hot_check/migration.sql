-- AlterTable
ALTER TABLE "ChecklistTemplateItem" ADD COLUMN IF NOT EXISTS "hotCheck" BOOLEAN NOT NULL DEFAULT false;
