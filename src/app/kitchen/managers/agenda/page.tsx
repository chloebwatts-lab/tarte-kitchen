export const dynamic = "force-dynamic"

import { requireManager } from "@/lib/manager-auth"
import { getAgenda } from "@/lib/actions/meetings"
import { MeetingAgenda } from "@/components/meeting-agenda"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

function nextMeeting(from = new Date()): Date {
  const d = new Date(from)
  for (let i = 0; i < 400; i++) {
    const month = d.getMonth()
    if (month % 3 === 2) {
      const first = new Date(d.getFullYear(), month, 1)
      const offset = (5 - first.getDay() + 7) % 7
      const thirdFriday = new Date(d.getFullYear(), month, 1 + offset + 14)
      if (thirdFriday >= new Date(from.getFullYear(), from.getMonth(), from.getDate())) return thirdFriday
    }
    d.setMonth(d.getMonth() + 1, 1)
  }
  return from
}

export default async function ManagerAgendaPage() {
  await requireManager("/kitchen/managers/agenda")
  const board = await getAgenda()
  const meeting = nextMeeting()
  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Meeting agenda" }]} />
      <div className="px-1">
        <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Meeting agenda
        </div>
        <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">
          Next: {meeting.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}, 3:30pm, Beach House.
        </p>
      </div>
      <MeetingAgenda board={board} meetingDate={meeting.toISOString()} />
    </div>
  )
}
