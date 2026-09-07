# Pricing rebuild

Status: branch `claude/price-alerts-rebuild` (September 2026), cut from
the audit branch. Runs beside the v1 line flags and the v2 `PriceAlert`
table, reads the same invoice lines, writes only its own tables. The new
screen is at `/pricing` ("Price Alerts (new)" in the sidebar); the old
pages stay until cutover.

## Why a rebuild and not another fix

The price-increase pipeline has been patched eleven times since March.
Each patch was correct, and the next bug still arrived, because the design
lets the same fact live in five places that never agree:

| Where the pack size lives | Used by |
|---|---|
| `Ingredient.purchaseQuantity` + `purchaseUnit` | invoice comparison, alerts, accept |
| `Ingredient.baseUnitsPerPurchase` | recipe costing (the only field recipes read) |
| `Ingredient.gramsPerUnit` | count ingredients used by weight |
| `SupplierItemMapping.conversionFactor` (stored as a reciprocal) | per-line conversion |
| `ApprovedSupplierItem.packSize` (free text) | order forms |

The alert side reasons in `purchasePrice / purchaseQuantity`. Recipe
costing reasons in `purchasePrice / baseUnitsPerPurchase`. Nothing checks
the two describe the same physical quantity. When a supplier moves from a
5 kg bag to a 10 kg bag, the old pipeline converts correctly, scales by the
unchanged `purchaseQuantity`, writes a price that is now for a different
quantity than `baseUnitsPerPurchase` describes, and every recipe using it
is wrong by the pack ratio with a green tick. That is the "always bugs
with pack sizes" family.

Other structural causes, all fixed by design below rather than by patch:

- Conversion factors were stored as reciprocals. A chef answering "one
  carton is 5 kg" got the answer inverted twice on the way through, and
  one inversion bug produced the $6,900/kg oats.
- Pack parsing ran on every invoice line, every time, through five regexes
  in a fixed order. A new label format meant a new regex and a new class
  of ghost alert.
- Two alert systems coexist (`InvoiceLineItem.priceChanged` and
  `PriceAlert`), cross-synced by ingredient id, each with its own accept
  path that computes the new price a different way.
- Engine auto-closes were recorded as chef dismissals and muted real moves
  for 45 days.
- The v2 accept path re-queried the newest line at tap time and could
  apply a number the chef never saw.
- Claude extracts the supplier product code on every line. It was never
  stored.

## Principles

1. One currency. Dollars per base unit of the ingredient (per g, per ml,
   per ea). Recipes already cost in it. Every invoice line is converted
   into it once, at ingest, and nothing downstream touches a unit again.
2. The pack is a property of a supplier product, not of a line. It is one
   positive number: base units in one billed unit. No reciprocals.
3. A human answers one question, once, in plain words: "one BAG of SUGAR
   BROWN 15KG holds how many g?" The parser only pre-fills the answer.
4. Observations are immutable facts. Alerts are computed from them.
   Accepting an alert writes exactly the observation shown.
5. Accepting never touches `purchaseQuantity` or `purchaseUnit`. It writes
   `purchasePrice = pricePerBaseUnit x baseUnitsPerPurchase`, which keeps
   the accepted price and the recipe cost on the same basis by
   construction.
6. Engine decisions and chef decisions are different things and are stored
   as different statuses.

## Data model

`InvoiceLineItem.productCode` (new column). Kept from the extractor.

`SupplierProduct`. One per (supplier, product key). The key is the
supplier's code when printed, else normalised description plus billed
unit, so Bidfood "BUTTER SALTED" as a PAT and as a BLK are two products
with two packs. Carries `packBaseUnits`, how it was learned
(`MEASURE`, `INGREDIENT`, `PARSED`, `CONFIRMED`), a confidence, an
explanation for the UI, and a status: `ACTIVE`, `NEEDS_PACK` (one human
question outstanding) or `REJECTED` (wrong ingredient).

`PriceObservation`. One per invoice line. Effective billed unit price
(line total wins over a discounted printed unit price), pack snapshot,
`pricePerBaseUnit`, base units delivered, and a status: `VALID`,
`SUSPECT` (unconfirmed pack and the implied price is off the reference by
a multiple), `EXCLUDED` (credit note, zero price, no pack). Re-derived only
when a product's pack changes.

`ProductPriceAlert`. One open alert per product (partial unique index).
Points at the exact observation it was computed from. Status `OPEN`,
`ACCEPTED`, `DISMISSED` or `AUTO_CLOSED`, with `resolvedBy` CHEF or
ENGINE.

## Flow

