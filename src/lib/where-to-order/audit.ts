/**
 * The Wednesday check: did the venues buy each item on the "Where to order
 * it" sheet (./sheet.ts) from the supplier we told them to? Pure, no
 * database.
 *
 * Every invoice line of the trading week (Wed to Tue) is read against the
 * sheet by its description. A line is off the sheet when it came from
 * another supplier (or, for "Philly only" type rows, the right supplier but
 * the wrong product). A supplier the sheet allows as a backup (Eustralis
 * Prova when Fermex vanilla is out) is counted, not flagged.
 *
 * What it cost: the line's price per kg / L / each, net of Bidfood's
 * rebate, against what the right supplier charged us over the last 8 weeks
 * (median), else the sheet's own price. A gap over 2x either way is a pack
 * we could not read, so that line shows no dollar figure rather than a
 * wrong one. Lines whose invoice reached us after last Wednesday's check,
 * dated in the 3 weeks before, are included and marked late, so a Tuesday
 * delivery invoiced on Thursday is still seen.
 */
import { parsePackSize, normaliseUnit } from "@/lib/invoices/units"
import { rebateFor } from "@/lib/preferred-supplier"
import { canonicalSupplier, ruleFor, SHEET, type Dept, type SheetRule } from "./sheet"

export const REF_WINDOW_DAYS = 56
export const LATE_LOOKBACK_DAYS = 21
/** A price gap past this ratio is a pack we misread, not a real price. */
export const MAX_RATIO = 2

export interface AuditLine {
  supplierName: string
  description: string
  /** Billed unit as printed (kg, ea, ctn...). */
  unit: string | null
  venue: string | null
  invoiceDate: Date
  /** When the invoice reached the app. */
  receivedAt: Date
  qty: number
  lineTotal: number
  /** Printed price per billed unit. */
  unitPrice: number
  /** Line total / qty when that disagrees with the printed price, else null. */
  effectivePrice: number | null
}

export interface FormLine {
  id: string
  supplier: string
  name: string
  active: boolean
}

export type Why = "supplier" | "product"

export interface OffSheetRow {
  ruleId: string
  item: string
  dept: Dept
  venue: string
  boughtFrom: string
  /** Latest description bought. */
  product: string
  shouldBe: string
  shouldBeProduct: string
  why: Why
  /** "not Philly" etc. when why = product. */
  say: string | null
  /** The sheet names this supplier as the one not to use. */
  namedNotFrom: boolean
  switched: boolean
  lines: number
  /** yyyy-mm-dd invoice dates, sorted. */
  dates: string[]
  spend: number
  /** Dollars paid over the right supplier (negative = it was cheaper), null when not comparable. */
  extra: number | null
  /** Net per `per`, both sides, when comparable. */
  paidPer: number | null
  rightPer: number | null
  per: Per | null
  late: boolean
}

export interface BackupUse {
  item: string
  supplier: string
  when: string
  venue: string
  lines: number
}

export interface AuditResult {
  weekStartKey: string
  weekEndKey: string
  rows: OffSheetRow[]
  backups: BackupUse[]
  /** Sheet lines bought in the week (late ones included). */
  sheetLines: number
  rightLines: number
  offLines: number
  /** Distinct sheet items bought, and how many of those had any line off the sheet. */
  itemsBought: number
  itemsOff: number
  /** Sum of positive extras. */
  extraTotal: number
  /** Sum of negative extras, as a positive number. */
  cheaperTotal: number
  offSpend: number
  byVenue: Record<string, { lines: number; extra: number }>
}

/** kg, l, ea, or "u:<billed unit>" (per tray, per bunch) when no pack size is known. */
export type Per = string

