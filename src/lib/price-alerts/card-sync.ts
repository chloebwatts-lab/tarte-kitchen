/**
 * Cost cards follow the invoices, audited against the latest quote.
 * Pure, no database (the service is ./card-sync-service.ts).
 *
 * Chloe, 13 Nov 2026: "auto-update" the cost cards, "but make sure you
 * audit them against the most recent quotes". So each night:
 *
 *  - Each supplier product, per venue, has a SETTLED price: the newest
 *    price on 2+ deliveries. One odd invoice never moves a card.
 *  - Each settled price is checked against the latest quote for that
 *    product (the order-form price in ApprovedSupplierItem, kept from
 *    supplier quotes and price lists). Charged ABOVE the quote: the card
 *    takes the quote, not the invoice, and the gap is listed as "charged
 *    above quote" to chase or accept (accept = update the order-form
 *    price). At or below the quote: the card takes the invoice.
 *  - The card's price per purchase unit is those prices weighted by how
 *    much of each product and venue was bought in the last 8 weeks.
 *  - Moves under 2% are left alone (no churn). Moves over 50% are held
 *    for a check: after the 13 Nov clean-up a jump that size is far more
 *    likely a wrong mapping or pack than a real price.
 *  - A card a person changed in the last 14 days is left alone.
 */
import { productKeys, settledPrice, sortByDate, type StableLine } from "./stable"
import { streamForCategory } from "./classifier"
import type { IngredientCategory } from "@/generated/prisma/client"

export const SYNC_MIN_CHANGE_PCT = 2
export const SYNC_MAX_CHANGE_PCT = 50
export const SYNC_WEIGHT_DAYS = 56
export const QUOTE_TOLERANCE_PCT = 2
/** A quote further than this from the invoice (either way) is the wrong product or pack, not a price. */
const QUOTE_MATCH_BAND = 1.5
const DAY = 86_400_000

export interface SyncLine extends StableLine {
  /** Price per billed unit as charged (per PAT, per CTN, per kg). */
  billedPrice: number
}

export interface QuoteRow {
  id: string
  supplierName: string
  name: string
  /** Price per pack as quoted. */
  packPrice: number
  /** Unit the per-unit price is in: "kg", "L", "each"... */
  unit: string | null
  /** Price per `unit`. */
  unitPrice: number | null
}

export interface CardIngredient {
  id: string
  name: string
  purchasePrice: number
  purchaseQuantity: number
  purchaseUnit: string
  /** Produce (fruit, veg, herbs) follows the 4-week median, not one settled price. */
  category?: string
}

/**
 * The billed price to compare with a quote: the printed unit price, unless
 * the line total shows we paid less (a discount). A total ABOVE the printed
 * price is tax on top (29% WET on wine), not an overcharge.
 */
export function quoteBasisPrice(printed: number, effective: number | null): number {
  return effective != null && effective > 0 && effective < printed ? effective : printed
}

/** Produce cards: median of the last 4 weeks' deliveries, on 3+ delivery days. */
export const PRODUCE_MEDIAN_DAYS = 28
export const PRODUCE_MIN_DAYS = 3

export interface QuoteMatch {
  quote: QuoteRow
  /** What we were charged / what was quoted, on the same basis. */
  ratio: number
}

export interface AboveQuote {
  ingredientId: string
  ingredient: string
  supplierName: string | null
  quoteName: string
  /** Per purchase unit. */
  charged: number
  quoted: number
  unit: string
  pct: number
  /** 8-week volume of this product and venue x the gap, per week. */
  weeklyGapDollars: number | null
}

export interface CardUpdate {
  ingredientId: string
  ingredient: string
  oldPrice: number
  newPrice: number
  purchaseQuantity: number
  purchaseUnit: string
  changePct: number
}

export interface HeldMove extends CardUpdate {
  reason: string
}

export interface CardSyncPlan {
  updates: CardUpdate[]
  held: HeldMove[]
  aboveQuote: AboveQuote[]
}

const STOP = new Set([
  "the", "and", "of", "for", "with", "from", "kg", "gr", "gm", "ml", "ltr", "lt", "pcs", "pk",
  "each", "bag", "ctn", "case", "carton", "btl", "bottle", "tub", "pkt", "pack", "box",
])

