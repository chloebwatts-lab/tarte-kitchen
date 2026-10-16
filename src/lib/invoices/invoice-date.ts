/**
 * Sanity guard for the invoice date Claude reads off a PDF.
 *
 * Cookers invoice 10224572 (emailed 8 Oct 2026, Currumbin, $618.43) parsed
 * with invoiceDate 2008-10-26, so it fell out of every spend week and the
 * Sunday COGS email silently undercounted Currumbin. A date that far from
 * the email it arrived in is a misread, never a real invoice date: suppliers
 * email within days of invoicing, and never weeks before.
 *
 * Window, measured in AEST calendar days: more than 60 days BEFORE the
 * email, or more than 7 days AFTER it, is rejected and replaced with the
 * email's own AEST date, with a note for the review queue. The 60-day tail
 * leaves room for a supplier re-sending an overdue invoice (and for the
 * backfill sweeps, which pass the real email date, not today).
 *
 * Pure module, no DB, so it is unit-tested in isolation.
 */

export const INVOICE_DATE_MAX_DAYS_BEFORE_EMAIL = 60
export const INVOICE_DATE_MAX_DAYS_AFTER_EMAIL = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** "YYYY-MM-DD" of `at` in Australia/Brisbane (no DST). */
export function aestYmd(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
}

export interface SanitisedInvoiceDate {
  /** What to store. UTC midnight of a calendar day, matching the @db.Date column. */
  date: Date | null
  /** True when the parsed date was rejected and the email date substituted. */
  adjusted: boolean
  /** Human note for the review queue when adjusted, else null. */
  note: string | null
}

/**
 * @param parsed   the parser's "YYYY-MM-DD" (or null)
 * @param emailDate when the email carrying the PDF arrived (Gmail internalDate);
 *                  for a re-parse from disk pass the row's createdAt
 */
export function sanitiseInvoiceDate(
  parsed: string | null | undefined,
  emailDate: Date
): SanitisedInvoiceDate {
  if (!parsed) return { date: null, adjusted: false, note: null }
  const emailDay = new Date(`${aestYmd(emailDate)}T00:00:00Z`)
  const parsedDay = new Date(`${parsed}T00:00:00Z`)
  if (Number.isNaN(parsedDay.getTime())) {
    return {
      date: emailDay,
      adjusted: true,
      note: `Invoice date "${parsed}" could not be read; set to the email date ${aestYmd(emailDate)}, check the PDF.`,
    }
  }
  const diffDays = Math.round((parsedDay.getTime() - emailDay.getTime()) / DAY_MS)
  if (
    diffDays < -INVOICE_DATE_MAX_DAYS_BEFORE_EMAIL ||
    diffDays > INVOICE_DATE_MAX_DAYS_AFTER_EMAIL
  ) {
    const when =
      diffDays < 0 ? `${-diffDays} days before` : `${diffDays} days after`
    return {
      date: emailDay,
      adjusted: true,
      note: `Invoice date read as ${parsed}, ${when} the email arrived; set to the email date ${aestYmd(emailDate)}, check the PDF.`,
    }
  }
  return { date: parsedDay, adjusted: false, note: null }
}
