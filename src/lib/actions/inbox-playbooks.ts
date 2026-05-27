"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

// tarte-inbox lives in its own repo and writes to inbox_* tables in this
// same Postgres. We read/write them via raw SQL since they're not in
// Prisma schema. Schema source of truth:
//   /root/tarte-inbox/src/db/schema.sql

export interface InboxPlaybook {
  category: string
  description: string
  voice_guidance: string
  reply_template: string | null
  auto_send: boolean
  min_confidence: number
  examples: Array<{ incoming: string; reply: string }>
}

export async function listInboxPlaybooks(): Promise<InboxPlaybook[]> {
  const rows = await db.$queryRawUnsafe<InboxPlaybook[]>(
    `SELECT category, description, voice_guidance, reply_template,
            auto_send, min_confidence,
            COALESCE(examples, '[]'::jsonb) AS examples
       FROM inbox_playbooks ORDER BY category`
  )
  // Prisma returns Decimal for numeric — coerce
  return rows.map((r) => ({
    ...r,
    min_confidence: Number(r.min_confidence),
  }))
}

export async function saveInboxPlaybook(p: InboxPlaybook): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE inbox_playbooks
        SET description    = $2,
            voice_guidance = $3,
            reply_template = $4,
            auto_send      = $5,
            min_confidence = $6,
            examples       = $7::jsonb,
            updated_at     = now()
      WHERE category = $1`,
    p.category,
    p.description,
    p.voice_guidance,
    p.reply_template,
    p.auto_send,
    p.min_confidence,
    JSON.stringify(p.examples ?? [])
  )
  revalidatePath("/inbox-playbooks")
}

export interface InboxRunSummary {
  id: number
  started_at: Date
  finished_at: Date | null
  threads_seen: number
  threads_acted: number
  error: string | null
}

export async function listRecentInboxRuns(
  limit = 20
): Promise<InboxRunSummary[]> {
  return db.$queryRawUnsafe<InboxRunSummary[]>(
    `SELECT id, started_at, finished_at, threads_seen, threads_acted, error
       FROM inbox_runs ORDER BY id DESC LIMIT $1`,
    limit
  )
}

export interface InboxLearning {
  id: number
  thread_id: string
  category: string | null
  our_draft: string
  sent_reply: string
  edit_distance: number
  noted_at: Date
}

export async function listRecentInboxLearnings(
  limit = 20
): Promise<InboxLearning[]> {
  return db.$queryRawUnsafe<InboxLearning[]>(
    `SELECT id, thread_id, category, our_draft, sent_reply, edit_distance, noted_at
       FROM inbox_learnings ORDER BY id DESC LIMIT $1`,
    limit
  )
}
