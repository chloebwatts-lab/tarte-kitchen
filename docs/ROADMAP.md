# Roadmap — Restoke-inspired extensions

Everything shipped in Stage 1 uses data Tarte already collects. Stage 2 features
are the remaining Restoke benefits worth bringing in; they all require either
new capture UX, a new integration, or a new data model.

## Stage 1 — shipped

| Feature | Route | Migration | Notes |
|---|---|---|---|
| Menu Engineering | `/menu-engineering` | none | Stars/Plowhorses/Puzzles/Dogs from POS + recipe costs. |
| Prep Sheet | `/prep-sheet` | none | Median forecast over trailing same-weekday sales, cascades sub-preps. |
| Stocktake | `/stocktake` | `20260418000000_stage1…` | Count + variance vs previous stocktake − theoretical usage. |
| Checklists (HACCP-ready) | `/checklists` | same migration | Templates + daily runs, optional temp/note capture per item. |
| Recipe cards (print) | `/preparations/:id/print`, `/dishes/:id/print` | none | Clean A4 print layout. |
| Allergen field on ingredient | schema + picker component | same migration | Rolled up to recipe card. (Hook into ingredient form — see note.) |

Migration `20260418000000_stage1_prep_stocktake_checklists_allergens` ships the
new tables plus the `Allergen` enum column. Deploy applies it via `./scripts/deploy.sh`.

**Follow-up for allergen UX:** the `<AllergenPicker />` component is built and
ready. Wire it into [ingredient-form.tsx](../src/components/ingredient-form.tsx)
where the category/par-level fields live, binding to the new
`Ingredient.allergens` column. 30-minute job.

## Stage 2 — in progress

### ⚠️ Security backfill (this turn)
The middleware `matcher` previously only listed the Stage-0 routes, so
every page I added in Stage 1 (`/menu-engineering`, `/prep-sheet`,
`/stocktake`, `/checklists`, `/orders`, plus the new `/labour`,
`/kitchen`, `/analysis`) was reachable unauthenticated. Fixed in this
turn — verified `/menu-engineering` now redirects to `/login`. No change
to existing protected routes.

### 1. Ordering / purchase orders ✅ shipped
Routes: `/orders` (index + suggestions), `/orders/:id` (edit / submit).
Migration: `20260418010000_stage2_purchase_orders`.

- `suggestOrders(venue)` computes `par + forecast − (onHand − usageSince)`
  per ingredient, grouped by supplier, pack-size-rounded via
  `Ingredient.purchaseQuantity`. When no submitted stocktake exists, falls
  back to `par + 7d forecast` and surfaces the reason string inline.
- One-click "Create draft" per supplier → editable draft PO.
- Submit generates an order email snapshot (subject/body/to) stored on the
  PO; UI provides Copy + `mailto:` — Gmail API send is deliberately left
  out of the first cut to avoid surprise sends. Drop it in as a follow-up
  once the team trusts the output.
- `Supplier.deliveryDays` and `Supplier.orderCutoffHour` added for a future
  scheduling pass — not yet wired into the suggestion engine.

Remaining: receiving workflow (the `receivedQty` column already exists on
`PurchaseOrderLine`), supplier-cutoff-aware delivery dates, and auto-linking
inbound invoices to the PO they fulfil.

### 2. Checklist alerting + iPad kitchen view ✅ shipped
Migration: `20260419000000_stage2_alerts_deputy`.

- Templates now carry `dueByHour` + `alertEmails` (set in the template
  form). If the hour passes with items still unticked, the cron at
  `/api/cron/checklist-alerts` writes a `ChecklistAlert` row and sends
  one email to every listed manager. Idempotent per (template, venue,
  date).
- `/checklists` shows an overdue banner with per-line drill-ins.
- New kitchen-kiosk routes at `/kitchen`, `/kitchen/run/:id` — no
  sidebar, 64-pixel tap targets, staff-initial stamping on every tick,
  big temp inputs, single "Home" exit. Designed for a wall-mounted iPad.
- Cron: hit `/api/cron/checklist-alerts` every 15 minutes with the
  standard `Bearer $CRON_SECRET`.
- Email delivery goes via the existing Gmail OAuth connection (new
  helper at `src/lib/gmail/send.ts`).

Still to do (inside this bucket): HACCP compliance report export (PDF),
temp-chart per fridge, completion-rate-per-template dashboard.

### 2a. Food-safety reports (HACCP dashboard)
Data is now being captured. Next pass: filter runs by
`isFoodSafety = true` and surface:
- Fridge/freezer temp timeline (tempCelsius captured per run item)
- Completion rate per template per venue
- Missed closing checks flagged
- Export as compliance PDF for council audits

### 3. Supplier catalogue & ordering rhythms
Per-supplier price list with change alerts (you already have
`PriceHistory`) plus delivery day metadata on `Supplier`. Combine with #1
to propose "Monday fresh produce" POs automatically.

- Add: `Supplier.deliveryDays`, `Supplier.orderCutoffHour`
- Page: `/suppliers/:id/catalogue` showing every mapped `InvoiceLineItem` with
  last price, average price, and the derived PO suggestion.

### 4. Team & roles
Right now there's a single `User` row. Add:
- `User.role` — OWNER, MANAGER, CHEF, FOH
- Venue pinning so FOH at Beach House only sees that venue's checklists/prep
- Audit trail on stocktake submission & invoice approval (already partly there
  via `Invoice.approvedBy` — extend it).

