export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowRight, Camera, Sparkles } from "lucide-react"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import {
  ensureStandingCommitments,
  getCommitmentsBoard,
} from "@/lib/actions/commitments"
import {
  COMMITMENT_PARTY_LABEL,
  effectiveDueOn,
  formatDayMonth,
  weekLabel,
} from "@/lib/commitments/shared"

/**
 * Read-only Said + Done board for the kitchen iPad — Jose's view of the
 * same sheet Chloe ticks from her phone. Marks are made on the admin
 * page; this page never mutates.
 */
export default async function KitchenCommitmentsPage() {
  await ensureStandingCommitments()
  const board = await getCommitmentsBoard({ maxWeeks: 8 })

  const sheetPhotoCount = board.photos.filter(
    (p) => p.weekStart === board.currentWeekStart
  ).length

  return (
    <div className="space-y-8">
      <KitchenBreadcrumb crumbs={[{ label: "Said + Done" }]} />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Said + Done
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          The commitments from the kitchen reset meeting, week by week. Y means
          it happened, N means it didn&apos;t — the point is that everyone sees
          the same sheet.
        </p>
      </div>

      {/* Standing grid (read-only) */}
      <div className="overflow-x-auto rounded-[16px] border border-[var(--tk-line)] bg-white">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr style={{ background: "var(--tk-bg)" }}>
              <th className="sticky left-0 min-w-[200px] px-5 py-3 text-left text-[12px] font-bold uppercase tracking-wider text-[var(--tk-ink-mute)]" style={{ background: "var(--tk-bg)" }}>
                Commitment
              </th>
              {board.weeks.map((w) => (
                <th
                  key={w}
                  className={`px-2 py-3 text-center text-[12px] font-bold uppercase tracking-wider ${
                    w === board.currentWeekStart
                      ? "text-[var(--tk-charcoal)]"
                      : "text-[var(--tk-ink-mute)]"
                  }`}
                >
                  {weekLabel(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.standing.map((row) => (
              <tr key={row.id} className="border-t border-[var(--tk-line)]">
                <td className="sticky left-0 bg-white px-5 py-3 text-[15px] font-semibold text-[var(--tk-charcoal)]">
                  {row.title}
                  {row.autoSource && (
                    <Sparkles className="ml-1.5 inline h-3.5 w-3.5 text-[var(--tk-ink-mute)]" />
                  )}
                </td>
                {board.weeks.map((w) => {
                  const cell = row.cells[w]
                  return (
                    <td key={w} className="px-2 py-2 text-center">
                      {cell.met === true ? (
                        <span
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold"
                          style={{ background: "var(--tk-done-soft)", color: "var(--tk-done)" }}
                          title={cell.note ?? undefined}
                        >
                          Y
                        </span>
                      ) : cell.met === false ? (
                        <span
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-[14px] font-bold text-red-700"
                          title={cell.note ?? undefined}
                        >
                          N
                        </span>
                      ) : (
                        <span className="text-[var(--tk-ink-mute)]">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* One-offs (read-only) */}
      <div className="space-y-3">
        <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
          One-off commitments
        </div>
        {board.oneOffs.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-8 text-center text-[15px] text-[var(--tk-ink-soft)]">
            Nothing on the list right now.
          </div>
        ) : (
          board.oneOffs.map((o) => (
            <div
              key={o.id}
              className="flex min-h-[72px] items-center gap-5 rounded-[16px] border bg-white px-5 py-4"
              style={{
                borderColor:
                  o.status === "overdue" ? "#c33d3d" : "var(--tk-line)",
                background: o.status === "overdue" ? "#fdf1f1" : "white",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]">
                  {o.promise}
                </div>
                <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
                  {COMMITMENT_PARTY_LABEL[o.saidBy]} · due{" "}
                  {formatDayMonth(effectiveDueOn(o))}
                  {o.newDueOn && ` (moved from ${formatDayMonth(o.dueOn)})`}
                  {o.doneOn && ` · done ${formatDayMonth(o.doneOn)}`}
                </div>
              </div>
              <div
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                style={
                  o.status === "done"
                    ? { background: "var(--tk-done-soft)", color: "var(--tk-done)" }
                    : o.status === "overdue"
                      ? { background: "#f6dcdc", color: "#9a2a2a" }
                      : { background: "var(--tk-charcoal-soft)", color: "var(--tk-ink-soft)" }
                }
              >
                {o.status === "done"
                  ? "Done"
                  : o.status === "overdue"
                    ? "Overdue"
                    : "Open"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Meeting actions (read-only) */}
      {board.meetingActions.length > 0 && (
        <div className="space-y-3">
          <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
            Meeting actions
          </div>
          {board.meetingActions.map((a) => (
            <div
              key={a.id}
              className="flex min-h-[64px] items-center gap-5 rounded-[16px] border bg-white px-5 py-4"
              style={{
                borderColor:
                  a.status === "overdue" ? "#c33d3d" : "var(--tk-line)",
                background: a.status === "overdue" ? "#fdf1f1" : "white",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]">
                  {a.action}
                </div>
                <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
                  {a.owner} · {a.sourceTag} · due {formatDayMonth(a.dueOn)}
                  {a.doneOn && ` · done ${formatDayMonth(a.doneOn)}`}
                </div>
              </div>
              <div
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                style={
                  a.status === "done"
                    ? { background: "var(--tk-done-soft)", color: "var(--tk-done)" }
                    : a.status === "overdue"
                      ? { background: "#f6dcdc", color: "#9a2a2a" }
                      : { background: "var(--tk-charcoal-soft)", color: "var(--tk-ink-soft)" }
                }
              >
                {a.status === "done"
                  ? "Done"
                  : a.status === "overdue"
                    ? "Overdue"
                    : "Open"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paper sheet photos */}
      <Link
        href="/kitchen/commitments/photos"
        className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
          style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
        >
          <Camera className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]">
            Photograph a paper sheet
          </div>
          <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
            Weekly update, issue + solution or fault report — snap it and
            it&apos;s filed to this week
            {sheetPhotoCount > 0
              ? ` · ${sheetPhotoCount} filed this week`
              : ""}
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
          <ArrowRight className="h-[18px] w-[18px]" />
        </div>
      </Link>
    </div>
  )
}
