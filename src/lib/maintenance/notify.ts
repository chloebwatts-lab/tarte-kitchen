import { db } from "@/lib/db"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { button, callout, list, rows, section, shell, type ListItem, type Row, type Tone } from "@/lib/email/brand"
import { CATEGORY_SYMPTOMS, type AssetCategory, warrantyEndDate } from "@/lib/maintenance/constants"
import { VENUE_SHORT_LABEL } from "@/lib/venues"

/**
 * Broken-equipment alerts. Chloe, 16 Sep 2026: "at the moment I am unsure
 * when someone logs a request where it goes". Every step of a fault now
 * emails the same people the same story so far: reported (with what was
 * tried first), trade called (who, when they are coming), an update, fixed.
 * Managing it means everyone can read the chain; nobody has to be asked.
 *
 * Recipients come from MAINTENANCE_ALERT_TO (comma-separated) and default
 * to the front-of-house inbox plus Shawna. Sending is best-effort: a Gmail
 * hiccup must never stop the fault from being logged.
 */

const DEFAULT_TO = ["hello@tarte.com.au", "shawna@tarte.com.au"]

export function alertRecipients(): string[] {
  const raw = process.env.MAINTENANCE_ALERT_TO?.trim()
  if (!raw) return DEFAULT_TO
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_TO
}

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://kitchen.tarte.com.au").replace(/\/$/, "")
}

const whenFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Brisbane",
})
const dayFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "Australia/Brisbane",
})

export function fmtWhen(d: Date): string {
  return whenFmt.format(d)
}
export function fmtDay(d: Date): string {
  return dayFmt.format(d)
}

export type AlertKind = "reported" | "booked" | "update" | "fixed"

const KIND_LABEL: Record<AlertKind, string> = {
  reported: "reported",
  booked: "trade booked",
  update: "update",
  fixed: "fixed",
}

const KIND_TONE: Record<AlertKind, Tone> = {
  reported: "red",
  booked: "gold",
  update: "sage",
  fixed: "done",
}

/**
 * The whole story of one fault so far, as plain text and as a branded HTML
 * body for an email. `change` is what just happened; it becomes the
 * headline callout in the HTML (the text body gets it from the caller).
 */