### 5. SOP library
Reuse the preparation `method` + the printable recipe card chrome; add a
category-first browse page under `/sops` that pulls preparations marked
`isSop = true` (cheap new boolean). Use it to train a new starter on how to
make a sauce before they start service.

### 6. Allergen roll-up on the menu (full)
The card now shows allergens, but the dish list and dashboard should:
- Filter by contains-X / free-from-X
- Flag dishes where a sub-preparation contributes an allergen the chef may
  have missed
- Surface a per-venue allergen report for FSANZ 1.2.3

### 7. Forecast improvements
Replace the trailing-weekday median with:
- Holiday flagging (public holidays shouldn't poison the forecast)
- Weather-sensitive adjustment for ice-cream / cold drinks
- Simple exponential smoothing (α tunable in Settings) for trending items

### 8. Prep labels / printables
From the prep sheet, generate:
- Date-stamped prep labels (make-on, use-by) for pan tags
- Shelf labels with allergens
- A production rundown grouped by station (pastry / cold / hot)

### 9. Nutritional info
Needs a nutrition database (e.g. FSANZ NUTTAB import) or AI-assisted per-dish
estimation. Bolt on `NutritionPer100g` to `Ingredient`, roll up through
preparations.

### 10. Mobile kitchen view
Large-text routes under `/kitchen/*` designed for the prep line iPad — big
checkboxes on checklists, swipe-through recipe cards, temp-entry numpad for
HACCP. The code is mostly responsive already; formalise the layout.

### 11. Menu translation / allergen AI
Ship `@anthropic-ai/sdk` is already a dependency. Add:
- "Translate menu to {fr, zh, ja}" for tourist-heavy Burleigh/Currumbin
- "Scan recipe method for allergen risk" — LLM flags e.g. cross-contamination
  on a nut-free labelled dish.

### 12. Waste analytics deep-cuts ✅ shipped
Route: `/wastage/analytics`. New action `getWastageAnalytics` pulls
entries, sales, and stocktakes then returns:
- Waste % of revenue with 3% benchmark reference line
- By-reason distribution + by-venue bars
- Weekly trend (pct and $ dual-axis)
- Top-15 items by $ waste
- **Spiking items** — entries where waste cost jumped ≥30% in the last
  14 days vs prior 14 days
- **Shrinkage detective** — compares reported waste entries to
  stocktake negative variance and surfaces unaccounted loss per
  ingredient with $ value. This is the biggest lever — "we lost $X of
  cream that nobody logged" is a theft/over-portioning/training
  conversation.
- Human recommendations (severity-tagged) driven off the top reason +
  waste%-of-revenue band + trending items + shrinkage totals.

Follow-up: per-dish waste ratio (needs `Dish.avgUnitsOrdered` which the
Lightspeed sync already implies), and ingredient-specific solutions
(auto-suggest "switch from kg to portion-controlled" for the top
offenders).

### 13. Events / function sheets
`/events/:id` with staffing, dish counts, and prep batches auto-scaled from a
cover estimate. Useful for Tea Garden high-teas.

### 14. Deputy labour integration 🟡 scaffolded — needs credentials
Same migration as checklist alerting. Built end-to-end so it's a ~10-min
hand-off once you have Deputy API credentials:

1. Register an OAuth app in Deputy (Enterprise → Integrations → Developer).
   Callback URL: `https://kitchen.tarte.com.au/api/deputy/callback`.
2. Set env vars on the droplet:
   `DEPUTY_CLIENT_ID`, `DEPUTY_CLIENT_SECRET`,
   `DEPUTY_REDIRECT_URI` (optional, defaults to the above).
3. Visit `/settings/integrations`, click **Connect Deputy** (new card —
   added next pass; route `/api/deputy/auth` already exists).
4. Deputy returns `endpoint` in the token response; I parse it to learn
   your subdomain + region automatically.
5. Map Deputy operational-unit ids to Tarte venues. The
   `DeputyConnection.locations` JSON column is populated from a small
   mapping UI I'll add once you're connected — for now you can seed it
   by hand: `[{"id": 123, "venue": "BURLEIGH"}, ...]`.
6. Cron `GET /api/cron/sync-deputy` (auth `Bearer $CRON_SECRET`) pulls
   approved timesheets and upserts them into `LabourShift` keyed by
   Deputy's id.
7. `/labour` shows daily labour % with 30%/35% reference lines, by-venue
   bars, biggest-% days, and by-employee cost.

I didn't wire a silent auto-sync because Deputy's pay rates are
sensitive — better to watch the first cron run before it's hands-off.
Once you trust it, add the cron to your deploy schedule.

Follow-ups inside this bucket:
- Per-role filter (Kitchen vs FOH) using Deputy's Area column.
- Schedule-vs-actuals variance (requires Roster sync too).
- Auto-flag "labour > 35% for 3 days straight" into the dashboard banner.

---

### Cross-cutting improvements

- **Permissions**: gate new routes by role once Stage 2 #4 lands.
- **Offline-first**: stocktake + checklists are obvious candidates — IndexedDB
  queue that flushes when back online. Ideal for walk-in freezer dead zones.
- **Activity log**: a single `ActivityLog` table to timeline every mutation
  (stocktake submitted, invoice approved, checklist completed) per venue.

Everything in Stage 2 is self-contained — pick them up in any order as value
demands.
