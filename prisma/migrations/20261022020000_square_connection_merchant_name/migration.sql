-- One SquareConnection row per Square account (Currumbin and Burleigh are
-- separate Square accounts, one per legal entity). The business name shows
-- which account a row is.
ALTER TABLE "SquareConnection" ADD COLUMN "merchantName" TEXT;
