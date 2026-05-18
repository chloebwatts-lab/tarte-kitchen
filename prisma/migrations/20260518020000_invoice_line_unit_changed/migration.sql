-- Distinguish two outcomes when an invoice price differs from the stored
-- ingredient price:
--   priceChanged = true  → like-for-like, safe to apply
--   unitChanged  = true  → pack/unit differs, must confirm conversion first
--                          (suggestedConversionFactor may pre-fill from
--                           a regex parse of the line description, e.g.
--                           "Kale Carton 5kg" → 5)
ALTER TABLE "InvoiceLineItem"
  ADD COLUMN "unitChanged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suggestedConversionFactor" DECIMAL(12, 6);

-- Retroactively clean up: any existing priceChanged row whose invoice unit
-- doesn't match the ingredient's purchase unit was almost certainly a
-- spurious flag (the kale +1654% case). Unflag them so they don't sit in
-- the alert queue waiting to be mis-applied. Zero-priced rows likewise.
UPDATE "InvoiceLineItem" li
SET "priceChanged" = false
FROM "Ingredient" i
WHERE li."ingredientId" = i.id
  AND li."priceChanged" = true
  AND li."priceApproved" IS NULL
  AND (
    li."unitPrice" IS NULL
    OR li."unitPrice" <= 0
    OR LOWER(TRIM(COALESCE(li."unit", ''))) <> LOWER(TRIM(i."purchaseUnit"))
  );
