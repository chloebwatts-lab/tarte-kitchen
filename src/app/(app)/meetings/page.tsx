export const dynamic = "force-dynamic"

import { getAgenda } from "@/lib/actions/meetings"
import { MeetingAgenda } from "@/components/meeting-agenda"

const full = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Australia/Brisbane",
})

/** Quarterly, third Friday of Mar / Jun / Sep / Dec. */
function nextMeeting(from = new Date()): Date {
  const d = new Date(from)
  for (let i = 0; i < 400; i++) {
    const month = d.getMonth()
    if (month % 3 === 2) {
      const first = new Date(d.getFullYear(), month, 1)
      const offset = (5 - first.getDay() + 7) % 7
      const thirdFriday = new Date(d.getFullYear(), month, 1 + offset + 14)
      if (
        thirdFriday >=
        new Date(from.getFullYear(), from.getMonth(), from.getDate())
      ) {
        return thirdFriday
      }
    }
    d.setMonth(d.getMonth() + 1, 1)
  }
  return from
}

export default async function MeetingsPage() {
  const board = await getAgenda()
  const meeting = nextMeeting()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Management meeting
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Next: {full.format(meeting)}, 3:30pm at Beach House. Standing agenda is
          on the calendar invite; everything below is what people have raised.
        </p>
      </div>
      <MeetingAgenda board={board} meetingDate={meeting.toISOString()} />
    </div>
  )
}