const SIZE_UNIT: Record<string, string> = {
  g: "g", gr: "g", gm: "g", grm: "g", gms: "g", kg: "kg", kgs: "kg",
  ml: "ml", l: "l", lt: "l", ltr: "l", litre: "l", liter: "l",
}

/** Lower-case words, accents folded, bracketed supplier codes dropped. */
function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
}

/** "500gr" -> "500g", "2lt" -> "2l"; null when the word is not a pack size. */
function sizeToken(w: string): string | null {
  const m = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(w)
  if (!m || !SIZE_UNIT[m[2]]) return null
  return `${Number(m[1])}${SIZE_UNIT[m[2]]}`
}

/** The words that identify a quoted product: names, brands, pack sizes. */
function quoteTokens(name: string): string[] {
  const out: string[] = []
  for (const w of words(name)) {
    const size = sizeToken(w)
    if (size) out.push(size)
    else if (w.length >= 3 && !STOP.has(w) && !/^\d+(\.\d+)?$/.test(w)) out.push(w)
  }
  return [...new Set(out)]
}

/** Everything an invoice description can be matched on, including two adjacent words run together ("de bortoli" = "debortoli"). */
function invoiceTokens(descriptions: string[]): Set<string> {
  const out = new Set<string>()
  for (const d of descriptions) {
    const ws = words(d)
    ws.forEach((w, i) => {
      out.add(sizeToken(w) ?? w)
      if (i + 1 < ws.length) out.add(w + ws[i + 1])
    })
  }
  return out
}

/** Words that make a different product, so they must be on both sides or neither. */
const VARIANT_WORDS = new Set([
  "extra", "virgin", "light", "lite", "lactose", "gluten", "skim", "skinny", "low", "fat", "reduced",
  "organic", "unsalted", "salted", "smoked", "unsweetened", "sweetened", "sliced", "shredded", "grated",
  "ground", "whole", "black", "white", "brown", "dark", "red", "green", "frozen", "dried", "decaf",
  "vegan", "plant", "oat", "almond", "soy", "coconut", "truffle", "garlic", "chilli", "spicy",
])

/** Order-form brand -> how the supplier prints it on invoices. */
const BRAND_ALIASES: Record<string, string[]> = {
  catchoice: ["caterers"], // Bidfood "CATERERS C" house brand
  chefchoice: ["chefs"], // Bidfood "CHEFS CHOI"
  casademare: ["casa"], // "CASA DE MA"
}

function covered(token: string, inv: Set<string>): boolean {
  if (inv.has(token)) return true
  if (BRAND_ALIASES[token]?.some((a) => inv.has(a))) return true
  if (/^\d/.test(token)) return false // pack sizes must match exactly
  for (const t of inv) {
    const [short, long] = t.length <= token.length ? [t, token] : [token, t]
    if (short.length >= 4 && !/^\d/.test(short) && long.startsWith(short)) return true // "yarde" ~ "yardefarm"
  }
  return false
}

const METRIC: Record<string, string> = { kg: "kg", kgs: "kg", kilo: "kg", l: "l", lt: "l", ltr: "l", litre: "l", liter: "l" }

function sameSupplier(a: string | null, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "")
  return a != null && n(a) === n(b)
}

/**
 * The quote for one invoiced product: same supplier, EVERY word of the
 * quoted name found in the product's invoice descriptions (brand and pack
 * size included, so Masterfoods dijon never audits against a Frenchmaid
 * quote, nor a 395g tin against a 1.2kg tub), at least two of them, and a
 * price on a comparable basis (the billed unit price against the quoted
 * pack price, or per kg / per L against the quoted unit price when both
 * are metric). A "match" more than 1.5x away either way is a different
 * pack or product, never an overcharge, so it is dropped.
 */
