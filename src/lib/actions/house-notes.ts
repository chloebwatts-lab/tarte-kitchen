"use server"

// House notes + suggestions for the Tarte Inbox email agent. Staff-only
// (the /inbox-playbooks page sits behind Caddy basic auth). kind='note' rows
// go LIVE: the agent injects them into its drafting prompt on the next tick,
// layered under its hard-coded rules (sign-off, no AI tells, no comps, etc)
// which always win. kind='suggestion' rows are parked for review and never
// reach the model. Table lives in the shared Postgres, owned by tarte-inbox:
//   /root/tarte-inbox/src/db/schema.sql (inbox_house_notes)

import { db } from "@/lib/db"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

export interface HouseNote {
  id: number
  kind: "note" | "suggestion"
  body: string
  author: string
  created_at: Date
}

// "use server" files may only export async functions, so the caps are plain
// consts here and mirrored in the client component.
const NOTE_MAX = 500
const SUGGESTION_MAX = 1000

/** Username from the Caddy basic-auth header ('tarte' or 'shawna'). We keep
 * ONLY the username for attribution; the credential part is never read. */
async function basicAuthUser(): Promise<string | null> {
  const auth = (await headers()).get("authorization")
  if (!auth?.toLowerCase().startsWith("basic ")) return null
  try {
    const user = Buffer.from(auth.slice(6), "base64").toString("utf8").split(":")[0]
    return user || null
  } catch {
    return null
  }
}

export async function listHouseNotes(): Promise<{
  notes: HouseNote[]
  suggestions: HouseNote[]
}> {
  const rows = await db.$queryRawUnsafe<Array<HouseNote & { id: bigint | number }>>(
    `SELECT id, kind, body, author, created_at
       FROM inbox_house_notes
      WHERE active
      ORDER BY created_at DESC`
  )
  const all = rows.map((r) => ({ ...r, id: Number(r.id) }))
  return {
    notes: all.filter((n) => n.kind === "note"),
    suggestions: all.filter((n) => n.kind === "suggestion"),
  }
}

export async function addHouseNote(input: {
  kind: "note" | "suggestion"
  body: string
  author: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const kind = input.kind === "suggestion" ? "suggestion" : "note"
  const body = input.body?.trim() ?? ""
  const author = (input.author?.trim() ?? "").slice(0, 60)
  const max = kind === "note" ? NOTE_MAX : SUGGESTION_MAX
  if (body.length < 3) return { ok: false, error: "Write the note first." }
  if (body.length > max) return { ok: false, error: `Keep it under ${max} characters.` }
  if (!author) return { ok: false, error: "Add your name so we know who wrote it." }
  const authUser = await basicAuthUser()
  await db.$executeRawUnsafe(
    `INSERT INTO inbox_house_notes (kind, body, author, auth_user)
     VALUES ($1, $2, $3, $4)`,
    kind,
    body,
    author,
    authUser
  )
  revalidatePath("/inbox-playbooks")
  return { ok: true }
}

export async function removeHouseNote(
  id: number,
  by: string
): Promise<void> {
  const authUser = await basicAuthUser()
  await db.$executeRawUnsafe(
    `UPDATE inbox_house_notes
        SET active = false, deactivated_at = now(), deactivated_by = $2
      WHERE id = $1 AND active`,
    id,
    `${(by ?? "").trim().slice(0, 60) || "?"}${authUser ? ` (${authUser})` : ""}`
  )
  revalidatePath("/inbox-playbooks")
}
