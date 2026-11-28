/**
 * Reads a Squarespace "A New Order has Arrived (03032)" email (hello@) into
 * the items pastry has to make. Pure, so it is unit tested against the real
 * layouts (src/lib/cakes/squarespace.test.ts, names made up).
 *
 * What the email holds, flattened to one line:
 *   Order #03032. Placed on November 24, 2026 at 6:19 PM GMT+10. ...
 *   BILLED TO: PICKUP OPTION: <name> <address> <payment> <email> [+61...]
 *   Currumbin Beach House Pickup Information: 4/4 Thrower Drive Currumbin ...
 *   ITEM QTY UNIT PRICE SUBTOTAL
 *   <product> SQ<sku> <options or form fields> <qty> A$<unit> A$<subtotal>   (repeats)
 *   Item Subtotal ...
 *   Requested Pickup Date: <free text> Requested Pickup Time: 13:00 Extra Notes: <free text> blog • Help Center ...
 *
 * Item form fields come in two shapes: "Name: Date: 11/27/2026 (US M/D/Y)
 * Time: 8:30am Number: Location:" and "Location: Date: 24 DEC 2026 Pick up
 * Time: 9:00am Confirmation: Contact Number:". The item's own date and place
 * win over the order's free-text pickup box; any disagreement goes into a
 * check note so a person looks before it is made.
 */

export type CakeVenue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

export interface WebsiteItem {
  product: string
  /** Options and anything that is not a form field: "Raspberries / 6 Inch / Dulce De Leche". */
  details: string | null
  quantity: number
  venue: CakeVenue | null
  /** YYYY-MM-DD */
  pickupDate: string | null
  /** HH:MM, 24 hour */
  pickupTime: string | null
  customerName: string
  customerPhone: string | null
  checkNotes: string[]
}

export interface WebsiteOrder {
  orderNo: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  venue: CakeVenue | null
  /** What the customer typed in the pickup date box. */
  requestedDateRaw: string | null
  requestedTime: string | null
  notes: string | null
  /** Every item on the order, gift cards included (see isMadeToOrder). */
  items: WebsiteItem[]
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"

/** Entities and runs of whitespace out, so every layout reads as one line. */
export function flatten(text: string): string {
  return text
    .replace(/&nbsp;| /gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;|&lsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
}

/** Burleigh, Currumbin (Beach House) or the Tea Garden, from an address or a place name. */
export function venueFromText(text: string | null | undefined): CakeVenue | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (/tea garden/.test(t)) return "TEA_GARDEN"
  if (/burleigh|west st/.test(t)) return "BURLEIGH"
  if (/currumbin|beach house|thrower/.test(t)) return "BEACH_HOUSE"
  return null
}

const pad = (n: number) => String(n).padStart(2, "0")

function validDate(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2100)) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** A year-less date means the next one on or after the order (30 days' grace for a late email). */
function withYear(m: number, d: number, orderDay: string): string | null {
  const y = Number(orderDay.slice(0, 4))
  const same = validDate(y, m, d)
  if (!same) return null
  const daysBefore = (Date.parse(orderDay) - Date.parse(same)) / 86_400_000
  return daysBefore > 30 ? validDate(y + 1, m, d) : same
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

/** "8:30am", "2:00pm", "12pm", "13:00", "8.30 am" to "08:30". */
export function parseTime(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?/i)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const ap = (m[3] ?? "").toLowerCase()
  if (!m[2] && !ap) return null
  if (ap === "pm" && h < 12) h += 12
  if (ap === "am" && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

/** The item form's Date field: US "11/27/2026" or "24 DEC 2026". */
export function parseItemDate(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim()
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) return validDate(Number(us[3]), Number(us[1]), Number(us[2]))
  const dmy = t.match(new RegExp(`^(\\d{1,2})\\s+${MONTH_RE}\\w*\\s+(\\d{4})`, "i"))
  if (dmy) return validDate(Number(dmy[3]), MONTHS[dmy[2].slice(0, 3).toLowerCase()], Number(dmy[1]))
  return null
}

/**
 * Every date an Australian customer wrote in free text: "29/11/2026",
 * "Friday 20.11.26", "28th November", "Tuesday, 17 November 2026",
 * "November 20", "26th Nov". Day first for numbers.
 */
export function datesInText(text: string | null | undefined, orderDay: string): string[] {
  if (!text) return []
  const found: string[] = []
  const add = (d: string | null) => {
    if (d && !found.includes(d)) found.push(d)
  }
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
    add(validDate(fullYear(m[3]), Number(m[2]), Number(m[1])))
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b\\.?(?:,?\\s+(\\d{4}))?`, "gi"))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
    add(m[3] ? validDate(Number(m[3]), mon, Number(m[1])) : withYear(mon, Number(m[1]), orderDay))
  }
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "gi"))) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()]
    add(m[3] ? validDate(Number(m[3]), mon, Number(m[2])) : withYear(mon, Number(m[2]), orderDay))
  }
  return found
}

/** A pickup box that is only a date (and maybe a weekday), so no person needs to read it. */
export function isPlainDate(raw: string): boolean {
  const rest = raw
    .toLowerCase()
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{4}\\b|${MONTH_RE}\\w*`, "gi"), " ")
    .replace(/\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b|\bof\b/g, " ")
    .replace(/[,.()\s]+/g, "")
  return rest.length === 0
}