export function matchQuote(
  product: {
    supplierName: string | null
    /** All the descriptions this product has been invoiced under. */
    description: string | string[]
    billedUnit?: string | null
    billedPrice: number
  },
  quotes: QuoteRow[]
): QuoteMatch | null {
  if (!(product.billedPrice > 0)) return null
  const descs = Array.isArray(product.description) ? product.description : [product.description]
  const inv = invoiceTokens(descs)
  const invWords = new Set(descs.flatMap(words))
  let best: { m: QuoteMatch; score: number } | null = null
  for (const q of quotes) {
    if (!sameSupplier(product.supplierName, q.supplierName)) continue
    const qt = quoteTokens(q.name)
    if (qt.length < 2 || !qt.every((t) => covered(t, inv))) continue
    // Variant words cut both ways: an invoice that adds "extra virgin" or
    // "lactose free" is a different product from the plain quote.
    const qw = new Set(words(q.name))
    if ([...VARIANT_WORDS].some((v) => qw.has(v) !== invWords.has(v))) continue
    const score = qt.length
    const ratios: number[] = []
    if (q.packPrice > 0) ratios.push(product.billedPrice / q.packPrice)
    const bu = METRIC[(product.billedUnit ?? "").trim().toLowerCase()]
    const qu = METRIC[(q.unit ?? "").trim().toLowerCase()]
    if (bu && qu && bu === qu && q.unitPrice && q.unitPrice > 0) ratios.push(product.billedPrice / q.unitPrice)
    const usable = ratios.filter((r) => r <= QUOTE_MATCH_BAND && r >= 1 / QUOTE_MATCH_BAND)
    if (usable.length === 0) continue
    const ratio = usable.reduce((a, b) => (Math.abs(Math.log(a)) <= Math.abs(Math.log(b)) ? a : b))
    const m = { quote: q, ratio }
    if (
      !best ||
      score > best.score ||
      (score === best.score && Math.abs(Math.log(ratio)) < Math.abs(Math.log(best.m.ratio)))
    ) {
      best = { m, score }
    }
  }
  return best?.m ?? null
}

/**
 * Produce price: the median of the last 4 weeks' deliveries (latest line
 * per day), on at least 3 delivery days. Weekly market swings average out
 * instead of the card chasing each one. Series oldest first.
 */
export function produceMedian<T extends StableLine>(series: T[], now: Date): { price: number; line: T } | null {
  const from = now.getTime() - PRODUCE_MEDIAN_DAYS * DAY
  const byDay = new Map<number, T>()
  for (const l of series) {
    const t = l.invoiceDate.getTime()
    if (t < from || t > now.getTime()) continue
    byDay.set(Math.floor(t / DAY), l) // latest line of the day wins
  }
  const days = [...byDay.values()]
  if (days.length < PRODUCE_MIN_DAYS) return null
  const prices = days.map((l) => l.price).sort((a, b) => a - b)
  const mid = Math.floor(prices.length / 2)
  const price = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2
  return { price, line: days[days.length - 1] }
}

/**
 * Plan tonight's card changes. `lines` are unit-safe invoice lines for the
 * last 90 days; `manuallyChanged` is ingredient ids a person re-priced in
 * the last 14 days.
 */
