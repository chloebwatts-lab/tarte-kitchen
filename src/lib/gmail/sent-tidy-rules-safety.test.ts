import { test } from "node:test"
import assert from "node:assert/strict"
import { decideTrash, decodeMimeHeader, isPrivateSentSubject, matchPrivateSentSubject, sweepQuery, PRIVATE_SENT_PATTERNS, SENT_TIDY_FLOOR_MS, type SentMeta } from "./sent-tidy-rules"
import { expectedGmailMailbox, gmailReconnectAllowed } from "./client"

/**
 * Pre-push guard for the accounts@ Sent tidy (9 Nov 2026). The point of
 * these cases: nothing that is not a plain accounts@ Sent copy of a profit
 * or earnings email can ever be trashed, whatever subject or flag it has.
 */

const ME = "accounts@tarte.com.au"
// Fri 6 Nov 2026 08:00 AEST, when the digest goes out.
const FRI = Date.parse("2026-11-05T22:00:00Z")
const sent = (over: Partial<SentMeta> = {}): SentMeta => ({
  id: "19a6f3c2d1e0b7a4",
  internalDate: FRI,
  labelIds: ["SENT"],
  subject: "Tarte weekly: 28 Oct to 3 Nov 2026",
  from: "Tarte Accounts <accounts@tarte.com.au>",
  to: "Chloe Watts <chloe@tarte.com.au>",
  cc: "",
  ...over,
})

test("subjects the Kitchen senders actually use for operational mail stay in Sent", () => {
  for (const s of [
    // src/lib/accountability/daily.ts
    "End of day Monday 9 November: 3 open, 0 with nobody on them",
    // HACCP, checklist overdue (send.ts), reviews (draft-replies.ts)
    "[Tarte] HACCP Temperature Check - AM - Kitchen - 2026-11-09 - OK",
    "[Tarte] Opening checklist - Burleigh - overdue",
    "[Tarte] 3 five-star thank-yous posted for you, nothing to approve",
    // gm-nudge themes that are not money
    "Today: People and quality (4 to do)",
    "Today: Every GM day (1 to do)",
    // credentials and onboarding
    "Set your Tarte Shifts PIN",
    "Set up your Tarte sign in",
    "Your signed copy: Confidentiality and Intellectual Property Deed",
    "[Tarte] Onboarding: Hanne finished, 1 thing to chase",
    // access, maintenance, Louise pull, supplier admin
    "Tarte Kitchen access alert: Sam Lee",
    "Tarte Kitchen: someone is guessing the kitchen password",
    "Tarte Kitchen access, Mon 9 Nov: 2 alerts, 5 deeds signed",
    "Maintenance register: 2 new machines added from purchase emails",
    "[Burleigh] Rational combi: E34 water supply (reopened)",
    "Tarte: no Reports email from Louise this week",
    "Tarte: Louise's report auto-pull failed",
    "Invoices: can you note which venue each one is for?",
    "Re: Tasman Butchers statement October",
    "Provedores: invoice copy please, INV-20931",
  ]) assert.equal(isPrivateSentSubject(s), false, s)
})

test("BAS and IAS match only as whole upper-case words", () => {
  for (const s of ["BASIC kitchen induction", "Bas van Dijk start date", "BIAS check", "ALIAS for hello@", "bas", "IASI order"]) {
    assert.equal(isPrivateSentSubject(s), false, s)
  }
  for (const s of ["PAYROLL TAX October", "Payroll Tax: October return", "Re: September BAS"]) {
    assert.equal(isPrivateSentSubject(s), true, s)
  }
})

test("leading whitespace is trimmed but the anchored subjects need their exact start", () => {
  assert.equal(matchPrivateSentSubject("  Tarte weekly: 28 Oct to 3 Nov")?.key, "weekly-digest")
  assert.equal(isPrivateSentSubject("tarte weekly: 28 Oct"), false)
  // the owner daily is anchored at both ends
  assert.equal(isPrivateSentSubject("Tarte today, Mon 9 Nov: wages and COGS"), true)
  assert.equal(isPrivateSentSubject("Tarte today, Mon 9 Nov: wages and COGS, draft"), false)
  // GM morning note: only the money themes, and only with the (n to do) tail
  assert.equal(isPrivateSentSubject("Today: Rosters and wages (0 to do)"), true)
  assert.equal(isPrivateSentSubject("Today: Kitchen and money (3 to do)"), true)
})

test("decideTrash keeps a self-sent HACCP email (SENT and INBOX on one id), flag or not", () => {
  const haccp = sent({
    labelIds: ["SENT", "INBOX", "UNREAD", "CATEGORY_UPDATES"],
    subject: "[Tarte] HACCP Temperature Check - PM - Bakery - 2026-11-07 - 2 BREACH",
    to: "accounts@tarte.com.au",
  })
  assert.deepEqual(decideTrash(haccp, ME), { trash: false, reason: "also in the Inbox" })
  assert.deepEqual(decideTrash(haccp, ME, { explicit: true }), { trash: false, reason: "also in the Inbox" })
})

test("decideTrash keeps a self-sent copy a filter skipped the inbox for", () => {
  const filtered = sent({ labelIds: ["SENT", "Label_42"], to: "accounts@tarte.com.au" })
  assert.deepEqual(decideTrash(filtered, ME, { explicit: true }), { trash: false, reason: "this mailbox is a recipient" })
})

