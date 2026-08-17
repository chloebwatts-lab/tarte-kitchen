"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  Send,
  Truck,
} from "lucide-react"
import {
  sendSupplierOrder,
  type EodSheet,
  type EodSupplierOrder,
} from "@/lib/actions/dept-orders"
import { DEPT_COLOR, DEPT_LABEL } from "@/lib/departments"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"

const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/**
 * The main orderer's end-of-day view. Departments enter and approve their
 * own lists; this regroups everything by supplier so each supplier gets one
 * order, and shows which section asked for what so a surprise line can be
 * chased to a person rather than argued about.
 */
export function DeptOrderSheet({ initialSheet }: { initialSheet: EodSheet }) {
  const [sheet, setSheet] = useState(initialSheet)
  const [name, setName] = useRememberedName()
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(initialSheet.suppliers.filter((s) => !s.sent).map((s) => s.supplierId))
  )

  const waiting = sheet.waitingOn
  const pending = sheet.suppliers.filter((s) => !s.sent)
  const sent = sheet.suppliers.filter((s) => s.sent)

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSend(supplier: EodSupplierOrder, force: boolean) {
    if (!name.trim()) {
      setError("Put your name in first")
      return
    }
    setSending(supplier.supplierId)
    setError(null)
    setNote(null)
    const res = await sendSupplierOrder({
      venue: sheet.venue,
      supplierId: supplier.supplierId,
      by: name.trim(),
      force,
    })
    setSending(null)
    if (!res.ok) {
      setError(res.error ?? "Couldn't send")
      return
    }
    setNote(
      res.emailed
        ? `${supplier.supplierName} order emailed to ${res.to}`
        : `${supplier.supplierName} order raised, but the email didn't go. Send it from Orders in admin.`
    )
    // Move the card to "sent" without a full reload, the page refetches on
    // next navigation anyway.
    setSheet((s) => ({
      ...s,
      suppliers: s.suppliers.map((x) =>
        x.supplierId === supplier.supplierId && !x.sent
          ? {
              ...x,
              lines: [],
              sent: {
                orderId: "",
                at: new Date().toISOString(),
                by: name.trim(),
                emailed: res.emailed ?? false,
              },
            }
          : x
      ),
      grandTotal:
        Math.round((s.grandTotal - supplier.total) * 100) / 100,
    }))
  }

  return (
    <div className="space-y-5 pb-16">
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-[15px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)] sm:max-w-[260px]"
        />
      </div>

      {error && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}
      {note && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "var(--tk-done-soft)", color: "var(--tk-done)" }}
        >
          <Check className="h-5 w-5 shrink-0" />
          {note}
        </div>
      )}

      {waiting.length > 0 && (
        <div
          className="rounded-[16px] px-5 py-4"
          style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
        >
          <div className="flex items-center gap-2.5 text-[15px] font-semibold">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Waiting on{" "}
            {waiting
              .map(
                (w) =>
                  `${DEPT_LABEL[w.dept]}${w.ownerName ? ` (${w.ownerName})` : ""}`
              )
              .join(", ")}
          </div>
          <p className="mt-1.5 text-[14px]">
            Sending now means their items miss this order. If they&apos;ve gone
            home and a cutoff is coming, use &ldquo;Send anyway&rdquo;.
          </p>
        </div>
      )}

      {pending.length === 0 && sent.length === 0 && (
        <div className="rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-12 text-center">
          <div className="text-[17px] font-semibold text-[var(--tk-charcoal)]">
            Nothing to order yet
          </div>
          <p className="mt-1.5 text-[15px] text-[var(--tk-ink-soft)]">
            Sections&apos; lists show up here as they approve them.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex items-baseline justify-between px-1">
          <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
            To send
          </div>
          <div className="text-[15px] font-semibold text-[var(--tk-charcoal)] tabular-nums">
            ${sheet.grandTotal.toFixed(2)} ex GST
          </div>
        </div>
      )}

      {pending.map((supplier) => {
        const isOpen = open.has(supplier.supplierId)
        return (
          <div
            key={supplier.supplierId}
            className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white"
          >
            <button
              onClick={() => toggle(supplier.supplierId)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <div
                  className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {supplier.supplierName}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {supplier.depts.map((d) => (
                    <span
                      key={d}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{
                        background: DEPT_COLOR[d].bg,
                        color: DEPT_COLOR[d].fg,
                      }}
                    >
                      {DEPT_LABEL[d]}
                    </span>
                  ))}
                  {supplier.deliveryDays.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-[var(--tk-ink-soft)]">
                      <Truck className="h-3.5 w-3.5" />
                      {supplier.deliveryDays.map((d) => DAY_SHORT[d]).join(" ")}
                      {supplier.orderCutoffHour != null
                        ? ` · cutoff ${supplier.orderCutoffHour}:00`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[17px] font-semibold text-[var(--tk-charcoal)] tabular-nums">
                  ${supplier.total.toFixed(2)}
                </div>
                <div className="text-[13px] text-[var(--tk-ink-soft)]">
                  {supplier.lines.length} line
                  {supplier.lines.length === 1 ? "" : "s"}
                </div>
              </div>
              {isOpen ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-[var(--tk-ink-soft)]" />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-[var(--tk-ink-soft)]" />
              )}
            </button>

            {isOpen && (
              <div className="border-t border-[var(--tk-line)]">
                {supplier.lines.map((line) => {
                  const split = line.contributions.length > 1
                  return (
                    <div
                      key={line.approvedItemId}
                      className="flex items-start gap-3 border-b border-[var(--tk-line)] px-5 py-3 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium leading-snug text-[var(--tk-charcoal)]">
                          {line.name}
                          {line.packSize ? (
                            <span className="ml-1.5 text-[13px] font-normal text-[var(--tk-ink-soft)]">
                              {line.packSize}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--tk-ink-soft)]">
                          {line.contributions.map((c, i) => (
                            <span key={`${c.dept}-${i}`}>
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background: DEPT_COLOR[c.dept].bg,
                                  color: DEPT_COLOR[c.dept].fg,
                                }}
                              >
                                {DEPT_LABEL[c.dept]}
                              </span>
                              {split ? ` ${c.quantity}` : ""}
                              {c.by ? ` · ${c.by}` : ""}
                              {c.note ? ` · ${c.note}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
                          {line.quantity} ×
                        </div>
                        <div className="text-[13px] text-[var(--tk-ink-soft)]">
                          ${line.lineTotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )
                })}

                <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--tk-bg)] px-5 py-4">
                  <div className="text-[13px] text-[var(--tk-ink-soft)]">
                    {supplier.supplierEmail ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {supplier.supplierEmail}
                      </span>
                    ) : (
                      <span className="font-medium" style={{ color: "#8a6d1f" }}>
                        No email on file, add one in Suppliers first
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleSend(supplier, waiting.length > 0)}
                    disabled={
                      sending === supplier.supplierId || !supplier.supplierEmail
                    }
                    className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
                    style={{
                      background:
                        waiting.length > 0 ? "#8a6d1f" : "var(--tk-charcoal)",
                    }}
                  >
                    {sending === supplier.supplierId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {waiting.length > 0
                      ? "Send anyway"
                      : `Send ${supplier.supplierName} order`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {sent.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
            Sent today
          </div>
          {sent.map((s, i) => (
            <div
              key={`${s.supplierId}-${i}`}
              className="flex items-center gap-4 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "var(--tk-done-soft)",
                  color: "var(--tk-done)",
                }}
              >
                <Check className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
                  {s.supplierName}
                </div>
                <div className="text-[13px] text-[var(--tk-ink-soft)]">
                  ${s.total.toFixed(2)}
                  {s.sent?.by ? ` · ${s.sent.by}` : ""}
                  {" · "}
                  {s.sent?.emailed ? "emailed" : "not emailed yet"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
