import { db } from "@/lib/db"
import { sendEmail } from "@/lib/gmail/send"
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

/** The whole story of one fault so far, as plain text for an email. */
export async function issueStory(issueId: string): Promise<{ subject: string; body: string } | null> {
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

  lines.push(`${name}, ${venue}${asset?.location ? `, ${asset.location}` : ""}`)
  if (asset) {
    const plate = [asset.manufacturer, asset.model, asset.serial ? `SN ${asset.serial}` : null]
      .filter(Boolean)
      .join(" ")
    if (plate) lines.push(plate)
  }
  lines.push("")
  lines.push("What has happened so far")

  let step = 1
  const symptom =
    asset && issue.symptomKey
      ? (CATEGORY_SYMPTOMS[asset.category as AssetCategory] ?? []).find((s) => s.key === issue.symptomKey)
      : null
  lines.push(
    `${step++}. ${fmtWhen(issue.createdAt)}: ${issue.reportedBy ?? "Someone"} scanned ${
      asset?.slug ?? "the machine"
    } and logged "${issue.title}".${issue.isSafety ? " SAFETY FAULT: machine should be out of use." : ""}`
  )
  if (issue.description) lines.push(`   ${issue.description}`)
  if (symptom) {
    if (issue.triedFixes.length) {
      lines.push(`   Tried first, before anyone was called:`)
      for (const t of issue.triedFixes) lines.push(`   - ${t}`)
      const notTried = symptom.quickFixes.filter((f) => !issue.triedFixes.includes(f))
      if (notTried.length) {
        lines.push(`   Not ticked as tried:`)
        for (const t of notTried) lines.push(`   - ${t}`)
      }
    } else {
      lines.push(`   The page suggested these first (none ticked as tried):`)
      for (const t of symptom.quickFixes) lines.push(`   - ${t}`)
    }
  }

  if (asset) {
    const wEnd = warrantyEndDate(asset)
    if (wEnd && wEnd.getTime() > Date.now()) {
      lines.push(
        `${step++}. Warranty: COVERED until ${fmtDay(wEnd)} via ${asset.warrantyProvider ?? "the supplier"}. Do not pay a trade for this.`
      )
    } else if (wEnd) {
      lines.push(`${step++}. Warranty: expired ${fmtDay(wEnd)}${asset.warrantyProvider ? ` (was ${asset.warrantyProvider})` : ""}.`)
    } else {
      lines.push(`${step++}. Warranty: none recorded.`)
    }
  }

  if (issue.bookedAt || issue.contact) {
    const who = issue.contact ? `${issue.contact.name}${issue.contact.phone ? ` (${issue.contact.phone})` : ""}` : "a trade"
    const coming = issue.bookedFor ? ` Coming ${fmtDay(issue.bookedFor)}.` : " No date given yet."
    lines.push(
      `${step++}. ${issue.bookedAt ? `${fmtWhen(issue.bookedAt)}: ` : ""}${issue.bookedBy ?? "Someone"} called ${who}.${coming}${
        issue.bookedNote ? ` ${issue.bookedNote}` : ""
      }`
    )
  } else if (issue.status === "OPEN") {
    lines.push(`${step++}. Nobody has logged a call to a trade yet.`)
  }

  for (const e of issue.events) {
    lines.push(`${step++}. ${fmtWhen(e.createdAt)}: ${e.author ?? "Someone"}: ${e.body}`)
  }

  if (issue.status === "FIXED") {
    lines.push(
      `${step++}. ${issue.fixedAt ? `${fmtWhen(issue.fixedAt)}: ` : ""}FIXED by ${issue.fixedBy ?? "someone"}.${
        issue.fixSummary ? ` ${issue.fixSummary}` : ""
      }${issue.wasWarranty ? " Warranty job." : ""}${issue.costCents ? ` Cost $${(issue.costCents / 100).toFixed(0)}.` : ""}`
    )
  } else if (issue.status === "DISMISSED") {
    lines.push(`${step++}. Closed without a fix.`)
  }

  lines.push("")
  if (issue.venueTask) {
    lines.push(
      issue.venueTask.status === "DONE"
        ? `Morning board: closed.`
        : issue.venueTask.ownedBy
          ? `Morning board (${venue}): on ${issue.venueTask.ownedBy}.`
          : `Morning board (${venue}): needs an owner. Georgia's morning triage puts a name on it.`
    )
  }
  if (asset) lines.push(`Fix page: ${baseUrl()}/kitchen/fix/${asset.slug}`)
  lines.push(`Morning board: ${baseUrl()}/kitchen/managers/board?venue=${issue.venue}`)
  lines.push("")
  lines.push("Sent by Tarte Kitchen the moment it was logged, so everyone has the same picture.")

  return {
    subject: `[${venue}] ${name}: ${issue.title}`,
    body: lines.join("\n"),
  }
}

/**
 * Email the recipients the story so far, with a one-line headline for
 * what just changed. Never throws.
 */
export async function sendIssueAlert(issueId: string, kind: AlertKind, headline: string): Promise<boolean> {
  try {
    const story = await issueStory(issueId)
    if (!story) return false
    await sendEmail({
      to: alertRecipients(),
      subject: `${story.subject} (${KIND_LABEL[kind]})`,
      body: `${headline}\n\n${story.body}`,
    })
    return true
  } catch (err) {
    console.error(`[maintenance] alert email failed for ${issueId} (${kind}):`, err)
    return false
  }
}
