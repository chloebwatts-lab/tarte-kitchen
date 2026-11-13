export const dynamic = "force-dynamic"

import { requireGm } from "@/lib/gm-auth"
import { listSignOnsForFiling } from "@/lib/actions/council"
import { ASKS, STATUS_LABEL, isStatus } from "@/lib/council/sign-on"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { PrintButton } from "@/components/print-button"

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""

/** The filed copy: every signature with its business, plus who still needs a visit. */
export default async function GmCouncilSheetPage() {
  await requireGm("/kitchen/gm/council/sheet")
  const rows = await listSignOnsForFiling()
  const signed = rows.filter((r) => r.status === "signed")
  const others = rows.filter((r) => r.status !== "signed" && r.status !== "skip")
  const printed = when(new Date())

  return (
    <div className="mx-auto max-w-[960px] space-y-6 pb-16 print:max-w-none print:space-y-4">
      <div className="print:hidden">
        <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Council", href: "/kitchen/gm/council" }, { label: "Filed copy" }]} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tk-caps text-[var(--tk-ink-soft)]">Joint letter to City of Gold Coast</p>
          <h1 className="tk-display text-[34px] leading-tight">Burleigh roadside dining sign-on sheet</h1>
          <p className="text-[15px] text-[var(--tk-ink-soft)]">{signed.length} signed. Printed {printed}.</p>
        </div>
        <div className="print:hidden"><PrintButton /></div>
      </div>

      <section className="rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3">
        <p className="text-[15px] font-semibold">The businesses below ask Council to:</p>
        <ol className="mt-1 list-decimal pl-5 text-[15px]">{ASKS.map((a) => <li key={a}>{a}</li>)}</ol>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b-2 border-[var(--tk-charcoal)]">
              <th className="py-2 pr-3">Business</th>
              <th className="py-2 pr-3">Owner</th>
              <th className="py-2 pr-3">Permit</th>
              <th className="py-2 pr-3">During works</th>
              <th className="py-2 pr-3">After opening</th>
              <th className="py-2 pr-3">Now</th>
              <th className="py-2 pr-3">Setup h/day</th>
              <th className="py-2">Signature</th>
            </tr>
          </thead>
          <tbody>
            {signed.map((r) => (
              <tr key={r.id} className="break-inside-avoid border-b border-[var(--tk-line)] align-top">
                <td className="py-2 pr-3"><b>{r.name}</b><br /><span className="text-[var(--tk-ink-soft)]">{r.street}</span></td>
                <td className="py-2 pr-3">{r.owner}</td>
                <td className="py-2 pr-3">{r.permit}</td>
                <td className="py-2 pr-3">{r.worksPct}</td>
                <td className="py-2 pr-3">{r.openedPct}</td>
                <td className="py-2 pr-3">{r.nowPct}</td>
                <td className="py-2 pr-3">{r.setupHours}</td>
                <td className="py-2">
                  {r.signature ? <img src={r.signature} alt={`Signature, ${r.owner}`} className="h-[54px] w-auto max-w-[200px] bg-white" /> : null}
                  <span className="block text-[12px] text-[var(--tk-ink-soft)]">{when(r.signedAt)}</span>
                </td>
              </tr>
            ))}
            {!signed.length ? (
              <tr><td colSpan={8} className="py-6 text-center text-[var(--tk-ink-soft)]">No signatures yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {others.length ? (
        <section className="break-before-page">
          <h2 className="tk-display text-[22px]">Still open</h2>
          <ul className="mt-2 columns-1 gap-6 text-[14px] sm:columns-2">
            {others.map((r) => (
              <li key={r.id} className="break-inside-avoid py-0.5">
                <b>{r.name}</b> · {isStatus(r.status) ? STATUS_LABEL[r.status] : r.status}{r.note ? ` · ${r.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