function titleCase(name: string): string {
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name
  return name.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
}

const PHONE_RE = /(\+61[\d ]{8,12}\d|\b0[2-9](?:\s?\d){8}\b)/

function phoneIn(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(PHONE_RE)
  return m ? m[1].replace(/\s+/g, " ").trim() : null
}

const FIELD_RE = /\b(Name|Date|Pick ?up Time|Time|Contact Number|Number|Location|Confirmation):/gi

function splitFields(text: string): { head: string; fields: Record<string, string> } {
  const marks = [...text.matchAll(FIELD_RE)]
  if (!marks.length) return { head: text.trim(), fields: {} }
  const head = text.slice(0, marks[0].index).trim()
  const fields: Record<string, string> = {}
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length
    let key = m[1].toLowerCase().replace(/\s+/g, "")
    if (key === "pickuptime") key = "time"
    if (key === "contactnumber") key = "number"
    if (!(key in fields)) fields[key] = text.slice(start, end).trim()
  })
  return { head, fields }
}

const BEFORE_ORDER = "That date is before the order was placed."
/** A pickup further out than this from the order is probably the wrong year. */
const FAR_AHEAD_DAYS = 183
/** How old an order with no usable date may be and still come in. */
const UNDATED_DAYS = 30

/**
 * What the import does with one item. A date before the order was placed is
 * a misread (US style "12/5/2026", last year's date typed in January): it
 * comes in with no date, in red, so a person sets it. A real date already
 * gone (a catch-up run) stays out. No date at all comes in when the order is
 * from the last 30 days.
 */
