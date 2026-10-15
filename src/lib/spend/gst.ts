/**
 * GST helpers for invoice amounts. A plain module: current-week.ts is
 * "use server" and may only export async functions, which is why this
 * lives here (Turbopack refused the build on 16 Oct 2026).
 */
/**
 * Ex-GST amount for an invoice. Prefers the parsed subtotal; when the
 * parser found no subtotal line, strip GST from the inc-GST total (÷1.1)
 * unless the invoice explicitly carries zero GST (GST-free suppliers),
 * in which case the total already IS ex GST. Counting a raw inc-GST
 * total as ex-GST inflated spend by 10% on those invoices.
 */
export function exGstInvoiceAmount(inv: {
  subtotal: { toString(): string } | null
  total: { toString(): string } | null
  gst: { toString(): string } | null
}): number {
  if (inv.subtotal != null) return Number(inv.subtotal)
  const total = Number(inv.total ?? 0)
  if (inv.gst != null && Number(inv.gst) === 0) return total
  return total / 1.1
}