1. Invoice lines are written by the existing processor, as before.
2. `ingestInvoiceObservations(invoiceId)` runs after the write, wrapped so
   it can never fail the invoice. For each line with an ingredient it finds
   or creates the product, resolves the pack on first sight, derives the
   observation, and parks the product as `NEEDS_PACK` if the pack is
   unknown or the observation is suspect.
3. Nightly `compute-product-alerts` evaluates every active product's
   observation history: stable items fire on a 5% move either way against
   the ingredient's current cost per base unit; produce fires when the last
   two deliveries both sit 25% or more above the trailing four-week median.
   Same thresholds as v2, ported unchanged because they were tuned on real
   invoices.
4. A chef accepts or dismisses. Accept rescales `purchasePrice`, logs
   `PriceHistory`, recalculates recipes. Dismiss sticks at that price. An
   engine auto-close never mutes anything.

## Pack resolution order

Per product, once. Trust from top to bottom.

1. Billed unit is a measure in the ingredient's family (a per-kg line on a
   weight ingredient). Exact. If the description advertises a bigger pack
   in the same family ("SUGAR BROWN 15KG BAG" billed as KG), confidence
   drops so the sanity gate decides.
2. Billed unit is a measure in another family and the ingredient has
   grams per unit (per-kg avocados on a count ingredient).
3. Billed unit equals the ingredient's own purchase unit (both say
   "carton"): `baseUnitsPerPurchase / purchaseQuantity`.
4. Description parses to a pack in the right family ("1L x 6", "4 X 6 X
   250ML", "1kg tub x 6", "15dz"). Unconfirmed until a person says so.
5. Nothing usable: `NEEDS_PACK`.

Two guards sit behind that:

The size-change guard: a product already has a pack on file and a new
line for it carries a description that reads as a different pack in the
ingredient's family ("KALE CARTON 5KG" became "KALE CARTON 10KG"). The
observation is parked as suspect and the product asks its question again,
even if the pack had been confirmed. A reworded description with the same
size never re-asks, and a per-kg line is per kg whatever the bag size
says. A change of billed unit on the same product code is a different
product key altogether, so it gets its own pack rather than inheriting
the old one. Those two cases are the ones that used to blow the old
pipeline.

The sanity gate: an unconfirmed pack that is wrong is wrong by a whole
multiple, so the implied price lands far outside anything a real move
produces. Beyond 60% for a parsed pack, 150% for an ingredient-derived
pack, and five times for a measure, the observation is `SUSPECT` and the
product asks its one question. The sanity gate never re-parks a confirmed pack, and a
real doubling on one surfaces as an alert.

## What is on this branch

- `src/lib/pricing/pack.ts`, `observation.ts`, `alerts.ts`: pure engine,
  no database, 34 tests covering every historic bug class (the 15 kg bag
  labelled KG, the 60-pack billed as EA, the Jensens discount line, the
  extractor putting the line total in the unit price, the triple
  multiplier, the bracketed piece grade, engine close versus chef
  dismiss, produce median excluding the delivery under test).
- `src/lib/pricing/service.ts`: ingest, pack confirmation with
  re-derivation, nightly compute, accept, dismiss.
- Prisma models and migration `20260906000000_pricing_rebuild_shadow`.
- Processor hook (stores `productCode`, ingests observations).
- Cron route `/api/cron/compute-product-alerts`, scheduled in
  docker-compose at 10:15 AEST after the v2 compute.
- `scripts/pricing-backfill.ts`: dry run prints the products that would
  need a human answer, `--apply` builds history and prints where the new
  engine and v2 disagree.
- `npm test` runs the engine tests and the existing units regression.
- `/pricing`: the pack-question queue (one row, one number, one button,
  with the implied $/kg shown as you type) and the product alert list
  with per-kg / per-litre / per-each prices, weekly dollar impact and the
  last deliveries. Accept writes exactly the observation shown. Answering
  a pack question reprices that product's whole history and re-evaluates
  alerts immediately.

## Cutover

1. Deploy. Run `npx tsx scripts/pricing-backfill.ts` on the droplet and
   read the dry-run list; it is the whole backlog of pack questions.
   Expect a few dozen, not a thousand.
2. Run with `--apply --days 365`. Read the v2 versus rebuild comparison.
   Every "only in v2" row should be explainable as a ghost; every "only in
   rebuild" row should be a real move v2 was hiding.
3. Use `/pricing` for two weeks alongside the old page. Point the weekly
   digest's price section and the nav badge at `ProductPriceAlert`.
4. Retire in order: stop writing `priceChanged` and `unitChanged` in the
   processor, remove `/suppliers` price alert tab and the v2 page, drop
   `SupplierPrice` (never read anywhere) and `SupplierItemMapping.conversionFactor`.
5. Then the missing last link: a per-category food-cost target on dishes
   and a recommended selling price, so an accepted price has somewhere to
   go.
