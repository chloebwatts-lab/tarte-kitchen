/**
 * Weekly check: was anything bought from a dearer supplier when a cheaper
 * one for the same product was there? Pure, no database. Chloe, 13 Nov 2026,
 * after the first audit found ~$2,000 in 8 weeks (~$12,500 a year), mostly
 * buys made outside the ordering app (ghee from Bidfood after the forms
 * moved it to Provedores, Marrow chicken breast over Son Of A Bunn, Queen
 * vanilla paste over Fermex).
 *
 * Two ways a buy counts as dearer, both net of Bidfood's rebate, ex GST:
 *  1. Same ingredient, cheaper on our own invoices: another supplier's
 *     product for the same ingredient, bought on 2+ days in the 8-week
 *     window, has a median price per unit 5%+ lower (3%+ when the order
 *     form already marks the dearer supplier "Not from here"; Bidfood ghee
 *     is 4.2% dearer net of rebate). Products that differ by
 *     a variant word (sliced, crushed, organic, frozen...) are not compared:
 *     pre-sliced capsicum is a labour choice, not an overcharge.
 *  2. The order form says buy it elsewhere: the product matches an order
 *     form line marked "Not from here" (inactive), and the "Order from here"
 *     line that replaces it is 3%+ cheaper (its invoiced price when we buy
 *     it, else its form price).
 * A line counts once (way 1 first). The digest week's buys are listed;
 * the 8-week total gives the yearly rate.
 */
import { matchQuote, quoteBasisPrice, VARIANT_WORDS, type QuoteRow } from "./card-sync"
import { productKeys, type StableLine } from "./stable"
import { bestReplacement, rebateFor, type FormRow } from "../preferred-supplier"

/**
 * Net of the supplier's rebate, unrounded. netPrice() rounds to 4 decimals,
 * which is a 6-8% step on a per-g or per-ml price ($1.65/kg flour is
 * 0.00165/g), enough to turn a 1% gap into a 6% one.
 */
const net = (gross: number, supplier: string) => gross * (1 - rebateFor(supplier) / 100)

export const DEARER_WINDOW_DAYS = 56
export const INVOICE_GAP_PCT = 5
export const FORM_GAP_PCT = 3
/** Rows under this extra for the week stay out of the table (still in totals). */
export const MIN_ROW_DOLLARS = 5

/** Same-ingredient pairs that are a deliberate quality call, not a mistake. */
export const KNOWN_CHOICES = new Set([
  "Crab Meat - Spanner", // fresh Fish Factory vs packed Bidfood: quality, Chloe's call (13 Nov 2026)
])

/** Words that make a different product for this comparison, on top of VARIANT_WORDS. */
const FORM_WORDS = new Set([
  ...VARIANT_WORDS, "crushed", "diced", "chunks", "slices", "sachets", "puree", "pulp", "juice",
  "iqf", "fresh", "herb", "cooked", "ckd", "minced", "peeled", "portion", "portions",
  "butterflied", "butterfly", "trimmed", "crumbed", "boneless", "skinless",
])

export interface BuyLine {
  ingredientId: string | null
  ingredientName: string | null
  supplierName: string
  productCode: string | null
  description: string
  unit: string | null
  venue: string | null
  invoiceDate: Date
  qty: number
  lineTotal: number
  /** Printed price per billed unit. */
  unitPrice: number
  /** Effective price per billed unit (line total / qty), null when unknown. */
  effectivePrice: number | null
  /** Unit-safe price per purchase unit; null when not comparable. */
  normalisedPrice: number | null
  purchaseUnit: string | null
}

export interface DearerBuy {
  item: string
  venue: string
  boughtFrom: string
  boughtProduct: string
  cheaperFrom: string
  cheaperProduct: string
  /** Net prices per `unit`. */
  paid: number
  cheaper: number
  unit: string
  pct: number
  extraWeek: number
  /** The order form already says to buy it from `cheaperFrom`. */
  formSaysElsewhere: boolean
}

export interface DearerResult {
  rows: DearerBuy[]
  weekTotal: number
  windowTotal: number
  /** windowTotal x 52 / 8. */
  yearRate: number
  byVenueWeek: Record<string, number>
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function variantWords(descs: string[]): Set<string> {
  const out = new Set<string>()
  for (const d of descs) {
    for (const raw of d.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/)) {
      if (raw === "slices") {
        out.add("sliced")
        continue
      }
      // Plurals read as the same word: "Herbs - Dill" = "HERB - DILL".
      const w = FORM_WORDS.has(raw) ? raw : raw.endsWith("s") && FORM_WORDS.has(raw.slice(0, -1)) ? raw.slice(0, -1) : null
      if (w) out.add(w)
    }
  }
  return out
}

