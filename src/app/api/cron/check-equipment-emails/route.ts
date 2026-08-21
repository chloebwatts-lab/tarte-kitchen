export const dynamic = "force-dynamic"
export const maxDuration = 600

import { db } from "@/lib/db"
import { getActiveGmailConnection, getValidGmailAccessToken } from "@/lib/gmail/token"
import { getHelloAccessToken } from "@/lib/gmail/hello-token"
import { sendEmail } from "@/lib/gmail/send"
import {
  searchMessages,
  getMessage,
  getAttachment,
  extractPdfAttachments,
  extractPlainTextBody,
  getHeader,
} from "@/lib/gmail/client"
import { classifyEquipmentEmail } from "@/lib/maintenance/equipment-classifier"
import { nextAssetSlug } from "@/lib/maintenance/slug"

/**
 * Equipment-purchase email sweep. Finds invoices / order confirmations for
 * new machines (fridges, fryers, coffee gear, ...) and auto-creates
 * MaintenanceAsset rows flagged needsReview, each with the next free QR slug
 * so its label is immediately printable from /maintenance/labels and the
 * staff label page.
 *
 * Sweeps TWO mailboxes, same shape as check-service-emails:
 *   - accounts@ via the app's own Gmail connection
 *   - hello@ via the tarte-inbox app's stored Google token
 * (chloe@ has no API access — purchase emails that land only there need to
 * be forwarded to accounts@, the sweep reads forwarded content fine.)
 *
 * Per mailbox, two Gmail queries: known equipment-supplier senders + a
 * keyword sweep. Every message is classified at most once ever
 * (EquipmentEmailSeen; hello@ ids stored prefixed "hello:"). Serial/model/
 * name guards stop statements, reminders and cross-mailbox copies from
 * re-creating the same machine.
 *
 * Params: ?preview=1 lists unprocessed candidates without classifying;
 * ?days=N widens the window (default 30, for backfills); ?limit=N caps
 * classifications per run (default 25, shared across mailboxes).
 */

const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_BATCH_LIMIT = 25
const BASE_URL = "https://kitchen.tarte.com.au"

/** Senders we buy machines from. Keyword sweep catches the rest. */
const EQUIPMENT_SUPPLIER_DOMAINS = [
  "commercialkitchencompany.com.au",
  "nisbets.com.au",
]

const EQUIPMENT_KEYWORD_QUERY =
  '{"tax invoice" invoice receipt "order confirmation"} ' +
  '{fridge freezer dishwasher fryer oven cooktop griddle "ice machine" "ice maker" ' +
  '"coffee machine" grinder mixer blender juicer "cool room" "coolroom" "display fridge" "bain marie"}'

function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

