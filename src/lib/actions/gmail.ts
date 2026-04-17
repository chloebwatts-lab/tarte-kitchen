"use server"

import { db } from "@/lib/db"
import { getGmailConnectionStatus, type GmailConnectionStatus } from "@/lib/gmail/token"
import { revalidatePath } from "next/cache"

export async function getGmailStatus(): Promise<GmailConnectionStatus> {
  return getGmailConnectionStatus()
}

export async function disconnectGmail() {
  await db.gmailConnection.deleteMany()
  revalidatePath("/settings/integrations")
}