function sameVariants(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const w of a) if (!b.has(w)) return false
  return true
}

export function findDearerBuys(input: {
  lines: BuyLine[]
  forms: FormRow[]
  weekStart: Date
  weekEnd: Date
}): DearerResult {
  const windowStart = input.weekEnd.getTime() - DEARER_WINDOW_DAYS * 86_400_000
  const lines = input.lines.filter(
    (l) =>
      l.qty > 0 &&
      l.lineTotal > 0 &&
      l.unitPrice > 0 &&
      l.invoiceDate.getTime() >= windowStart &&
      l.invoiceDate.getTime() <= input.weekEnd.getTime()
  )
  const inWeek = (l: BuyLine) => l.invoiceDate.getTime() >= input.weekStart.getTime()
  const keys = productKeys(lines.map((l) => ({ ...l, price: l.normalisedPrice ?? 0 }) as StableLine & BuyLine))
  const byProduct = new Map<string, number[]>()
  keys.forEach((k, i) => {
    const a = byProduct.get(k) ?? []
    a.push(i)
    byProduct.set(k, a)
  })

  const extra = new Map<number, { amount: number; row: Omit<DearerBuy, "extraWeek" | "venue"> }>()

  // Which order-form line each product matches (inactive = "Not from here").
  const quotes: QuoteRow[] = input.forms
    .filter((f) => f.packPrice > 0)
    .map((f) => ({ id: f.id, supplierName: f.supplier, name: f.name, packPrice: f.packPrice, unit: f.unit, unitPrice: f.unitPrice }))
  const formById = new Map(input.forms.map((f) => [f.id, f]))
  // perUnit turns a billed price into a price per form unit on the basis the
  // match was made: per pack (unitPrice / packPrice), or 1 when the supplier
  // bills per kg / L. Dividing a per-kg bill by the pack size again made a
  // $15 gap read $103.
  const matched = new Map<string, { form: FormRow; billed: number; perUnit: number | null }>()
  for (const [k, idx] of byProduct) {
    const ls = idx.map((i) => lines[i])
    const last = ls[ls.length - 1]
    const billed = quoteBasisPrice(last.unitPrice, last.effectivePrice)
    const m = matchQuote(
      { supplierName: last.supplierName, description: [...new Set(ls.map((l) => l.description))], billedUnit: last.unit, billedPrice: billed },
      quotes
    )
    if (!m) continue
    const form = formById.get(m.quote.id)!
    const perUnit = form.unitPrice && form.unitPrice > 0 ? (m.ratio * form.unitPrice) / billed : null
    matched.set(k, { form, billed, perUnit })
  }
  /** What we actually pay per form unit, gross, for each form line we buy. */
  const actualUnitByForm = new Map<string, number>()
  for (const v of matched.values()) if (v.perUnit) actualUnitByForm.set(v.form.id, v.billed * v.perUnit)

  // ---- 1. Same ingredient, cheaper product on our own invoices.
  const productsByIng = new Map<string, string[]>()
  for (const [k, idx] of byProduct) {
    const l = lines[idx[0]]
    if (!l.ingredientId || !(l.normalisedPrice && l.normalisedPrice > 0)) continue
    const a = productsByIng.get(l.ingredientId) ?? []
    a.push(k)
    productsByIng.set(l.ingredientId, a)
  }
  for (const ks of productsByIng.values()) {
    const prods = ks.map((k) => {
      const idx = byProduct.get(k)!.filter((i) => (lines[i].normalisedPrice ?? 0) > 0)
      const ls = idx.map((i) => lines[i])
      return {
        k,
        idx,
        supplier: ls[0].supplierName,
        desc: ls[ls.length - 1].description,
        net: median(ls.map((l) => net(l.normalisedPrice!, l.supplierName))),
        days: new Set(ls.map((l) => l.invoiceDate.getTime())).size,
        variants: variantWords(ls.map((l) => l.description)),
      }
    }).filter((p) => p.idx.length > 0)
    if (new Set(prods.map((p) => p.supplier)).size < 2) continue
    const first = lines[prods[0].idx[0]]
    if (KNOWN_CHOICES.has(first.ingredientName ?? "")) continue
    for (const p of prods) {
      const rivals = prods.filter((c) => c.supplier !== p.supplier && c.days >= 2 && sameVariants(c.variants, p.variants))
      if (rivals.length === 0) continue
      const cheapest = rivals.reduce((a, b) => (b.net < a.net ? b : a))
      const formOut = matched.get(p.k)?.form.active === false
      // The product is dearer when its typical (median) price is, not when
      // one delivery was: a volatile supplier that is usually cheapest must
      // not be flagged on its dear days. When the order form already rules
      // this supplier out, the lower form bar applies (Bidfood ghee: 4.2%
      // dearer net of rebate, forms moved it to Provedores).
      if (p.net < cheapest.net * (1 + (formOut ? FORM_GAP_PCT : INVOICE_GAP_PCT) / 100)) continue
      for (const i of p.idx) {
        const l = lines[i]
        const paid = net(l.normalisedPrice!, l.supplierName)
        if (!(paid > cheapest.net)) continue
        const units = l.lineTotal / l.normalisedPrice!
        extra.set(i, {
          amount: (paid - cheapest.net) * units,
          row: {
            item: l.ingredientName ?? l.description,
            boughtFrom: l.supplierName,
            boughtProduct: p.desc,
            cheaperFrom: cheapest.supplier,
            cheaperProduct: cheapest.desc,
            paid,
            cheaper: cheapest.net,
            unit: l.purchaseUnit ?? "",
            pct: Math.round((paid / cheapest.net - 1) * 1000) / 10,
            formSaysElsewhere: formOut,
          },
        })
      }
    }
  }

  // ---- 2. The order form says buy it elsewhere (where the invoices had no comparison).
  for (const [k, { form, perUnit }] of matched) {
    if (form.active || !perUnit) continue
    const rep = bestReplacement(form, input.forms)
    if (!rep || !rep.unitPrice || !(rep.unitPrice > 0)) continue
    // Supplier choice only: a bigger pack from the same supplier (caster
    // sugar 15kg vs 25kg) is a pack decision, not a dearer supplier.
    if (rep.supplier === form.supplier) continue
    const repNet = net(actualUnitByForm.get(rep.id) ?? rep.unitPrice, rep.supplier)
    for (const i of byProduct.get(k)!) {
      const l = lines[i]
      const already = extra.get(i)
      if (already) {
        if (already.row.cheaperFrom === rep.supplier) already.row.formSaysElsewhere = true
        continue
      }
      const paid = net(quoteBasisPrice(l.unitPrice, l.effectivePrice) * perUnit, l.supplierName)
      if (paid < repNet * (1 + FORM_GAP_PCT / 100)) continue
      extra.set(i, {
        amount: (paid - repNet) * (l.qty / perUnit),
        row: {
          item: l.ingredientName ?? form.name,
          boughtFrom: l.supplierName,
          boughtProduct: l.description,
          cheaperFrom: rep.supplier,
          cheaperProduct: rep.name,
          paid,
          cheaper: repNet,
          unit: form.unit ?? "",
          pct: Math.round((paid / repNet - 1) * 1000) / 10,
          formSaysElsewhere: true,
        },
      })
    }
  }

  // ---- Totals and the week's rows.
  let windowTotal = 0
  let weekTotal = 0
  const byVenueWeek: Record<string, number> = {}
  const rows = new Map<string, DearerBuy>()
  for (const [i, e] of extra) {
    windowTotal += e.amount
    const l = lines[i]
    if (!inWeek(l)) continue
    weekTotal += e.amount
    const venue = l.venue ?? "Unknown"
    byVenueWeek[venue] = (byVenueWeek[venue] ?? 0) + e.amount
    const key = `${e.row.item}|${venue}|${e.row.boughtFrom}|${e.row.cheaperFrom}`
    const r = rows.get(key)
    if (r) r.extraWeek += e.amount
    else rows.set(key, { ...e.row, venue, extraWeek: e.amount })
  }
  const round = (n: number) => Math.round(n * 100) / 100
  for (const v of Object.keys(byVenueWeek)) byVenueWeek[v] = round(byVenueWeek[v])
  return {
    rows: [...rows.values()]
      .map((r) => ({ ...r, extraWeek: round(r.extraWeek) }))
      .filter((r) => r.extraWeek >= MIN_ROW_DOLLARS)
      .sort((a, b) => b.extraWeek - a.extraWeek),
    weekTotal: round(weekTotal),
    windowTotal: round(windowTotal),
    yearRate: Math.round((windowTotal * 52) / (DEARER_WINDOW_DAYS / 7)),
    byVenueWeek,
  }
}