const DAY = 86_400_000
const key = (d: Date) => d.toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Packs counted in each: "x 1000", "100's", "20x150's". */
function countPack(description: string): { qty: number; unit: "ea" } | null {
  const mult = description.match(/(\d+)\s*x\s*(\d+)\s*'?s\b/i)
  if (mult) return { qty: parseFloat(mult[1]) * parseFloat(mult[2]), unit: "ea" }
  const s = description.match(/\b(\d{2,5})\s*'s\b/i)
  if (s) return { qty: parseFloat(s[1]), unit: "ea" }
  const x = description.match(/\bx\s*(\d{2,5})\b(?!\s*(?:k?g|ml|l|lt|cm|mm|m)\b)/i)
  if (x) return { qty: parseFloat(x[1]), unit: "ea" }
  return null
}

type Pack = { qty: number; unit: "kg" | "l" | "ea" }

/** The billed unit, with a roll counted as one each. */
function billedUnit(unit: string | null): string {
  const u = normaliseUnit(unit)
  return u === "roll" || u === "rolls" ? "ea" : u
}

/** The pack size the description prints, if any. */
function packOf(description: string, countFirst = false): Pack | null {
  // Packaging: "500ml" on a cup is its size, the pieces in the box are the pack.
  const p = countFirst ? countPack(description) ?? parsePackSize(description) : parsePackSize(description) ?? countPack(description)
  return p && p.qty > 0 ? p : null
}

/**
 * The line's gross price per kg / L / each and how many of those it
 * bought. `learned` is the pack this supplier's fuller descriptions of the
 * same item print for the same billed unit (Bidfood "GHEE NEW ZEALAND" is
 * the 10 L bucket its other lines name). With no pack at all, the price
 * per billed unit (per tray, per bunch), comparable only with the same unit.
 */
export function priceBasis(
  l: Pick<AuditLine, "description" | "unit" | "qty" | "unitPrice" | "effectivePrice">,
  learned?: Pack | null,
  countFirst = false
): { per: Per; price: number; qty: number } | null {
  const eff = l.effectivePrice ?? l.unitPrice
  if (!(eff > 0) || !(l.qty > 0)) return null
  const u = billedUnit(l.unit)
  if (u === "kg") return { per: "kg", price: eff, qty: l.qty }
  if (u === "g") return { per: "kg", price: eff * 1000, qty: l.qty / 1000 }
  if (u === "l") return { per: "l", price: eff, qty: l.qty }
  if (u === "ml") return { per: "l", price: eff * 1000, qty: l.qty / 1000 }
  const pack = packOf(l.description, countFirst) ?? learned ?? null
  if (pack) return { per: pack.unit, price: eff / pack.qty, qty: l.qty * pack.qty }
  if (!u) return null
  return { per: `u:${u}`, price: eff, qty: l.qty }
}

const isPackaging = (rule: SheetRule) => rule.section === "Packaging and cleaning"

const packKey = (ruleId: string, supplier: string, unit: string | null) => `${ruleId}|${canonicalSupplier(supplier)}|${billedUnit(unit)}`

/** The pack each supplier prints for each sheet item and billed unit, from the lines that print one. */
export function learnPacks(lines: AuditLine[], rules: SheetRule[]): Map<string, Pack> {
  const seen = new Map<string, Map<string, { pack: Pack; n: number }>>()
  for (const l of lines) {
    const rule = ruleFor(l.description, rules)
    if (!rule) continue
    const pack = packOf(l.description, isPackaging(rule))
    if (!pack) continue
    const k = packKey(rule.id, l.supplierName, l.unit)
    const byPack = seen.get(k) ?? new Map<string, { pack: Pack; n: number }>()
    const pk = `${pack.qty}|${pack.unit}`
    const e = byPack.get(pk) ?? { pack, n: 0 }
    e.n++
    byPack.set(pk, e)
    seen.set(k, byPack)
  }
  const out = new Map<string, Pack>()
  for (const [k, byPack] of seen) {
    // One pack only: two sizes on the same billed unit leave a bare line unknown.
    if (byPack.size === 1) out.set(k, [...byPack.values()][0].pack)
  }
  return out
}

function basisFor(l: AuditLine, rule: SheetRule, packs: Map<string, Pack>) {
  const b = priceBasis(l, packs.get(packKey(rule.id, l.supplierName, l.unit)), isPackaging(rule))
  // Ghee: Bidfood sells a 10 L bucket, Provedores a 10 kg one, and we buy
  // them as the same thing (the sheet's +4% compares bucket to bucket).
  if (b && rule.litreIsKilo && b.per === "l") b.per = "kg"
  return b
}

const net = (gross: number, supplier: string) => gross * (1 - rebateFor(supplier) / 100)

type Verdict =
  | { kind: "right" }
  | { kind: "backup"; when: string }
  | { kind: "off"; why: Why; say: string | null }

/** Anything left once the plain item words, sizes and codes are gone (a brand, a range name). */
function namesSomething(description: string, generic: RegExp): boolean {
  const left = description
    .replace(/\[[^\]]*\]/g, " ")
    .replace(generic, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:x\s*\d+\s*)?(?:kgs?|gr|gms?|g|ml|lt|l|'s)?\b/gi, " ")
    .replace(/[^a-z]+/gi, " ")
    .trim()
  return left.length > 0
}

export function verdict(rule: SheetRule, supplierName: string, description: string): Verdict {
  const supplier = canonicalSupplier(supplierName)
  if (supplier === rule.orderFrom) {
    if (rule.only && !rule.only.match.test(description) && namesSomething(description, rule.only.generic)) {
      return { kind: "off", why: "product", say: rule.only.say }
    }
    return { kind: "right" }
  }
  const ok = rule.alsoOk?.find((a) => a.supplier === supplier)
  if (ok) return { kind: "backup", when: ok.when }
  return { kind: "off", why: "supplier", say: null }
}

export interface RefPrice {
  per: Per
  price: number
  from: "invoices" | "sheet"
}

/**
 * The right supplier's net price per unit for each rule, from our own
 * invoices, else the sheet. Kept per unit basis (kg and per tray can both
 * exist for produce), so an off-sheet line compares with the same basis.
 */
export function referencePrices(lines: AuditLine[], rules: SheetRule[], packs: Map<string, Pack> = learnPacks(lines, rules)): Map<string, Map<Per, RefPrice>> {
  const samples = new Map<string, Map<string, number[]>>()
  for (const l of lines) {
    const rule = ruleFor(l.description, rules)
    if (!rule || verdict(rule, l.supplierName, l.description).kind !== "right") continue
    const b = basisFor(l, rule, packs)
    if (!b) continue
    const byUnit = samples.get(rule.id) ?? new Map<string, number[]>()
    const a = byUnit.get(b.per) ?? []
    a.push(net(b.price, rule.orderFrom))
    byUnit.set(b.per, a)
    samples.set(rule.id, byUnit)
  }
  const out = new Map<string, Map<Per, RefPrice>>()
  for (const rule of rules) {
    const m = new Map<Per, RefPrice>()
    for (const [per, xs] of samples.get(rule.id) ?? []) m.set(per, { per, price: median(xs), from: "invoices" })
    // The sheet's per-unit price is already net of the rebate (Bidfood shown after its 4%).
    if (rule.per && !m.has(rule.per.unit)) m.set(rule.per.unit, { per: rule.per.unit, price: rule.per.price, from: "sheet" })
    if (m.size) out.set(rule.id, m)
  }
  return out
}

export function auditWeek(input: {
  lines: AuditLine[]
  weekStart: Date
  weekEnd: Date
  /** Invoices received after this count as late arrivals for the 3 weeks before. */
  lateSince: Date
  rules?: SheetRule[]
}): AuditResult {
  const rules = input.rules ?? SHEET
  const ws = input.weekStart.getTime()
  const we = input.weekEnd.getTime()
  const good = input.lines.filter((l) => l.qty > 0 && l.lineTotal > 0 && l.unitPrice > 0)
  const refLines = good.filter((l) => l.invoiceDate.getTime() <= we && l.invoiceDate.getTime() > we - REF_WINDOW_DAYS * DAY)
  const packs = learnPacks(good, rules)
  const refs = referencePrices(refLines, rules, packs)

  const inWeek = (l: AuditLine) => l.invoiceDate.getTime() >= ws && l.invoiceDate.getTime() <= we
  const isLate = (l: AuditLine) =>
    l.invoiceDate.getTime() < ws &&
    l.invoiceDate.getTime() >= ws - LATE_LOOKBACK_DAYS * DAY &&
    l.receivedAt.getTime() >= input.lateSince.getTime()

  const rows = new Map<string, OffSheetRow & { paidSum: number; qtySum: number }>()
  const backups = new Map<string, BackupUse>()
  const bought = new Set<string>()
  const off = new Set<string>()
  let sheetLines = 0
  let rightLines = 0
  let offLines = 0

  for (const l of good) {
    const late = isLate(l)
    if (!inWeek(l) && !late) continue
    const rule = ruleFor(l.description, rules)
    if (!rule) continue
    sheetLines++
    bought.add(rule.id)
    const v = verdict(rule, l.supplierName, l.description)
    const venue = l.venue ?? "Unknown"
    const supplier = canonicalSupplier(l.supplierName)
    if (v.kind === "right") {
      rightLines++
      continue
    }
    if (v.kind === "backup") {
      const k = `${rule.id}|${supplier}|${venue}`
      const b = backups.get(k)
      if (b) b.lines++
      else backups.set(k, { item: rule.item, supplier, when: v.when, venue, lines: 1 })
      continue
    }
    offLines++
    off.add(rule.id)
    const k = `${rule.id}|${venue}|${supplier}|${v.why}|${late ? 1 : 0}`
    const b = basisFor(l, rule, packs)
    const ref = b ? refs.get(rule.id)?.get(b.per) : undefined
    let lineExtra: number | null = null
    let paid: number | null = null
    if (ref && b && v.why === "supplier") {
      paid = net(b.price, supplier)
      const ratio = paid / ref.price
      if (ratio <= MAX_RATIO && ratio >= 1 / MAX_RATIO) lineExtra = (paid - ref.price) * b.qty
      else paid = null
    }
    const r = rows.get(k)
    const date = key(l.invoiceDate)
    if (r) {
      r.lines++
      if (!r.dates.includes(date)) r.dates.push(date)
      r.spend += l.lineTotal
      r.product = l.description
      // Priced lines add up; a line we could not price adds nothing.
      if (lineExtra != null) r.extra = (r.extra ?? 0) + lineExtra
      if (paid != null && b && ref) {
        if (r.per == null) {
          r.per = b.per
          r.rightPer = ref.price
        }
        if (r.per === b.per) {
          r.paidSum += paid * b.qty
          r.qtySum += b.qty
        }
      }
    } else {
      rows.set(k, {
        ruleId: rule.id,
        item: rule.item,
        dept: rule.dept,
        venue,
        boughtFrom: supplier,
        product: l.description,
        shouldBe: rule.orderFrom,
        shouldBeProduct: rule.product,
        why: v.why,
        say: v.say,
        namedNotFrom: rule.notFrom?.supplier === supplier,
        switched: !!rule.switched,
        lines: 1,
        dates: [date],
        spend: l.lineTotal,
        extra: lineExtra,
        paidPer: null,
        rightPer: paid != null && ref ? ref.price : null,
        per: paid != null && b ? b.per : null,
        late,
        paidSum: paid != null && b ? paid * b.qty : 0,
        qtySum: paid != null && b ? b.qty : 0,
      })
    }
  }

  const out: OffSheetRow[] = []
  const byVenue: AuditResult["byVenue"] = {}
  let extraTotal = 0
  let cheaperTotal = 0
  let offSpend = 0
  for (const r of rows.values()) {
    const { paidSum, qtySum, ...row } = r
    row.dates.sort()
    row.spend = round2(row.spend)
    if (row.extra != null && qtySum > 0) {
      row.extra = round2(row.extra)
      row.paidPer = paidSum / qtySum
    } else {
      row.extra = null
      row.paidPer = null
      row.rightPer = null
      row.per = null
    }
    if (row.extra != null && row.extra > 0) extraTotal += row.extra
    if (row.extra != null && row.extra < 0) cheaperTotal += -row.extra
    offSpend += row.spend
    const v = byVenue[row.venue] ?? { lines: 0, extra: 0 }
    v.lines += row.lines
    v.extra = round2(v.extra + Math.max(0, row.extra ?? 0))
    byVenue[row.venue] = v
    out.push(row)
  }
  // Dearest first; unpriced rows by spend after the priced ones that cost us.
  out.sort((a, b) => (b.extra ?? 0) - (a.extra ?? 0) || b.spend - a.spend)

  return {
    weekStartKey: key(input.weekStart),
    weekEndKey: key(input.weekEnd),
    rows: out,
    backups: [...backups.values()].sort((a, b) => b.lines - a.lines),
    sheetLines,
    rightLines,
    offLines,
    itemsBought: bought.size,
    itemsOff: off.size,
    extraTotal: round2(extraTotal),
    cheaperTotal: round2(cheaperTotal),
    offSpend: round2(offSpend),
    byVenue,
  }
}

export interface FormDrift {
  ruleId: string
  item: string
  formId: string
  supplier: string
  formName: string
  problem: "wrong-supplier-active" | "right-supplier-off" | "wrong-product-active"
}

/**
 * Does the app's ordering match the sheet? An order-form line staff can
 * pick (active) for a sheet item from another supplier lets them order it
 * from the wrong place; the right supplier's only line switched off leaves
 * them nothing to order.
 */
export function formDrift(forms: FormLine[], rules: SheetRule[] = SHEET): FormDrift[] {
  const out: FormDrift[] = []
  const byRule = new Map<string, FormLine[]>()
  for (const f of forms) {
    const rule = ruleFor(f.name, rules)
    if (!rule) continue
    const a = byRule.get(rule.id) ?? []
    a.push(f)
    byRule.set(rule.id, a)
  }
  for (const rule of rules) {
    const fs = byRule.get(rule.id) ?? []
    const own = fs.filter((f) => canonicalSupplier(f.supplier) === rule.orderFrom)
    for (const f of fs) {
      const v = verdict(rule, f.supplier, f.name)
      if (!f.active || v.kind === "right" || v.kind === "backup") continue
      out.push({
        ruleId: rule.id,
        item: rule.item,
        formId: f.id,
        supplier: canonicalSupplier(f.supplier),
        formName: f.name,
        problem: v.why === "product" ? "wrong-product-active" : "wrong-supplier-active",
      })
    }
    const ownRight = own.filter((f) => verdict(rule, f.supplier, f.name).kind === "right")
    // Only for suppliers staff order through the app: Gold Coast Premium
    // Foods has form lines but none switched on (ordered direct).
    const orderedInApp = forms.some((f) => f.active && canonicalSupplier(f.supplier) === rule.orderFrom)
    if (orderedInApp && ownRight.length > 0 && !ownRight.some((f) => f.active)) {
      const f = ownRight[0]
      out.push({ ruleId: rule.id, item: rule.item, formId: f.id, supplier: rule.orderFrom, formName: f.name, problem: "right-supplier-off" })
    }
  }
  return out
}