export async function issueStory(
  issueId: string,
  change?: { kind: AlertKind; headline: string }
): Promise<{ subject: string; body: string; html: string } | null> {
  const issue = await db.maintenanceIssue.findUnique({
    where: { id: issueId },
    include: {
      asset: true,
      contact: true,
      events: { orderBy: { createdAt: "asc" } },
      venueTask: { select: { ownedBy: true, status: true } },
    },
  })
  if (!issue) return null
  const asset = issue.asset
  const venue = VENUE_SHORT_LABEL[issue.venue]
  const name = asset ? `${asset.name} (${asset.slug})` : issue.title
  const lines: string[] = []
  /** The same timeline as `lines`, one entry per numbered step, for the HTML. */
  const steps: ListItem[] = []
  /** Nameplate, warranty, trade and owner facts for the HTML rows. */
  const facts: Row[] = []

  lines.push(`${name}, ${venue}${asset?.location ? `, ${asset.location}` : ""}`)
  facts.push({ label: "Machine", value: name })
  facts.push({ label: "Where", value: `${venue}${asset?.location ? `, ${asset.location}` : ""}` })
  if (asset) {
    const plate = [asset.manufacturer, asset.model, asset.serial ? `SN ${asset.serial}` : null]
      .filter(Boolean)
      .join(" ")
    if (plate) lines.push(plate)
    if (plate) facts.push({ label: "Nameplate", value: plate })
  }
  lines.push("")
  lines.push("What has happened so far")

  let step = 1
  const symptom =
    asset && issue.symptomKey
      ? (CATEGORY_SYMPTOMS[asset.category as AssetCategory] ?? []).find((s) => s.key === issue.symptomKey)
      : null
  const reportedText = `${step++}. ${fmtWhen(issue.createdAt)}: ${issue.reportedBy ?? "Someone"} scanned ${
    asset?.slug ?? "the machine"
  } and logged "${issue.title}".${issue.isSafety ? " SAFETY FAULT: machine should be out of use." : ""}`
  lines.push(reportedText)
  const reportedDetail: string[] = []
  const note = (t: string) => {
    lines.push(`   ${t}`)
    reportedDetail.push(t)
  }
  if (issue.description) note(issue.description)
  if (symptom) {
    if (issue.triedFixes.length) {
      note(`Tried first, before anyone was called:`)
      for (const t of issue.triedFixes) note(`- ${t}`)
      const notTried = symptom.quickFixes.filter((f) => !issue.triedFixes.includes(f))
      if (notTried.length) {
        note(`Not ticked as tried:`)
        for (const t of notTried) note(`- ${t}`)
      }
    } else {
      note(`The page suggested these first (none ticked as tried):`)
      for (const t of symptom.quickFixes) note(`- ${t}`)
    }
  }
  steps.push({ text: reportedText, detail: reportedDetail.length ? reportedDetail.join("\n") : undefined, tone: "neutral" })

  if (asset) {
    const wEnd = warrantyEndDate(asset)
    let warrantyText: string
    if (wEnd && wEnd.getTime() > Date.now()) {
      warrantyText = `${step++}. Warranty: COVERED until ${fmtDay(wEnd)} via ${asset.warrantyProvider ?? "the supplier"}. Do not pay a trade for this.`
      facts.push({ label: "Warranty", value: `Covered until ${fmtDay(wEnd)}\nvia ${asset.warrantyProvider ?? "the supplier"}`, tone: "done" })
    } else if (wEnd) {
      warrantyText = `${step++}. Warranty: expired ${fmtDay(wEnd)}${asset.warrantyProvider ? ` (was ${asset.warrantyProvider})` : ""}.`
      facts.push({ label: "Warranty", value: `Expired ${fmtDay(wEnd)}${asset.warrantyProvider ? `\nwas ${asset.warrantyProvider}` : ""}`, tone: "warn" })
    } else {
      warrantyText = `${step++}. Warranty: none recorded.`
      facts.push({ label: "Warranty", value: "None recorded" })
    }
    lines.push(warrantyText)
    steps.push({ text: warrantyText, tone: "neutral" })
  }

  if (issue.bookedAt || issue.contact) {
    const who = issue.contact ? `${issue.contact.name}${issue.contact.phone ? ` (${issue.contact.phone})` : ""}` : "a trade"
    const coming = issue.bookedFor ? ` Coming ${fmtDay(issue.bookedFor)}.` : " No date given yet."
    const bookedText = `${step++}. ${issue.bookedAt ? `${fmtWhen(issue.bookedAt)}: ` : ""}${issue.bookedBy ?? "Someone"} called ${who}.${coming}${
      issue.bookedNote ? ` ${issue.bookedNote}` : ""
    }`
    lines.push(bookedText)
    steps.push({ text: bookedText, tone: "neutral" })
    facts.push({ label: "Trade", value: `${who}\n${issue.bookedFor ? `Coming ${fmtDay(issue.bookedFor)}` : "No date given yet"}` })
  } else if (issue.status === "OPEN") {
    const noTradeText = `${step++}. Nobody has logged a call to a trade yet.`
    lines.push(noTradeText)
    steps.push({ text: noTradeText, tone: "neutral" })
  }

  for (const e of issue.events) {
    const eventText = `${step++}. ${fmtWhen(e.createdAt)}: ${e.author ?? "Someone"}: ${e.body}`
    lines.push(eventText)
    steps.push({ text: eventText, tone: "neutral" })
  }

  if (issue.status === "FIXED") {
    const fixedText = `${step++}. ${issue.fixedAt ? `${fmtWhen(issue.fixedAt)}: ` : ""}FIXED by ${issue.fixedBy ?? "someone"}.${
      issue.fixSummary ? ` ${issue.fixSummary}` : ""
    }${issue.wasWarranty ? " Warranty job." : ""}${issue.costCents ? ` Cost $${(issue.costCents / 100).toFixed(0)}.` : ""}`
    lines.push(fixedText)
    steps.push({ text: fixedText, tone: "neutral" })
  } else if (issue.status === "DISMISSED") {
    const closedText = `${step++}. Closed without a fix.`
    lines.push(closedText)
    steps.push({ text: closedText, tone: "neutral" })
  }

  lines.push("")
  if (issue.venueTask) {
    const boardText =
      issue.venueTask.status === "DONE"
        ? `Morning board: closed.`
        : issue.venueTask.ownedBy
          ? `Morning board (${venue}): on ${issue.venueTask.ownedBy}.`
          : `Morning board (${venue}): needs an owner. Georgia's morning triage puts a name on it.`
    lines.push(boardText)
    facts.push(
      issue.venueTask.status === "DONE"
        ? { label: "Morning board", value: "Closed", tone: "done" }
        : issue.venueTask.ownedBy
          ? { label: "Morning board", value: `On ${issue.venueTask.ownedBy}` }
          : { label: "Morning board", value: "Needs an owner", tone: "warn" }
    )
  }
  const fixUrl = asset ? `${baseUrl()}/kitchen/fix/${asset.slug}` : null
  const boardUrl = `${baseUrl()}/kitchen/managers/board?venue=${issue.venue}`
  if (fixUrl) lines.push(`Fix page: ${fixUrl}`)
  lines.push(`Morning board: ${boardUrl}`)
  lines.push("")
  lines.push("Sent by Tarte Kitchen the moment it was logged, so everyone has the same picture.")

  const html = shell({
    kicker: change ? `Maintenance · ${KIND_LABEL[change.kind]}` : "Maintenance",
    title: asset ? asset.name : issue.title,
    subtitle: `${venue}${asset?.location ? ` · ${asset.location}` : ""}`,
    preheader: change ? change.headline : issue.title,
    sections: [
      ...(change ? [callout(change.headline, KIND_TONE[change.kind], { label: KIND_LABEL[change.kind] })] : []),
      section("What has happened so far", list(steps)),
      section("Details", rows(facts)),
      `<div style="padding:0 4px;">${fixUrl ? button("Open the fix page", fixUrl) : ""}${button("Morning board", boardUrl, { secondary: true })}</div>`,
    ],
    footer: "Sent by Tarte Kitchen the moment it was logged, so everyone has the same picture.",
  })

  return {
    subject: `[${venue}] ${name}: ${issue.title}`,
    body: lines.join("\n"),
    html,
  }
}

/**
 * Email the recipients the story so far, with a one-line headline for
 * what just changed. Never throws.
 */
export async function sendIssueAlert(issueId: string, kind: AlertKind, headline: string): Promise<boolean> {
  try {
    const story = await issueStory(issueId, { kind, headline })
    if (!story) return false
    await sendHtmlEmail({
      to: alertRecipients(),
      subject: `${story.subject} (${KIND_LABEL[kind]})`,
      text: `${headline}\n\n${story.body}`,
      html: story.html,
    })
    return true
  } catch (err) {
    console.error(`[maintenance] alert email failed for ${issueId} (${kind}):`, err)
    return false
  }
}
