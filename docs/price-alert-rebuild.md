# Price-Increase Alert Rebuild — design brief

## Why

Old alert flagged every per-line price diff via `InvoiceLineItem.priceChanged`. Three problems:

1. **Fruit/veg drowned the signal.** Pacific Wholesale + Jensens fluctuate weekly — those alerts crowded out real moves on shelf-stable items.
2. **Unit-mismatch ghosts.** Despite `units.ts/compareUnits` having same_unit/converted/unit_changed states, the alert UI surfaced everything, including the false-positive `unit_changed` rows.
3. **No canonical mapping.** Same product across suppliers (e.g., "American Burger cheese" Bidfood vs "Cheese Slices Burger Hi Melt" Fermex) reads as two unrelated ingredients. Switching supplier silently breaks the price-trend graph.

User accepted on 2026-06-13: cleared the entire 1,910-row unapproved backlog (data preserved, flag wiped) to start fresh.

## What we're building

Two parallel alert streams, both compared **unit-for-unit + canonical-name-for-canonical-name**.

### Stream A — Fruit / Veg (volatile)

- Source: ingredients where `category = 'FRESH_PRODUCE'` OR supplier ∈ {Pacific Wholesale, Jensens, Coastal Fresh, Green Farm, Gold Coast Eggs}.
- Compare against **4-week trailing median** of normalised unit price, not single-invoice prior.
- Flag only if current invoice ≥ 25% above trailing median AND for ≥ 2 consecutive deliveries.
- Output: one-line digest entry per ingredient, sorted by $/week impact (using weekly usage × delta).
- Suppress single-invoice spikes (one-off market move) unless the trend confirms.

### Stream B — Everything else (stable)

- Source: ingredients where category ≠ FRESH_PRODUCE.
- Compare against **last approved price** (`Ingredient.purchasePrice`).
- Flag if same-unit comparison shows ≥ 5% delta either direction (drops matter too — Bidfood items often drop and stay unflagged).
- Group by canonical name so "Cheese Slices Burger Hi Melt 96'S" and "American Burger Cheese 2.5kg" are one row even if chefs switched supplier between invoices.
- One-tap accept applies the new price + writes PriceHistory.

## Schema deltas

1. **`Ingredient.canonicalName`** — already added 2026-06-13. Populated by deterministic strip (brand, pack, packaging) + sorted-tokens. Used as the join key across supplier rows.
2. **`Ingredient.category`** — `IngredientCategory` enum already exists but unused. Backfill needed (0/682 set today). First pass: rules-based by supplier + keyword (lettuce/onion/tomato/etc → FRESH_PRODUCE).
3. **`PriceAlert`** new table — replaces `InvoiceLineItem.priceChanged` as alert state, decoupling alert lifecycle from invoice rows. Fields: `id, canonicalName, currentPrice, priorPrice, priorPeriodMedian (nullable, fruit/veg only), changePct, weeklyImpactDollars, status (open|accepted|dismissed), firstSeenAt, lastSeenAt`.
4. **`SupplierItemMapping.conversionFactor`** — already exists. Confirm chefs' tap-to-confirm path writes here on first invoice match (already does per processor.ts), so subsequent invoices skip the unit-changed flag.

## Code changes (in order)

1. `src/lib/invoices/category-classifier.ts` — new. Rules-based categorisation. Run once to backfill `Ingredient.category` across 682 rows. Idempotent.
2. `src/lib/invoices/processor.ts` — modify `processInvoice` to write into `PriceAlert` table instead of flipping `InvoiceLineItem.priceChanged`. Keep the column but stop writing to it.
3. `src/lib/price-alerts/fruit-veg-stream.ts` — new. 4-week trailing median calc, 2-consecutive-delivery check, weekly-impact ranking.
4. `src/lib/price-alerts/stable-stream.ts` — new. Same-unit comparison vs `Ingredient.purchasePrice`, canonical-name grouping.
5. `src/components/price-alerts-v2.tsx` — new. Two tabs (Produce / Everything else) with one-tap accept per row. Replace `supplier-price-alerts.tsx` once live.
6. `src/lib/weekly-digest/html-renderer.ts` — split the "Supplier price changes" section into the two streams, each with its own sort + summary line ("3 produce items running hot · 5 stable items moved ≥5%").

## Migration of historical data

- Old `InvoiceLineItem.priceChanged` field: keep column for now, stop writing. Drop in a later release once the V2 alerts have been in prod for a month.
- Old approved/rejected state: ignored — we cleared the backlog on 2026-06-13. Fresh start.
- Backfill `Ingredient.category` before V2 alerts go live or every ingredient lands in Stream B and Stream A is empty.

## Test plan

- Unit: `compareUnits` + canonical-name join + trailing-median calc + 2-consecutive check.
- Integration: synthetic 8-week invoice stream for Pacific Wholesale (Stream A) and Bidfood (Stream B), verify each alert surface fires at the right boundary.
- Backfill dry-run: run categoriser against prod data, output category-distribution table, eyeball before applying.

## Out of scope (future)

- Per-venue prices. Schema stores prices globally on `Ingredient`. Per-venue is `IngredientPar` (par levels) only. If/when venues genuinely diverge on supplier choice for the same canonical, a `VenueIngredientOverride` table would be needed — but not for this rebuild.
- ML categorisation for ambiguous ingredients ("frozen mango chunks" — is that fresh produce or pantry?). Rules-based for V1.