export function planCardSync(input: {
  ingredients: CardIngredient[]
  lines: Map<string, SyncLine[]>
  quotes: QuoteRow[]
  manuallyChanged: Set<string>
  now?: Date
}): CardSyncPlan {
  const now = input.now ?? new Date()
  const weightFrom = now.getTime() - SYNC_WEIGHT_DAYS * DAY
  const plan: CardSyncPlan = { updates: [], held: [], aboveQuote: [] }

  for (const ing of input.ingredients) {
    const lines = (input.lines.get(ing.id) ?? []).filter((l) => l.price > 0 && Number.isFinite(l.price))
    if (lines.length === 0 || !(ing.purchaseQuantity > 0)) continue
    const isProduce = ing.category != null && streamForCategory(ing.category as IngredientCategory) === "PRODUCE"

    const keys = productKeys(lines)
    const series = new Map<string, SyncLine[]>()
    lines.forEach((l, i) => {
      const k = `${keys[i]}|${l.venue ?? ""}`
      const arr = series.get(k) ?? []
      arr.push(l)
      series.set(k, arr)
    })

    const parts: { price: number; w8: number; wAll: number }[] = []
    const above: AboveQuote[] = []
    for (const s of series.values()) {
      const sorted = sortByDate(s)
      const settled = isProduce ? produceMedian(sorted, now) : settledPrice(sorted)
      if (!settled) continue
      let w8 = 0
      let wAll = 0
      for (const l of sorted) {
        if (l.lineTotal == null) continue
        const v = l.lineTotal / l.price
        wAll += v
        if (l.invoiceDate.getTime() >= weightFrom) w8 += v
      }
      let price = settled.price
      // Produce is market-priced: no fixed quote to audit against.
      const match = isProduce ? null : matchQuote(
        {
          supplierName: settled.line.supplierName,
          description: [...new Set(sorted.map((l) => l.description))],
          billedUnit: settled.line.unit,
          billedPrice: settled.line.billedPrice,
        },
        input.quotes
      )
      if (match && (match.ratio - 1) * 100 > QUOTE_TOLERANCE_PCT) {
        const quoted = settled.price / match.ratio
        const gap = w8 > 0 ? (w8 / (SYNC_WEIGHT_DAYS / 7)) * (settled.price - quoted) : null
        // One row per ingredient and quote: venues add up.
        const same = above.find((a) => a.quoteName === match.quote.name && a.supplierName === settled.line.supplierName)
        if (same) {
          if (gap != null) same.weeklyGapDollars = Math.round(((same.weeklyGapDollars ?? 0) + gap) * 100) / 100
          // Show the worse venue's price; the gap above is the venues' total.
          const pct = Math.round((match.ratio - 1) * 10000) / 100
          if (pct > same.pct) {
            same.pct = pct
            same.charged = settled.price
            same.quoted = quoted
          }
        } else {
          above.push({
            ingredientId: ing.id,
            ingredient: ing.name,
            supplierName: settled.line.supplierName,
            quoteName: match.quote.name,
            charged: settled.price,
            quoted,
            unit: ing.purchaseUnit,
            pct: Math.round((match.ratio - 1) * 10000) / 100,
            weeklyGapDollars: gap != null ? Math.round(gap * 100) / 100 : null,
          })
        }
        price = quoted
      }
      parts.push({ price, w8: Math.max(0, w8), wAll: Math.max(0, wAll) })
    }
    plan.aboveQuote.push(...above)
    if (parts.length === 0) continue

    const by8 = parts.filter((p) => p.w8 > 0)
    const byAll = parts.filter((p) => p.wAll > 0)
    let unitPrice: number
    if (by8.length > 0) unitPrice = by8.reduce((a, p) => a + p.price * p.w8, 0) / by8.reduce((a, p) => a + p.w8, 0)
    else if (byAll.length > 0) unitPrice = byAll.reduce((a, p) => a + p.price * p.wAll, 0) / byAll.reduce((a, p) => a + p.wAll, 0)
    else if (parts.length === 1) unitPrice = parts[0].price
    else continue

    if (input.manuallyChanged.has(ing.id)) continue
    const oldUnit = ing.purchasePrice / ing.purchaseQuantity
    const newPrice = Math.round(unitPrice * ing.purchaseQuantity * 10000) / 10000
    if (!(newPrice > 0)) continue
    const changePct = oldUnit > 0 ? ((unitPrice - oldUnit) / oldUnit) * 100 : Infinity
    if (Math.abs(changePct) < SYNC_MIN_CHANGE_PCT) continue
    const change: CardUpdate = {
      ingredientId: ing.id,
      ingredient: ing.name,
      oldPrice: ing.purchasePrice,
      newPrice,
      purchaseQuantity: ing.purchaseQuantity,
      purchaseUnit: ing.purchaseUnit,
      changePct: Number.isFinite(changePct) ? Math.round(changePct * 100) / 100 : changePct,
    }
    if (!(Math.abs(changePct) <= SYNC_MAX_CHANGE_PCT)) {
      plan.held.push({ ...change, reason: `moves ${Number.isFinite(changePct) ? Math.round(changePct) + "%" : "from $0"} at once; check the mapping and pack` })
    } else {
      plan.updates.push(change)
    }
  }

  plan.aboveQuote.sort((a, b) => Math.abs(b.weeklyGapDollars ?? 0) - Math.abs(a.weeklyGapDollars ?? 0))
  return plan
}
