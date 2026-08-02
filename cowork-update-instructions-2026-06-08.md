# Cowork Artifact Update Instructions — 8 Jun 2026

Two artifacts to update:
1. **Where to Order Cheatsheet** (ingredient → supplier lookup)
2. **Order Forms** (per-supplier checklist)

**Source of truth**: `tarte-kitchen/scripts/order-forms.json` (last updated 2026-06-08, includes all chef calls + Fermex S30280 + invoice-verified drift fixes).

If the Cowork pipeline ingests directly from `order-forms.json` → just re-trigger ingestion. If it ingests from a snapshot → do the changes below by hand.

---

## A) Items to REMOVE from current artifacts

### Drop from Provedores supplier form
- ❌ **Cheese Cream Neufchatel 2kg** — chef explicitly wants Philadelphia from Fermex
- ❌ **Sea Salt Flakes (1kg #1 and #2)** — chef ruled out on quality
- ❌ **Sugar Raw 15kg** — Fermex 25kg @ $1.94/kg wins
- ❌ **Cling Wrap (Provedores entry)** — Fermex S29927 wins, keep one source only

### Drop from Bidfood "Where to Order" cheatsheet
- ❌ **Cinnamon Quills 200g Kriokrush @ $90.70/kg** — chef moved to Fermex Cinnamon Stick 1kg @ $19/kg (saves 79%)
- ❌ **Butter Unsalted NZ 25kg @ $14.13/kg** — Fermex Butter Unsalted USA 25kg @ $11.20/kg wins even after 4% rebate

### Drop from Fermex supplier form
- ❌ **Mustard Dijon Masterfoods 21kg** ($150/$7.14/kg) — Bidfood Frenchmaid 2.2kg is the chosen Dijon source (different brand spec; Frenchmaid wins per chef)
- ❌ **Mayonnaise ETA 3.5kg** — chef wants Kewpie (on Bidfood)

---

## B) Items to ADD or CORRECT

### Update Provedores prices (invoice-verified, June 2026)
| Item | Cheatsheet shows | **Correct price** |
|---|---|---|
| Bleach 5L | $10.60/btl | **$9.50/btl = $1.90/L** (May 18 reply) |
| Cheese Holy Cow Mozzarella 2kg | $24.60 = $12.30/kg | **$26.10 = $13.05/kg** (Jun 1 invoice) |
| Cream Thickened 5L | $34.90 = $6.98/L | **$36.35 = $7.27/L** (Jun 5 invoice) |
| Chocolate Piccoli Drops 2.5kg | $79.90 = $31.96/kg | **$89.80 = $35.92/kg** (May 18 reply) |
| Almonds Natural Kernels 1kg | $17.50 | **$18.80** (May 27 invoice) |

### Update Fermex prices (S29927 / S30280)
| Item | Cheatsheet shows | **Correct** | Source |
|---|---|---|---|
| Almonds Flaked | 8kg $145 = $18.12/kg | **9kg $155 = $17.22/kg** | S29927 |
| Bakels Apito Lemon Paste 1kg | $50/kg | **$36/kg** (−28%) | S29927 |
| Pecan Halves 13.6kg | $25.71/kg | **$30.88/kg** (+20%) | S29927 — push back to Patrick |
| Walnut Halves 11.34kg | $10.31/kg | **$13.18/kg** (+28%) | S29927 — push back |
| Pepper Black 1kg | $28.50/kg | **$25.00/kg** (−13%) | S30280 |
| Garlic Granules 1kg | $16.50/kg (shown post-S30280) | **$13.50/kg** (−6.9%) | S30280 |
| Strawberry IQF | 10kg $6.20/kg | **1kg $7.40/kg** (new pack) | S30280 |
| Flour Euro Type 55 Laucke 12.5kg | (not listed) | **$20.30 = $1.624/kg** | Jun 3 invoice |

### Add new sourcing rows to cheatsheet
| Ingredient | Pack Size | Price | Unit Price | Order From |
|---|---|---|---|---|
| **Glucose Syrup** | 5 kg | $23.95 | **$4.79/kg** | ● Fermex *(was Provedores @ $7.80, saves 39%)* |
| **Oats Rolled** | 25 kg | $57.75 | **$2.31/kg** | ● Fermex *(was Provedores @ $3.55, saves 35%)* |
| **Sugar Brown** | 15 kg | $32.55 | **$2.17/kg** | ● Fermex *(was Provedores @ $2.39, saves 9%)* |
| **Sugar Raw** | 25 kg | $48.50 | **$1.94/kg** | ● Fermex *(was Provedores 15kg @ $2.20, saves 12% + bigger pack)* |
| **Maple Syrup Pure 4L pack** | 4 L | $90.00 | **$22.50/L** | ● Provedores *(add as cheapest maple option — already have 1L @ $24.60)* |
| **Cinnamon Stick 1kg** | 1 kg | $19.00 | **$19.00/kg** | ● Fermex *(replaces Bidfood Kriokrush)* |
| **Butter Salted Anchor 5kg** | 5 kg | $83.48 | **$16.70/kg** | ● Bidfood *(chef-preferred pack; in JSON but missing from cheatsheet)* |
| **Burrata 1kg (8 × 125g)** | 1 kg | $41.00 | **$41/kg** | ● Cheese Time *(was missing — has its own form now)* |
| **Hot Salami 1kg** | 1 kg | $21.95 | **$21.95/kg** | ● Fino |
| **Truffle Salami 1kg** | 1 kg | $21.95 | **$21.95/kg** | ● Fino |
| **Salami (mild) 1kg** | 1 kg | $27.95 | **$27.95/kg** | ● Fino |
| **Prosciutto 1kg** | 1 kg | $31.46 | **$31.46/kg** | ● Fino |
| **Prosciutto de Parma 1kg** | 1 kg | $33.50 | **$33.50/kg** | ● Fino |
| **Cranberries Dried Bulk** | 11.34 kg | $106.00 | **$9.35/kg** | ● Fermex *(price was empty — fill in)* |
| **Fondant Soft White Bakels** | 15 kg | $66.25 | **$4.42/kg** | ● Fermex *(price was empty — fill in)* |

---

## C) Dedup the duplicate listings

These show twice in the cheatsheet — pick one:
- **Mineral Water Sparkling Glass Santavittoria** — listed twice from Bidfood. Keep one entry: 12 × 1L @ $40.28/case = $3.36/L.
- **Oil Cottonseed 20L** — Bidfood plastic drum ($63.74) AND Provedores PHAT ($58.90). Per audit Provedores marginally cheaper. Pick one (Provedores).
- **Mustard Dijon** — three SKUs listed. Winner: **Bidfood Frenchmaid 2.2kg @ $16.15 = $7.34/kg**.
- **Sugar Raw** — listed from Bidfood AND Provedores. Decision per audit fix: **Fermex 25kg @ $1.94/kg** (replace both).

---

## D) Cheese Time + Fino forms (currently empty)

Add to the order-form artifact:

**Cheese Time Order Form** (1 line)
| Item | Pack | Price | Unit Price |
|---|---|---|---|
| Burrata 1kg (8 × 125g pieces) | 1 kg | $41.00 | $41/kg |

**Fino Order Form** (5 lines)
| Item | Pack | Price | Unit Price |
|---|---|---|---|
| Hot Salami | 1 kg | $21.95 | $21.95/kg |
| Truffle Salami | 1 kg | $21.95 | $21.95/kg |
| Salami (mild) | 1 kg | $27.95 | $27.95/kg |
| Prosciutto | 1 kg | $31.46 | $31.46/kg |
| Prosciutto de Parma | 1 kg | $33.50 | $33.50/kg |

---

## After update — verification checklist

When the artifacts are rebuilt, spot-check these 6 lines to confirm the changes landed:

1. ☐ Cheatsheet "Glucose" → Fermex (not Provedores)
2. ☐ Cheatsheet has no "Cheese Cream Neufchatel" or "Sea Salt Flakes" rows
3. ☐ Fermex form "Bakels Apito Lemon Paste 1kg" shows **$36** (not $50)
4. ☐ Provedores form "Bleach 5L" shows **$9.50** (not $10.60)
5. ☐ Cheese Time form has Burrata @ $41/kg, Fino form has all 5 cured-meat lines
6. ☐ Cheatsheet "Sugar Raw 25kg" → Fermex @ $1.94/kg only (no duplicates)

---

*Generated from `tarte-kitchen/scripts/order-forms.json` 8 Jun 2026.*
*All chef-spec decisions per `tarte-kitchen/chef-spec-checks.md`.*
