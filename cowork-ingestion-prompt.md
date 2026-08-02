# Cowork Ingestion Prompt — Tarte Supplier Forms

**Paste this into Cowork when you want the procurement artifacts to be rebuilt.**

---

## The job

Read `tarte-kitchen/scripts/order-forms.json` from the latest commit on `main`. Build two artifacts from it:

1. **Where to Order — Cheat Sheet** (ingredient → supplier lookup, alphabetical)
2. **Order Forms** (one section per supplier, items grouped by category)

This JSON is the **single source of truth** for Tarte's procurement. Read it fresh every time — never cache a snapshot. Every cell on every page must come from this file.

## Schema you'll find in the JSON

```json
{
  "_schema": { "version": 2, "description": "...", "fields": {...} },
  "_updated": "YYYY-MM-DD",
  "forms": [
    {
      "supplier": "Bidfood",
      "rebatePct": 4,                          // KEY: apply this to all Bidfood prices
      "deliveryDays": ["Tue", "Thu", "Sat"],
      "cutoff": "2pm previous day",
      "email": null, "phone": null,
      "items": [
        {
          "category": "Dairy",
          "name": "Butter Salted (Anchor)",
          "packSize": "5 kg",
          "packPrice": 83.48,                   // ex GST, GROSS (pre-rebate)
          "unitPrice": 16.696,                  // per kg/L/each, GROSS
          "unit": "kg",
          "active": true,                       // KEY: see below
          "notes": "..."
        }
      ]
    }
  ]
}
```

## Three rules that prevent the previous mistakes

### Rule 1: `active: false` items are NOT sourced from that supplier

Every item carries `"active": true | false`. **Only include `active: true` items** in either artifact. An `active: false` item means the supplier carries it but we chose to source it from a different supplier (or the chef ruled it out). Hiding these is the whole point — otherwise the cheatsheet shows duplicates and the wrong supplier wins.

### Rule 2: Apply `rebatePct` before comparing prices across suppliers

Bidfood carries a `"rebatePct": 4`. Their `packPrice` and `unitPrice` are **gross** — multiply by `(1 - rebatePct/100)` = `× 0.96` to get the true effective cost for cross-supplier comparison in the cheatsheet.

For the per-supplier order form, **show the gross price** (that's what the invoice will land at) plus a note at the top: *"Prices shown gross — Tarte gets a 4% rebate so the real cost is ~4% lower."*

Other suppliers have `"rebatePct": 0` — no adjustment.

### Rule 3: When the same ingredient appears on more than one active supplier, pick the cheapest by effective unit price

For the cheatsheet, group lines by ingredient name (fuzzy-match similar names like "Mozzarella Shredded" across suppliers). For each group, the row's "Order From" colour-dot is the supplier with the lowest **effective** unit price. Show only that one. If there's a tie or near-tie (within 5%), prefer Fermex > Provedores > Bidfood > GCPF for consolidation. Never show the same ingredient row for two different suppliers.

For the per-supplier order forms — this rule doesn't apply (each supplier's form is just their own active items).

## Cheatsheet layout

Alphabetical by ingredient. One row per ingredient. Columns:

| Ingredient | Pack Size | Price (gross) | Unit Price (effective) | Order From |
|---|---|---|---|---|

The "Order From" cell is a coloured dot + supplier name:
- 🔴 Bidfood
- 🟢 Fermex
- 🔵 Provedores
- 🟣 Cheese Time
- 🟠 Fino
- (Gold Coast Premium Foods is currently all `active: false` — don't render any GCPF rows)

If a row has a `notes` field, render the note as small grey text below the ingredient name (e.g. "Chef-preferred brand", "Pkt-price bug fixed").

## Order Form layout (per supplier)

One section per supplier. Header includes:
- Supplier name in supplier colour
- Delivery days + cutoff
- Contact (email/phone if present)
- Rebate note if `rebatePct > 0`

Inside the section, group by `category` in this order:
Dairy → Meat → Pastry/Baking → Nuts → Pantry → Spices → Oils → Frozen → Beverages → Cleaning → Packaging → Other

Within each category, items alphabetical. Columns:

| Item | Pack Size | Price | Unit Price | Quantity (blank for chef to fill) |

Skip suppliers that have zero active items entirely.

## Suppliers that *should* appear

| Supplier | Status | Expected approximate item count (active) |
|---|---|---|
| Bidfood | Active | ~78 |
| Fermex | Active | ~87 |
| The Provedores | Active | ~56 |
| Cheese Time | Active | 1 (Burrata only) |
| Fino | Active | 5 (cured meats only) |
| Gold Coast Premium Foods | All inactive — skip | 0 |

If your counts come out wildly different, something is wrong with the active-flag filtering. Stop and ask.

## Things you should NEVER do

- ❌ Show an item with `active: false`
- ❌ Show the same ingredient row from more than one supplier on the cheatsheet
- ❌ Compare a Bidfood gross price to a Fermex price without applying the rebate
- ❌ Build an empty form for a supplier with no active items
- ❌ Hard-code prices or supplier choices — read everything from JSON
- ❌ Cache the JSON. Re-read it every build.

## Verification before publishing

Spot-check these eight lines on the cheatsheet before considering it done:

1. ☐ **Glucose Syrup 5kg** → 🟢 Fermex @ $4.79/kg (NOT Provedores)
2. ☐ **Oats Rolled 25kg** → 🟢 Fermex @ $2.31/kg (NOT Provedores)
3. ☐ **Sugar Raw 25kg** → 🟢 Fermex @ $1.94/kg (NOT Provedores or Bidfood)
4. ☐ **Cinnamon** → only the Fermex 1kg stick at $19/kg (Bidfood Kriokrush 200g should NOT appear)
5. ☐ **Bleach 5L** → 🔵 Provedores at $9.50/btl, $1.90/L (not $10.60)
6. ☐ **Mozzarella Holy Cow 2kg** → 🔵 Provedores at $26.10 (not $24.60)
7. ☐ **Sea Salt Flakes** → only 🔴 Bidfood Cornish at $26.05/kg (no Provedores rows)
8. ☐ **Burrata** → 🟣 Cheese Time at $41/kg (not empty)

If any of these eight are wrong, the active-flag filtering or rebate adjustment didn't apply correctly.

---

## What changed this round

Compared to the artifact dated 8 Jun 2026 morning:

- Schema now has `active` flag per item and `rebatePct`/`deliveryDays`/`cutoff`/`email`/`phone` per supplier
- 65 items flipped to `active: false` to reflect chef + commercial decisions (e.g. Cinnamon Quills off Bidfood, Glucose off Provedores, Mayo ETA off Fermex)
- Cheese Time + Fino added with full pricing
- 5 Provedores invoice-verified drift prices applied (Bleach −10%, Mozzarella +6%, Cream Thickened +4%, Choc Piccoli +12%, Almond Kernels +7%)
- 7 Fermex S29927/S30280 prices applied (Lemon Paste −28%, Pecan +20%, Walnut +28%, Pepper Black −13%, Garlic Granules −7%, Strawberry 1kg new, Almond Flakes 9kg)
- Bidfood Pkt-multi-pack bug fixed (Banana Chunks Entyce now $3.07/kg, Mango Chunks $4.96/kg — was 4× too low)

All of those will surface automatically the moment you re-ingest `order-forms.json` and respect the `active` flag.
