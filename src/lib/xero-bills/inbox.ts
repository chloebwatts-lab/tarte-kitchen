/**
 * Kitchen's client for the Tarte Inbox app's narrow Xero door
 * (tarte-inbox src/kitchen-bills.ts), reached on the Docker network at
 * INBOX_BILLS_URL with the bearer INBOX_BILLS_KEY. The Inbox app holds the
 * Xero token (both orgs, accounting scopes); Kitchen never sees it.
 */
import type { BillOrg, DraftPayload, OrgRead, XeroBill } from "./plan"

export interface InboxBills {
  status(): Promise<{ attachments: boolean; orgs: string[] }>
  read(org: BillOrg, since: string): Promise<OrgRead>
  find(org: BillOrg, invoiceNumber: string): Promise<XeroBill[]>
  create(org: BillOrg, bill: DraftPayload, idempotencyKey: string): Promise<CreateResult>
  attach(org: BillOrg, invoiceId: string, filename: string, contentBase64: string): Promise<{ ok: boolean; reason?: string; error?: string }>
}

export type CreateResult =
  | { ok: true; bill: XeroBill }
  /** Refused or rejected; nothing was created. */
  | { ok: false; kind: "already" | "contact" | "refused" | "rate" | "error"; error: string; existing?: XeroBill[] }
  /** No answer from Xero: it may or may not exist. Check by number before anything else. */
  | { ok: false; kind: "unknown"; error: string }

export function inboxBillsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.INBOX_BILLS_URL && !!env.INBOX_BILLS_KEY
}

export function inboxBills(env: Record<string, string | undefined> = process.env): InboxBills {
  const base = (env.INBOX_BILLS_URL ?? "").replace(/\/$/, "")
  const headers = { Authorization: `Bearer ${env.INBOX_BILLS_KEY}`, "Content-Type": "application/json" }
  async function call(path: string, body?: unknown, timeoutMs = 120_000): Promise<{ status: number; json: any }> {
    const res = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json }
  }
  const must = (r: { status: number; json: any }, what: string) => {
    if (r.status !== 200 || !r.json.ok) throw new Error(`Inbox ${what}: ${r.json.error ?? r.status}`)
    return r.json
  }
  return {
    async status() {
      const j = must(await call("/status"), "status")
      return { attachments: !!j.attachments, orgs: j.orgs ?? [] }
    },
    async read(org, since) {
      const j = must(await call("/read", { org, since }, 300_000), `read ${org}`)
      return { contacts: j.contacts ?? [], bills: j.bills ?? [] }
    },
    async find(org, invoiceNumber) {
      return must(await call("/find", { org, invoiceNumber }), `find ${org}`).bills ?? []
    },
    async create(org, bill, idempotencyKey) {
      let r: { status: number; json: any }
      try {
        // The Inbox app may wait out a rate limit on its two checks before the create.
        r = await call("/create", { org, bill, idempotencyKey }, 300_000)
      } catch (e) {
        return { ok: false, kind: "unknown", error: `no answer from the Inbox app (${e instanceof Error ? e.message : String(e)})` }
      }
      if (r.status === 200 && r.json.ok) return { ok: true, bill: r.json.bill }
      const error = String(r.json.error ?? `status ${r.status}`)
      if (r.json.unknown) return { ok: false, kind: "unknown", error }
      if (r.status === 409 && /already in Xero/.test(error)) return { ok: false, kind: "already", error, existing: r.json.existing }
      if (r.status === 409) return { ok: false, kind: "contact", error }
      if (r.status === 429) return { ok: false, kind: "rate", error }
      if (r.status === 400) return { ok: false, kind: "refused", error }
      return { ok: false, kind: "error", error }
    },
    async attach(org, invoiceId, filename, contentBase64) {
      try {
        const r = await call("/attach", { org, invoiceId, filename, contentBase64 })
        return { ok: r.status === 200 && !!r.json.ok, reason: r.json.reason, error: r.json.error }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}
