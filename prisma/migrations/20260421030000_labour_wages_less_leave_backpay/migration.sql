-- "Total less leave, toil, backpay" row from the Mge PDF (admin still in).
-- Complements grossWagesExAdminLeaveBackpay, which excludes admin too.
ALTER TABLE "LabourWeekActual"
  ADD COLUMN "grossWagesLessLeaveBackpay" DECIMAL(10,2);
