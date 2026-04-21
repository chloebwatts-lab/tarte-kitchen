-- Rich management-report fields extracted from the weekly Mge PDF.
-- All nullable so historical rows (that only captured gross wages via
-- the CSV upload) remain valid.
ALTER TABLE "LabourWeekActual"
  ADD COLUMN "revenueExGst" DECIMAL(10,2),
  ADD COLUMN "grossWagesExAdmin" DECIMAL(10,2),
  ADD COLUMN "grossWagesExAdminLeaveBackpay" DECIMAL(10,2),
  ADD COLUMN "wagesBarista" DECIMAL(10,2),
  ADD COLUMN "wagesChef" DECIMAL(10,2),
  ADD COLUMN "wagesFoh" DECIMAL(10,2),
  ADD COLUMN "wagesKp" DECIMAL(10,2),
  ADD COLUMN "wagesPastry" DECIMAL(10,2),
  ADD COLUMN "wagesAdmin" DECIMAL(10,2),
  ADD COLUMN "cogsActual" DECIMAL(10,2),
  ADD COLUMN "cogsPct" DECIMAL(5,2);
