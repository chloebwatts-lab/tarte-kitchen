import Fuse from "fuse.js"

/**
 * Sender → Supplier attribution for ingested invoice PDFs.
 *
 * Extracted from the check-invoices cron route so it can be replayed against
 * the real invoice corpus (scripts/_probe-misattribution-20260817*.ts) without
 * standing up the route. Pure functions, no DB access.
 */

export interface SupplierRef {
  id: string
  name: string
}


// Some Xero-domain suppliers can't be matched from their invoices at all:
// Breadtop's legal entity is EAC BUSINESS GROUP PTY LTD, its Xero display
// name is the director ("Ka Wai Chan"), and its PDFs parse with the
// CUSTOMER (Tarte trust) as the supplier. Explicit probe→supplier hints
// break the tie (checked before token/fuzzy matching; only ever selects
// from the candidates already mapped to the sending address).
export const SENDER_PROBE_HINTS: Array<{ probe: string; supplier: string }> = [
  { probe: "ka wai chan", supplier: "Breadtop" },
  { probe: "eac business group", supplier: "Breadtop" },
  // Coastal Fresh also sends via Xero's relay ("Accounts Receivable -
  // Coastal Fresh" from messaging-service@post.xero.com). The token
  // fast-path ties between "Coastal Fresh" and "Gold Coast Premium Foods"
  // ("coast" hits both), and Fuse then rejects the long display name, so
  // these invoices were never ingested. Their legal entity is The Dave's
  // Wholesale Trust.
  { probe: "coastal fresh", supplier: "Coastal Fresh" },
  { probe: "dave's wholesale", supplier: "Coastal Fresh" },
]

// Known NON-FOOD senders on the shared Xero address. Deliberately not
// ingested (overheads would distort the COGS spend tracker), skip them
// silently instead of logging a "could not match" error on every sweep.
export const IGNORED_SENDER_PROBES = [
  "here to help clean",
  "drive accountants",
  "my venue clean",
  "origin energy",
  "resolve migration",
  "now book it",
  "jb hi-fi",
  "sydney tools",
  "ikea",
  "klean air",
  "shade australia",
  "brayco commercial",
  "edge tile",
  "department of home affairs",
  "department of justice",
  "amazon export sales",
]

// Legitimate alternate letterheads for a supplier: legal entities, trading
// names, and ordering platforms that print their own branding on the PDF.
// Used to CONFIRM an attribution, never to choose between candidates — so a
// wrong entry can only let a document through, never redirect one.
//
// Audit of 2026-08-17 (see scripts/_probe-misattribution-20260817*.ts) found
// 221 invoices filed against the wrong supplier because nothing ever compared
// the letterhead to the supplier we'd picked. These are the real aliases
// found in that sweep; everything else in it was a genuine mis-attribution.
export const SUPPLIER_ALIASES: Record<string, string[]> = {
  breadtop: ["eac business group", "ka wai chan", "breadtop aus fair"],
  "coastal fresh": ["dave's wholesale", "daves wholesale"],
  cookers: ["cookers bulk oil"],
  easyvend: ["independent dairy"],
  eustralis: ["pencil.one", "pencilone", "pencil one", "eustralis food"],
  "paramount liquor": ["tambavale"],
  "pixel bread": ["pixel bakehouse"],
  "son of a bunn": ["son of a bunn"],
}

// Our own entities. When the parser returns one of these as the supplier it
// has grabbed the CUSTOMER block off the invoice, so the letterhead tells us
// nothing about who issued it — treat as "unverifiable", not as a mismatch.
const OWN_ENTITY_PROBES = [
  "tarte",
  "cbw trust",
  "tarte currumbin",
]

const NAME_NOISE =
  /\b(pty|ltd|limited|p\/l|inc|incorporated|the|trust|group|holdings|co|company|australia|aust|au|qld|nsw|vic|wholesale|distribution|distributors|trading|t\/a|atf|as trustee for)\b/g

function normaliseCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(NAME_NOISE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function distinctiveTokens(s: string): string[] {
  return normaliseCompany(s)
    .split(" ")
    .filter((t) => t.length >= 4)
}

/**
 * Is `letterhead` consistent with `supplierName`?
 *
 * Deliberately generous — its job is to catch documents from a COMPLETELY
 * different company (Origin Energy filed as Paramount Liquor), not to police
 * spelling. Returns "unverifiable" when the letterhead is missing or is our
 * own entity, so those keep the old behaviour instead of being rejected.
 */
export function letterheadMatches(
  supplierName: string,
  letterhead: string | null
): "match" | "mismatch" | "unverifiable" {
  if (!letterhead || !letterhead.trim()) return "unverifiable"
  const lh = letterhead.toLowerCase()
  if (OWN_ENTITY_PROBES.some((p) => lh.includes(p))) return "unverifiable"

  const aliases = SUPPLIER_ALIASES[supplierName.toLowerCase()] ?? []
  if (aliases.some((a) => lh.includes(a))) return "match"

  const a = normaliseCompany(supplierName)
  const b = normaliseCompany(letterhead)
  if (!a || !b) return "unverifiable"
  if (a === b || a.includes(b) || b.includes(a)) return "match"

  // Shared distinctive token, compared token-to-token rather than by
  // substring: plain `includes` matched "bread" inside "breadtop" and tied
  // Pixel Bread against Breadtop on every Xero-relayed invoice.
  const bt = new Set(distinctiveTokens(letterhead))
  if (distinctiveTokens(supplierName).some((t) => bt.has(t))) return "match"

  return "mismatch"
}

export interface MatchResult {
  supplier: SupplierRef | null
  /** Why we rejected, for the ingestion error log. Null when matched. */
  reason: string | null
}

export function disambiguateSupplier(
  candidates: SupplierRef[],
  parsedSupplierName: string | null,
  senderDisplayName: string | null
): MatchResult {
  // A single mapped candidate is NOT proof of attribution. Relay addresses
  // (Ordermentum, MYOB, Xero) and staff mailboxes carry many senders, and
  // this branch used to return without ever reading the letterhead — the
  // single cause of every mis-attribution in the 2026-08-17 audit.
  if (candidates.length === 1) {
    const verdict = letterheadMatches(candidates[0].name, parsedSupplierName)
    if (verdict === "mismatch") {
      return {
        supplier: null,
        reason: `sole candidate "${candidates[0].name}" contradicted by letterhead "${parsedSupplierName}"`,
      }
    }
    return { supplier: candidates[0], reason: null }
  }

  const probes = [parsedSupplierName, senderDisplayName].filter(
    (s): s is string => !!s
  )

  const probeStrAll = probes.join(" ").toLowerCase()
  for (const hint of SENDER_PROBE_HINTS) {
    if (probeStrAll.includes(hint.probe)) {
      const hit = candidates.find(
        (c) => c.name.toLowerCase() === hint.supplier.toLowerCase()
      )
      if (hit) return { supplier: hit, reason: null }
    }
  }

  // Token-overlap fast path. Fuse's char-level threshold rejects
  // "Pixel Bakehouse Pty Ltd" → "Pixel Bread" even though "Pixel"
  // matches cleanly, so we pre-check for distinctive shared tokens
  // (≥4 chars, skips "the"/"of"). If exactly one candidate has any
  // such token in either probe, pick it.
  if (probes.length > 0) {
    const hits = candidates.filter(
      (c) => letterheadMatches(c.name, probeStrAll) === "match"
    )
    if (hits.length === 1) return { supplier: hits[0], reason: null }
    if (hits.length > 1) {
      return {
        supplier: null,
        reason: `ambiguous, letterhead "${parsedSupplierName}" (display "${senderDisplayName}") matches ${hits.map((h) => h.name).join(" and ")}`,
      }
    }
  }

  // Fuse last, and only on a CLEAR winner. Taking results[0] unconditionally
  // meant a 0.39-vs-0.40 coin-flip silently decided which supplier got
  // charged; require the runner-up to be meaningfully worse.
  for (const probe of probes) {
    const fuse = new Fuse(candidates, { keys: ["name"], threshold: 0.4, includeScore: true })
    const results = fuse.search(probe)
    if (results.length === 0) continue
    const best = results[0]
    const runnerUp = results[1]
    if (runnerUp && (runnerUp.score ?? 1) - (best.score ?? 1) < 0.1) {
      return {
        supplier: null,
        reason: `fuzzy match on "${probe}" too close to call: ${best.item.name} (${best.score?.toFixed(3)}) vs ${runnerUp.item.name} (${runnerUp.score?.toFixed(3)})`,
      }
    }
    // Even a clear fuzzy winner must not contradict the letterhead.
    if (letterheadMatches(best.item.name, parsedSupplierName) === "mismatch") {
      return {
        supplier: null,
        reason: `fuzzy winner "${best.item.name}" contradicted by letterhead "${parsedSupplierName}"`,
      }
    }
    return { supplier: best.item, reason: null }
  }
  return {
    supplier: null,
    reason: `no candidate matched (letterhead "${parsedSupplierName}", display "${senderDisplayName}")`,
  }
}