test("decideTrash keeps received replies, archived mail, drafts and unlabelled ids", () => {
  const reply = sent({ labelIds: ["INBOX", "UNREAD", "IMPORTANT"], subject: "Re: Tarte weekly: 28 Oct to 3 Nov 2026", from: "Chloe Watts <chloe@tarte.com.au>", to: ME })
  const archived = sent({ labelIds: ["IMPORTANT", "CATEGORY_PERSONAL"], from: "Chloe Watts <chloe@tarte.com.au>", to: ME })
  const draft = sent({ labelIds: ["DRAFT"] })
  const bare = sent({ labelIds: [] })
  for (const m of [reply, archived, draft, bare]) {
    assert.deepEqual(decideTrash(m, ME), { trash: false, reason: "not a Sent message" })
    assert.deepEqual(decideTrash(m, ME, { explicit: true }), { trash: false, reason: "not a Sent message" })
  }
})

test("decideTrash keeps onboarding and operational Sent copies unless the sender flagged them", () => {
  for (const subject of ["Your signed copy: Employment Contract", "Set your Tarte Shifts PIN", "End of day Sunday 8 November: 12 open, 4 with nobody on them"]) {
    assert.deepEqual(decideTrash(sent({ subject, to: "sam@tarte.com.au" }), ME), { trash: false, reason: "subject not on the private list" })
  }
})

test("decideTrash keeps mail sent from another address, even with the flag", () => {
  const alias = sent({ from: "Tarte <hello@tarte.com.au>" })
  assert.deepEqual(decideTrash(alias, ME, { explicit: true }), { trash: false, reason: "not sent from this mailbox" })
  assert.deepEqual(decideTrash(sent({ from: "" }), ME, { explicit: true }), { trash: false, reason: "not sent from this mailbox" })
})

test("decideTrash trashes a Bcc-only private Sent copy (empty To)", () => {
  const d = decideTrash(sent({ to: "", subject: "COGS TRACKING (Wed 4 to Tue 10 Nov): 3 days to go" }), ME)
  assert.equal(d.trash, true)
  if (d.trash) assert.equal(d.pattern?.key, "cogs-tracking")
})

test("sweep queries never widen past Sent; a zero or negative look-back means all time, never before the floor", () => {
  const floorSec = Math.floor(SENT_TIDY_FLOOR_MS / 1000)
  for (const p of PRIVATE_SENT_PATTERNS) {
    for (const days of [0, -7, undefined]) {
      const q = sweepQuery(p, days, FRI)
      assert.match(q, /^in:sent -in:trash /)
      assert.ok(!q.includes("newer_than"), p.key)
      if (p.appOnly) assert.ok(!q.includes("after:"), `${p.key} ${days}`)
      else assert.ok(q.endsWith(` after:${floorSec}`), `${p.key} ${days}`)
    }
    assert.ok(!/\bin:(inbox|anywhere|all)\b|\bin:\w+\s+OR\b/i.test(p.query), p.key)
  }
})

test("the floor follows the matched pattern, not the search that found the copy", () => {
  const sep = Date.parse("2026-09-30T02:00:00Z")
  // Louise-era reply to Matt: kept, flag or not
  const louise = sent({ subject: "Re: September BAS", to: "matt@example.com.au", internalDate: sep })
  assert.equal(decideTrash(louise, ME).trash, false)
  assert.equal(decideTrash(louise, ME, { explicit: true }).trash, false)
  // the same subject sent after the floor is trashed
  assert.equal(decideTrash({ ...louise, internalDate: FRI }, ME).trash, true)
  // an app-only digest from September still goes
  assert.equal(decideTrash(sent({ internalDate: sep }), ME).trash, true)
})

test("gmailReconnectAllowed: blank or other mailboxes never replace accounts@", () => {
  const prev = process.env.GMAIL_EXPECTED_EMAIL
  try {
    process.env.GMAIL_EXPECTED_EMAIL = ""
    assert.equal(expectedGmailMailbox(), "accounts@tarte.com.au")
    process.env.GMAIL_EXPECTED_EMAIL = " Accounts@Tarte.com.au "
    assert.equal(expectedGmailMailbox(), "accounts@tarte.com.au")
    delete process.env.GMAIL_EXPECTED_EMAIL
    assert.equal(gmailReconnectAllowed("accounts@tarte.com.au", ""), false)
    assert.equal(gmailReconnectAllowed(null, ""), false)
    assert.equal(gmailReconnectAllowed(null, " accounts@tarte.com.au "), true)
    // an empty stored email falls back to the expected mailbox
    assert.equal(gmailReconnectAllowed("", "accounts@tarte.com.au"), true)
    assert.equal(gmailReconnectAllowed("", "chloe@tarte.com.au"), false)
    assert.equal(gmailReconnectAllowed("accounts@tarte.com.au", "hello@tarte.com.au"), false)
  } finally {
    if (prev === undefined) delete process.env.GMAIL_EXPECTED_EMAIL
    else process.env.GMAIL_EXPECTED_EMAIL = prev
  }
})

// Found by the pre-push guard and fixed before push: a long subject a
// mailer folded into two encoded words must decode without a stray space.
test("decodeMimeHeader joins adjacent encoded words but keeps real spaces (RFC 2047 6.2)", () => {
  const b = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`
  const folded = `${b("Tarte wee")}\r\n ${b("kly: 28 Oct to 3 Nov 2026")}`
  assert.equal(decodeMimeHeader(folded), "Tarte weekly: 28 Oct to 3 Nov 2026")
  assert.equal(matchPrivateSentSubject(folded)?.key, "weekly-digest")
  // a space next to plain text is real text and stays
  assert.equal(decodeMimeHeader(`${b("Venue results")} w/e Tue 3 November`), "Venue results w/e Tue 3 November")
  assert.equal(decodeMimeHeader(`Re: ${b("Tarte weekly:")} 28 Oct`), "Re: Tarte weekly: 28 Oct")
  // an operational subject folded the same way still stays in Sent
  assert.equal(isPrivateSentSubject(`${b("End of day Sunday 8 November: 12 open,")} ${b(" 4 with nobody on them")}`), false)
})
