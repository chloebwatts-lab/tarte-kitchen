import { APP_URL, BRAND, FONT_BODY, button, callout, esc, para, pill, section, shell, table, tiles, type Tone } from "@/lib/email/brand"
import {
  STAGES,
  changesSince,
  checkLabel,
  longDay,
  niceTime,
  signed,
  type HighTeaDay,
  type HighTeaStage,
  type SnapshotItem,
} from "./prep"

export const HIGH_TEA_TO = ["hello@tarte.com.au", "shawna@tarte.com.au"]

export function highTeaRecipients(): string[] {
  const list = (process.env.HIGH_TEA_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return list.length ? list : HIGH_TEA_TO
}

export interface Earlier {
  stage: HighTeaStage
  guests: number
  items: SnapshotItem[]
}

/**
 * One email per stage for one service day. 48H is the first list, 24H
 * shows what moved since it, 12H says whether the list that went to pastry
 * still matches the bookings.
 */
export function renderHighTeaEmail(
  d: HighTeaDay,
  stage: HighTeaStage,
  earlier: Earlier | null
): { subject: string; html: string; text: string } {
  const s = STAGES[stage]
  const dayLabel = longDay(d.day)
  const now = d.lines.map((l) => ({ name: l.name, total: l.total }))
  const changes = earlier ? changesSince(earlier.items, now) : []
  const guestDelta = earlier ? d.guests - earlier.guests : 0
  const changed = changes.length > 0
  const delta = new Map(changes.map((c) => [c.name, c.delta]))

  let headline: { text: string; tone: Tone }
  if (stage === "48H" || !earlier) {
    headline = { text: `First list for ${dayLabel}. It updates 24 hours out and is checked again 12 hours out.`, tone: "sage" }
  } else if (!changed) {
    headline = {
      text: stage === "12H" ? "In line. Bookings still match the list that went out. Nothing to change." : "No change since the first list.",
      tone: "done",
    }
  } else {
    const g = guestDelta === 0 ? "Guest numbers moved" : `${Math.abs(guestDelta)} ${guestDelta > 0 ? "more" : "fewer"} guest${Math.abs(guestDelta) === 1 ? "" : "s"}`
    headline = {
      text: stage === "12H"
        ? `Out of line. ${g} since the ${STAGES[earlier.stage].label.toLowerCase()}. Adjust the amounts marked below.`
        : `${g} since the first list. The amounts marked below have changed.`,
      tone: stage === "12H" ? "red" : "warn",
    }
  }

  const subject =
    `High tea prep, ${dayLabel}: ${d.guests} guest${d.guests === 1 ? "" : "s"}` +
    (stage === "48H" ? " (first list)" : changed ? ` (${stage === "12H" ? "check" : "update"}: changed)` : ` (${stage === "12H" ? "check: in line" : "update: no change"})`)

  const listCard = d.lines.length
    ? section(
        "Pastry to make",
        table(
          [
            { header: "Item" },
            { header: "Bookings", align: "right" },
            { header: "Extra", align: "right" },
            { header: "Make", align: "right" },
            ...(earlier ? [{ header: "Change", align: "right" as const }] : []),
          ],
          d.lines.map((l) => {
            const ch = delta.get(l.name)
            return [
              { text: l.name, strong: true },
              String(l.forBookings),
              `+${l.extra}`,
              { text: String(l.total), strong: true },
              ...(earlier ? [ch ? { text: signed(ch), tone: (ch > 0 ? "warn" : "red") as Tone, strong: true } : { text: "" }] : []),
            ]
          })
        ) +
          `<div style="margin-top:10px">${para(`Extra is ${d.extra} of each for walk-ins (${d.weekend ? "weekend" : "weekday"}).`, { muted: true })}</div>`,
        { note: `${d.guests} guests` }
      )
    : section("Pastry to make", para("The stand items have not been loaded yet, so there are no amounts. Guest numbers below are live."))

  const bookingRow = (b: HighTeaDay["bookings"][number]) => {
    const tone: Tone = !b.checked ? "gold" : b.highTeaPax === 0 ? "red" : "done"
    const extraBits = [b.tags, b.notes].filter(Boolean).join(". ")
    return `<tr>
<td valign="top" style="padding:9px 8px 9px 0;border-top:1px solid ${BRAND.line};font-family:${FONT_BODY};font-size:13px;color:${BRAND.inkSoft};white-space:nowrap;width:64px">${esc(niceTime(b.time))}</td>
<td valign="top" style="padding:9px 8px;border-top:1px solid ${BRAND.line};font-family:${FONT_BODY}">
  <div style="font-size:15px;font-weight:700;color:${BRAND.ink};line-height:1.35">${esc(b.name)} <span style="font-weight:400;color:${BRAND.inkSoft}">&middot; ${b.pax} guest${b.pax === 1 ? "" : "s"}</span></div>
  <div style="margin-top:4px">${pill(checkLabel(b), tone)}${b.unconfirmed ? ` ${pill("Unconfirmed booking", "warn")}` : ""}</div>
  ${extraBits ? `<div style="margin-top:5px;font-size:13px;line-height:1.4;color:${BRAND.inkSoft}">${esc(extraBits)}</div>` : ""}
</td>
</tr>`
  }
  const bookingsCard = section(
    "Bookings",
    d.bookings.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${d.bookings.map(bookingRow).join("")}</table>`
      : para("No high tea bookings for this day. The list is the walk-in extras only."),
    { note: `${d.bookings.length} booking${d.bookings.length === 1 ? "" : "s"}` }
  )

  const url = `${APP_URL}/kitchen/high-tea?day=${d.day}`
  const nudge =
    d.uncheckedBookings > 0 && stage !== "48H"
      ? callout(
          `${d.uncheckedBookings} booking${d.uncheckedBookings === 1 ? " has" : "s have"} not been checked for full high tea or not. Until they are, the list assumes everyone booked is having it.`,
          "gold",
          { label: "Still to confirm" }
        )
      : ""

  const html = shell({
    kicker: `Tea Garden high tea · ${s.label}, ${s.out}`,
    title: dayLabel,
    preheader: headline.text,
    sections: [
      tiles([
        { label: "Guests having high tea", value: String(d.guests), sub: d.guests !== d.bookedGuests ? `${d.bookedGuests} booked` : undefined },
        { label: "Unconfirmed guests", value: String(d.unconfirmedGuests), tone: d.unconfirmedGuests ? "warn" : "done" },
      ]),
      callout(headline.text, headline.tone),
      nudge,
      listCard,
      bookingsCard,
      button("Open the high tea prep page", url),
    ].filter(Boolean),
    footer: "Built from Now Book It bookings. First list 48 hours out, update 24 hours out, check 12 hours out. Sent by Tarte Kitchen.",
  })

  const text = [
    `Tea Garden high tea, ${dayLabel}. ${s.label}, ${s.out}.`,
    `${d.guests} guests having high tea (${d.unconfirmedGuests} unconfirmed).`,
    headline.text,
    "",
    ...d.lines.map((l) => `${l.name}: make ${l.total} (${l.forBookings} for bookings + ${l.extra} extra)${delta.get(l.name) ? ` [${signed(delta.get(l.name)!)}]` : ""}`),
    "",
    ...d.bookings.map((b) => `${niceTime(b.time)} ${b.name}, ${b.pax} guests, ${checkLabel(b)}${b.unconfirmed ? ", unconfirmed" : ""}`),
    "",
    url,
  ].join("\n")

  return { subject, html, text }
}