interface MailboxStats {
  candidates: number
  unprocessed: number
  processed: number
  assetsCreated: number
  duplicates: number
  noEquipment: number
  errors: number
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const url = new URL(request.url)
  const windowDays = Math.min(
    Math.max(parseInt(url.searchParams.get("days") ?? "", 10) || DEFAULT_WINDOW_DAYS, 1),
    365
  )
  let batchBudget = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_BATCH_LIMIT, 1),
    200
  )
  const preview = url.searchParams.get("preview") === "1"

  try {
    // Recent register entries as hints so statements / payment reminders
    // about machines we already own don't get re-extracted.
    const recentAssets = await db.maintenanceAsset.findMany({
      where: { purchaseDate: { not: null } },
      orderBy: { purchaseDate: "desc" },
      take: 30,
      select: {
        venue: true,
        name: true,
        model: true,
        supplier: true,
        purchaseDate: true,
      },
    })
    const assetHints = recentAssets
      .map(
        (a) =>
          `- ${a.name}${a.model ? ` (${a.model})` : ""} at ${a.venue}` +
          `${a.supplier ? `, from ${a.supplier}` : ""}` +
          `${a.purchaseDate ? `, bought ${dateStr(a.purchaseDate)}` : ""}`
      )
      .join("\n")

    const mailboxes: Array<{ key: string; idPrefix: string; token: string }> = []
    const connection = await getActiveGmailConnection()
    if (connection) {
      mailboxes.push({
        key: "accounts",
        idPrefix: "",
        token: await getValidGmailAccessToken(),
      })
    }
    const helloToken = await getHelloAccessToken("check-equipment-emails")
    if (helloToken) {
      mailboxes.push({ key: "hello", idPrefix: "hello:", token: helloToken })
    }
    if (!mailboxes.length) {
      return Response.json({ ok: false, error: "No mailbox tokens available" }, { status: 500 })
    }

    const stats: Record<string, MailboxStats> = {}
    const created: Array<{ slug: string; name: string; venue: string; supplier: string | null }> = []
    const previewSample: Array<Record<string, string | null>> = []

    for (const mailbox of mailboxes) {
      const candidates = new Map<string, true>()
      const q1 = `from:(${EQUIPMENT_SUPPLIER_DOMAINS.join(" OR ")}) newer_than:${windowDays}d`
      for (const m of await searchMessages(mailbox.token, q1, 500)) candidates.set(m.id, true)
      // -from:accounts@ keeps our own app's emails (digests mention fridges,
      // fryers etc. constantly) out of the sweep.
      const q2 = `${EQUIPMENT_KEYWORD_QUERY} -from:accounts@tarte.com.au newer_than:${windowDays}d`
      for (const m of await searchMessages(mailbox.token, q2, 500)) candidates.set(m.id, true)

      const ids = Array.from(candidates.keys())
      const storedIds = ids.map((id) => mailbox.idPrefix + id)
      const seen = await db.equipmentEmailSeen.findMany({
        where: { gmailMessageId: { in: storedIds } },
        select: { gmailMessageId: true },
      })
      const seenSet = new Set(seen.map((s) => s.gmailMessageId))
      const fresh = ids.filter((id) => !seenSet.has(mailbox.idPrefix + id))

      const s: MailboxStats = {
        candidates: ids.length,
        unprocessed: fresh.length,
        processed: 0,
        assetsCreated: 0,
        duplicates: 0,
        noEquipment: 0,
        errors: 0,
      }
      stats[mailbox.key] = s

      if (preview) {
        for (const id of fresh.slice(0, 15)) {
          const msg = await getMessage(mailbox.token, id)
          previewSample.push({
            mailbox: mailbox.key,
            id,
            from: getHeader(msg, "From") ?? null,
            subject: getHeader(msg, "Subject") ?? null,
            date: getHeader(msg, "Date") ?? null,
          })
        }
        continue
      }

      for (const id of fresh) {
        if (batchBudget <= 0) break
        batchBudget--
        s.processed++
        const storedId = mailbox.idPrefix + id
        try {
          const msg = await getMessage(mailbox.token, id)
          const subject = getHeader(msg, "Subject") ?? "(no subject)"
          const from = getHeader(msg, "From") ?? "(unknown)"
          const received = new Date(parseInt(msg.internalDate, 10))
          const bodyText = extractPlainTextBody(msg)

          const pdfInfos = extractPdfAttachments(msg).filter(
            (a) => /\.pdf$/i.test(a.filename) || a.mimeType === "application/pdf"
          )
          const pdfs: Buffer[] = []
          for (const info of pdfInfos.slice(0, 2)) {
            pdfs.push(await getAttachment(mailbox.token, id, info.attachmentId))
          }

          if (!bodyText && pdfs.length === 0) {
            await db.equipmentEmailSeen.create({
              data: { gmailMessageId: storedId, outcome: "no-equipment", detail: "empty message" },
            })
            s.noEquipment++
            continue
          }

          const result = await classifyEquipmentEmail({
            subject,
            from,
            receivedDate: dateStr(received),
            bodyText,
            pdfAttachments: pdfs,
            assetHints,
          })

          if (!result.isEquipmentPurchase || result.items.length === 0) {
            await db.equipmentEmailSeen.create({
              data: { gmailMessageId: storedId, outcome: "no-equipment", detail: result.reason },
            })
            s.noEquipment++
            continue
          }

          let createdCount = 0
          let dupeCount = 0
          for (const item of result.items) {
            // Same-machine guards: an invoice often arrives several times
            // (supplier copy + Xero copy, reminders, forwards, and via BOTH
            // mailboxes), and statements re-list old purchases.
            const purchase = new Date(`${item.purchaseDate}T00:00:00`)
            const windowStart = new Date(purchase)
            windowStart.setDate(windowStart.getDate() - 90)
            const windowEnd = new Date(purchase)
            windowEnd.setDate(windowEnd.getDate() + 90)

            const dupe = await db.maintenanceAsset.findFirst({
              where: {
                OR: [
                  ...(item.serial
                    ? [{ serial: { equals: item.serial, mode: "insensitive" as const } }]
                    : []),
                  ...(item.model
                    ? [
                        {
                          venue: item.venue,
                          model: { equals: item.model, mode: "insensitive" as const },
                          purchaseDate: { gte: windowStart, lte: windowEnd },
                        },
                      ]
                    : []),
                  {
                    venue: item.venue,
                    name: { equals: item.name, mode: "insensitive" as const },
                    purchaseDate: { gte: windowStart, lte: windowEnd },
                  },
                ],
              },
            })
            if (dupe) {
              dupeCount++
              continue
            }

            const slug = await nextAssetSlug(item.venue)
            await db.maintenanceAsset.create({
              data: {
                slug,
                venue: item.venue,
                // Matches the register convention for machines whose spot
                // isn't known yet (see C23/C24) — staff/admin fill it in.
                location: "To confirm",
                name: item.name,
                category: item.category,
                manufacturer: item.manufacturer,
                model: item.model,
                serial: item.serial,
                purchaseDate: purchase,
                purchasePriceCents:
                  item.priceExGst != null ? Math.round(item.priceExGst * 100) : null,
                supplier: item.supplier,
                warrantyMonths: item.warrantyMonths,
                notes: item.note,
                source: "email",
                needsReview: true,
                gmailMessageId: storedId,
                sourceEmailSubject: subject,
              },
            })
            created.push({ slug, name: item.name, venue: item.venue, supplier: item.supplier })
            createdCount++
          }

          await db.equipmentEmailSeen.create({
            data: {
              gmailMessageId: storedId,
              outcome: createdCount > 0 ? "created" : "duplicate",
              detail:
                `${createdCount} created, ${dupeCount} duplicate(s): ` + subject.slice(0, 140),
            },
          })
          s.assetsCreated += createdCount
          s.duplicates += dupeCount
        } catch (e) {
          // No EquipmentEmailSeen row on error: the next sweep retries it.
          console.error(`[check-equipment-emails] ${mailbox.key} message ${id}:`, e)
          s.errors++
        }
      }
    }

    // Rare enough (a few machines a month at most) that a heads-up email is
    // signal, not noise. Chloe confirms details on /maintenance.
    if (created.length > 0) {
      try {
        await sendEmail({
          to: "chloe@tarte.com.au",
          subject: `Maintenance register: ${created.length} new machine${created.length === 1 ? "" : "s"} added from purchase emails`,
          body:
            `Added automatically from purchase invoices, marked "check details":\n\n` +
            created
              .map(
                (c) =>
                  `  ${c.slug}  ${c.name} (${c.venue === "BURLEIGH" ? "Burleigh" : "Beach House"}${c.supplier ? `, from ${c.supplier}` : ""})`
              )
              .join("\n") +
            `\n\nConfirm details: ${BASE_URL}/maintenance` +
            `\nPrint QR labels: ${BASE_URL}/maintenance/labels\n`,
        })
      } catch (e) {
        console.error("[check-equipment-emails] notification email failed:", e)
      }
    }

    const totals = Object.values(stats).reduce(
      (a, b) => ({
        candidates: a.candidates + b.candidates,
        unprocessed: a.unprocessed + b.unprocessed,
        processed: a.processed + b.processed,
        assetsCreated: a.assetsCreated + b.assetsCreated,
        duplicates: a.duplicates + b.duplicates,
        noEquipment: a.noEquipment + b.noEquipment,
        errors: a.errors + b.errors,
      }),
      {
        candidates: 0,
        unprocessed: 0,
        processed: 0,
        assetsCreated: 0,
        duplicates: 0,
        noEquipment: 0,
        errors: 0,
      }
    )
    const helloSkipped = !mailboxes.some((m) => m.key === "hello")

    console.log(
      `[check-equipment-emails] mailboxes=${mailboxes.map((m) => m.key).join(",")} ` +
        `candidates=${totals.candidates} fresh=${totals.unprocessed} created=${totals.assetsCreated} ` +
        `dupes=${totals.duplicates} noEquipment=${totals.noEquipment} errors=${totals.errors}`
    )
    if (preview) {
      return Response.json({
        ok: true,
        preview: true,
        helloSkipped,
        stats,
        ...totals,
        sample: previewSample,
      })
    }
    return Response.json({ ok: true, helloSkipped, stats, ...totals, created })
  } catch (e) {
    console.error("[check-equipment-emails]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
