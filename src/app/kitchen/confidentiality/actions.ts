"use server"

import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { DEED_TITLE, DEED_VERSION, TARTE_ENTITIES, deedPlainText } from "@/lib/confidentiality/deed"
import { getPerson, logAccess, setPersonCookie } from "@/lib/person-session"
import { sendEmail } from "@/lib/gmail/send"

const MAX_SIG = 400_000 // a drawn PNG is ~10-60 KB; this just stops abuse

function okSignature(s: string): boolean {
  return s.startsWith("data:image/png;base64,") && s.length > 1500 && s.length < MAX_SIG
}

export async function signDeed(formData: FormData): Promise<void> {
  const person = await getPerson()
  if (!person) redirect("/staff-login?next=/kitchen/confidentiality")

  const signedName = String(formData.get("signedName") ?? "").trim().replace(/\s+/g, " ")
  const signatureImg = String(formData.get("signatureImg") ?? "")
  const agreed = formData.get("agreed") === "on"
  const next = String(formData.get("next") ?? "/staffaccess")

  if (!agreed || signedName.split(" ").length < 2 || !okSignature(signatureImg)) {
    redirect(`/kitchen/confidentiality?error=1&next=${encodeURIComponent(next)}`)
  }

  const h = await headers()
  const text = deedPlainText()
  const textHash = createHash("sha256").update(text).digest("hex")
  const signedAt = new Date()

  await db.confidentialityDeed.upsert({
    where: { staffId_version: { staffId: person.id, version: DEED_VERSION } },
    // A signed deed is never rewritten: a second submit of the same version is a no-op.
    update: {},
    create: {
      staffId: person.id,
      staffName: person.name,
      version: DEED_VERSION,
      textHash,
      signedName,
      signatureImg,
      ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      copySentTo: person.email ?? null,
      signedAt,
    },
  })
  await logAccess("DEED_SIGNED", { staffId: person.id, staffName: person.name })
  await setPersonCookie({ ...person, deed: DEED_VERSION, seen: Date.now() })

  // Their copy. Having received the wording is part of what makes it stick.
  if (person.email) {
    const when = new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: "Australia/Brisbane" }).format(signedAt)
    try {
      await sendEmail({
        to: person.email,
        subject: `Your signed copy: ${DEED_TITLE}`,
        body: `${person.name},\n\nThis is your copy of the deed you signed on ${when} (Brisbane time) as "${signedName}". Keep it.\n\nGiven in favour of:\n${TARTE_ENTITIES.map((e) => `- ${e}`).join("\n")}\n\n----------------------------------------\n\n${text}\n\n----------------------------------------\nSigned electronically by ${signedName} on ${when}.\nDocument fingerprint (SHA-256): ${textHash}\n`,
      })
    } catch (e) {
      console.error("[deed] copy email failed", e)
    }
  }

  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/staffaccess")
}