export function importDecision(
  it: Pick<WebsiteItem, "pickupDate" | "checkNotes">,
  orderDay: string,
  today: string
): { keep: boolean; pickupDate: string | null; checkNotes: string[] } {
  // Undated items from a long catch-up: only orders from the last 30 days, not two months of old ones.
  const recent = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${orderDay}T00:00:00Z`)) / 86_400_000 <= UNDATED_DAYS
  if (it.pickupDate && it.pickupDate < orderDay) {
    return {
      keep: recent,
      pickupDate: null,
      checkNotes: [...it.checkNotes.filter((n) => n !== BEFORE_ORDER), `We read the pickup date as ${it.pickupDate}, before the order was placed. Set the right date.`],
    }
  }
  if (it.pickupDate && it.pickupDate < today) return { keep: false, pickupDate: it.pickupDate, checkNotes: it.checkNotes }
  return { keep: it.pickupDate ? true : recent, pickupDate: it.pickupDate, checkNotes: it.checkNotes }
}

/** Gift cards are not made by anyone, so they never reach the cake list. */
export function isMadeToOrder(product: string): boolean {
  return !/gift ?card|e-?gift|voucher/i.test(product)
}

const VENUE_WORD: Record<CakeVenue, string> = { BURLEIGH: "Burleigh", BEACH_HOUSE: "Currumbin", TEA_GARDEN: "the Tea Garden" }

/**
 * @param orderDay the Brisbane day the order was placed (YYYY-MM-DD), for
 * year-less dates.
 */
export function parseWebsiteOrder(raw: string, orderDay: string, subject = ""): WebsiteOrder | null {
  const text = flatten(raw)
  const orderNo = text.match(/Order #\s?(\d{3,7})/i)?.[1] ?? subject.match(/\((\d{3,7})\)/)?.[1]
  if (!orderNo) return null

  // Who and where, from BILLED TO up to the pickup address.
  const billed = text.match(/BILLED TO:?\s*(.*?)\s*Pickup Information:?/i)?.[1] ?? ""
  const billedBody = billed.replace(/^PICKUP OPTION:?\s*/i, "")
  const customerEmail = billedBody.match(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase() ?? null
  // The name runs up to the address: a house number, "P.O.Box 93", "Unit 4", or the email when there is no address.
  const nameRaw =
    billedBody.match(
      /^(\p{L}[\p{L}'&. -]*?)(?=\s+\d|\s+[Pp]\.?\s?[Oo]\.?\s?[Bb]ox\b|\s+(?:Unit|Suite|Shop|Lot|Level|Locked Bag)\s+\d|\s+(?:Apple Pay|Google Pay|CC:)|\s+[\w.+'-]+@|$)/u
    )?.[1]?.trim() ?? ""
  const pickupAddress = text.match(/Pickup Information:?\s*(.{0,90})/i)?.[1] ?? ""
  // The place name just before "Pickup Information" ("Currumbin Beach House"), then the address after it.
  const placeName = billed.split(/\s+/).slice(-3).join(" ")
  const venue = venueFromText(pickupAddress) ?? venueFromText(placeName)
  const customerPhone = phoneIn(billedBody.replace(customerEmail ?? "\u0000", " "))

  const requestedDateRaw = text.match(/Requested Pickup Date:?\s*(.*?)\s*(?:Requested Pickup Time|Extra Notes|blog •|$)/i)?.[1]?.trim() || null
  const requestedTime = parseTime(text.match(/Requested Pickup Time:?\s*([0-9:.apm ]{3,10})/i)?.[1])
  const notes = text.match(/Extra Notes:?\s*(.*?)\s*(?:blog •|Help Center|$)/i)?.[1]?.trim() || null

  const section = text.match(/ITEM QTY UNIT PRICE SUBTOTAL\s*(.*?)\s*Item Subtotal/i)?.[1] ?? ""
  const requestedDates = datesInText(requestedDateRaw, orderDay)

  // First pass: each line's own options and form fields.
  const lines = [...section.matchAll(/\s*(.+?)\s+SQ\d{4,10}\b\s*(.*?)\s*(\d{1,3})\s+A\$\s?[\d,]+\.\d{2}\s+A\$\s?[\d,]+\.\d{2}/g)].map((m) => ({
    product: m[1].trim(),
    quantity: Math.max(1, Number(m[3]) || 1),
    ...splitFields(m[2]),
  }))
  // A line with no form fields borrows the name and number from the rest of the order.
  const orderName = titleCase(nameRaw || lines.find((l) => l.fields.name)?.fields.name || "Website customer")
  const orderPhone = customerPhone ?? lines.map((l) => phoneIn(l.fields.number)).find(Boolean) ?? null
  const lineDates = [...new Set(lines.map((l) => parseItemDate(l.fields.date)).filter((d): d is string => !!d))]
  const lineVenues = [...new Set(lines.map((l) => venueFromText(l.fields.location)).filter((v): v is CakeVenue => !!v))]

  const items: WebsiteItem[] = lines.map(({ product, quantity, head, fields }) => {
    const checkNotes: string[] = []

    let itemVenue = venueFromText(fields.location)
    if (itemVenue && venue && itemVenue !== venue) {
      checkNotes.push(`The order says pick up at ${VENUE_WORD[venue]}, the item says ${VENUE_WORD[itemVenue]}. Check with the customer.`)
    } else if (!itemVenue && lineVenues.length === 1 && lineVenues[0] !== venue) {
      // No place on this line, but every other item names the same one: it goes with them.
      itemVenue = lineVenues[0]
      if (venue) {
        checkNotes.push(
          `No pickup place on this item, so it goes with the rest of the order (${VENUE_WORD[itemVenue]}). The order says ${VENUE_WORD[venue]}. Check with the customer.`
        )
      }
    }

    const future = requestedDates.filter((d) => d >= orderDay)
    let pickupDate = parseItemDate(fields.date)
    if (pickupDate) {
      if (requestedDates.length && !requestedDates.includes(pickupDate)) {
        checkNotes.push(`The customer also wrote "${requestedDateRaw}" in the pickup date box.`)
      }
    } else if (future.length === 1) {
      pickupDate = future[0]
      if (requestedDateRaw && !isPlainDate(requestedDateRaw)) checkNotes.push(`Date read from what the customer wrote: "${requestedDateRaw}".`)
    } else if (lineDates.length === 1) {
      pickupDate = lineDates[0]
      checkNotes.push(`No date on this item, so it has the date from the rest of the order. The customer wrote "${requestedDateRaw ?? ""}" in the pickup date box.`)
    } else if (requestedDates.length) {
      pickupDate = future[0] ?? requestedDates[0]
      checkNotes.push(`The customer wrote "${requestedDateRaw}". Check which date is for this item.`)
    } else {
      checkNotes.push(requestedDateRaw ? `No pickup date we could read. The customer wrote: "${requestedDateRaw}".` : "No pickup date on the order.")
    }
    if (pickupDate && pickupDate < orderDay) checkNotes.push(BEFORE_ORDER)
    // The wrong year in the date picker ("12/24/2027" for this Christmas) would hide it a year out.
    if (pickupDate && (Date.parse(`${pickupDate}T00:00:00Z`) - Date.parse(`${orderDay}T00:00:00Z`)) / 86_400_000 > FAR_AHEAD_DAYS) {
      checkNotes.push("That date is more than six months after the order was placed. Check the year with the customer.")
    }

    return {
      product,
      details: head || null,
      quantity,
      venue: itemVenue ?? venue,
      pickupDate,
      pickupTime: parseTime(fields.time) ?? requestedTime,
      customerName: titleCase(fields.name && !nameRaw ? fields.name : orderName),
      customerPhone: phoneIn(fields.number) ?? orderPhone,
      checkNotes,
    }
  })

  return {
    orderNo,
    customerName: orderName,
    customerEmail,
    customerPhone: orderPhone,
    venue,
    requestedDateRaw,
    requestedTime,
    notes,
    items,
  }
}
