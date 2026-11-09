import { test } from "node:test"
import assert from "node:assert/strict"
import {
  PRIVATE_SENT_PATTERNS,
  addressesIn,
  decideTrash,
  decodeMimeHeader,
  isPrivateSentSubject,
  isTruthyFlag,
  matchPrivateSentSubject,
  sweepQuery,
  tidyLogLine,
  type SentMeta,
} from "./sent-tidy-rules"

const ME = "accounts@tarte.com.au"
const meta = (over: Partial<SentMeta> = {}): SentMeta => ({
  id: "1a1be7afb9566222",
  labelIds: ["SENT"],
  subject: "Tarte weekly: 28 Oct to 3 Nov",
  from: "Accounts Tarte <accounts@tarte.com.au>",
  to: "chloe@tarte.com.au",
  cc: "",
  ...over,
})

test("every in-scope subject on the coordinator's list is private", () => {
  for (const s of [
    "Tarte weekly: 28 Oct to 3 Nov 2026",
    "Venue results w/e Tue 3 November",
    "Team notes 28 Oct to 3 Nov",
    "Bookkeeping this week, Wed 11 November",
    "Tarte today, Mon 9 Nov: wages and COGS",
    "Tarte Shifts payroll check, week ending 2026-11-03",
    "Today: Rosters and wages (5 to do)",
    "Today: Kitchen and money (3 to do)",
    "Oliver's Monday report, w/e 3 Nov",
    "No Monday report from Oliver, w/e 3 Nov",
    "COGS TRACKING (Wed 4 to Tue 10 Nov): 3 days to go",
    "COGS TRACKING (Wed 4 to Tue 10 Nov): numbers withheld, check needed",
    "September quarter BAS readiness",
    "September BAS and October IAS: pack for Matt, ready to forward",
    "October IAS lodged",
    "Payroll tax October 2026: paid",
  ]) assert.ok(isPrivateSentSubject(s), s)
})

test("operational and onboarding subjects stay in Sent", () => {
  for (const s of [
    "End of day Sunday 8 November: 12 open, 4 with nobody on them",
    "[Tarte] 4 reviews to reply to (1 negative, 3 positive)",
    "[Tarte] HACCP Temperature Check - PM - Bakery - 2026-11-07 - 2 BREACH",
    "[Tarte] Checklists closing soon - 162 items still open",
    "Your signed copy: Employment Contract",
    "Your signed copy: Confidentiality and Intellectual Property Deed",
    "Set your Tarte Shifts PIN",
    "Time off request: Sam, 12 Nov",
    "Reminder: your Tarte new starter form (2 steps left)",
    "Onboarding: 1 thing to chase",
    "Tarte paperwork for Hanne: please fill in your form",
    "Today: People and quality (4 to do)",
    "Today: Every GM day (2 to do)",
    "6 still open today",
    "Monday report due 3pm",
    "Tarte Shifts: 7 done",
    "Shifts changes: 1 done, 1 needs you",
    "CBK needs you: Uber Burleigh and Lightspeed",
    "Tarte Bakery (Burleigh): statement please",
    "Weekly SEO check, week of 2026-10-26: Down",
    "Basil and bassinet", // BAS only as a whole word, upper case
    "Tarte: Louise's reports ingested (5/5)",
  ]) assert.equal(isPrivateSentSubject(s), false, s)
})

test("encoded subjects (Shifts and the droplet mailer encode them) are decoded", () => {
  const enc = `=?UTF-8?B?${Buffer.from("Tarte today, Tue 10 Nov: wages and COGS", "utf-8").toString("base64")}?=`
  assert.equal(decodeMimeHeader(enc), "Tarte today, Tue 10 Nov: wages and COGS")
  assert.equal(matchPrivateSentSubject(enc)?.key, "owner-daily")
  assert.equal(decodeMimeHeader("=?UTF-8?Q?Venue_results_w/e_Tue_3_November?="), "Venue results w/e Tue 3 November")
  assert.equal(decodeMimeHeader("plain subject"), "plain subject")
})

test("decideTrash trashes a plain private Sent copy", () => {
  const d = decideTrash(meta(), ME)
  assert.equal(d.trash, true)
  if (d.trash) assert.equal(d.pattern?.key, "weekly-digest")
})

test("decideTrash never touches inbox, received or self-sent mail", () => {
  assert.deepEqual(decideTrash(meta({ labelIds: ["INBOX"] }), ME), { trash: false, reason: "not a Sent message" })
  assert.deepEqual(decideTrash(meta({ labelIds: ["SENT", "INBOX", "UNREAD"] }), ME), { trash: false, reason: "also in the Inbox" })
  assert.deepEqual(decideTrash(meta({ labelIds: ["SENT", "TRASH"] }), ME), { trash: false, reason: "already in Trash" })
  assert.deepEqual(decideTrash(meta({ from: "chloe@tarte.com.au" }), ME), { trash: false, reason: "not sent from this mailbox" })
  assert.deepEqual(decideTrash(meta({ to: "chloe@tarte.com.au, accounts@tarte.com.au" }), ME), { trash: false, reason: "this mailbox is a recipient" })
  assert.deepEqual(decideTrash(meta({ cc: "Accounts <ACCOUNTS@tarte.com.au>" }), ME), { trash: false, reason: "this mailbox is a recipient" })
})

test("decideTrash needs the subject list unless the sender flagged it", () => {
  const m = meta({ subject: "Set your Tarte Shifts PIN" })
  assert.deepEqual(decideTrash(m, ME), { trash: false, reason: "subject not on the private list" })
  assert.equal(decideTrash(m, ME, { explicit: true }).trash, true)
  // the flag never overrides the mailbox safety checks
  assert.equal(decideTrash({ ...m, labelIds: ["SENT", "INBOX"] }, ME, { explicit: true }).trash, false)
})

test("mailbox comparison ignores case and display names", () => {
  assert.equal(decideTrash(meta({ from: "Tarte <Accounts@Tarte.com.au>" }), "ACCOUNTS@tarte.com.au").trash, true)
  assert.deepEqual(addressesIn('"Chloe Watts" <chloe@tarte.com.au>, shawna@tarte.com.au'), ["chloe@tarte.com.au", "shawna@tarte.com.au"])
  assert.deepEqual(addressesIn(undefined), [])
})

test("log line carries id, subject and source, one line", () => {
  const line = tidyLogLine({ action: "trashed", id: "abc123", subject: "Tarte weekly:\r\n x", via: "kitchen-send" })
  assert.equal(line, '[sent-tidy] trashed accounts@ Sent copy id=abc123 subject="Tarte weekly:  x" via=kitchen-send')
  assert.ok(!line.includes("\n"))
  assert.match(tidyLogLine({ action: "failed", id: "x", subject: "s", via: "v", reason: "token lacks gmail.modify" }), /reason=token lacks gmail\.modify$/)
})

test("sweep queries stay inside Sent and outside Trash", () => {
  for (const p of PRIVATE_SENT_PATTERNS) {
    const q = sweepQuery(p)
    assert.ok(q.startsWith("in:sent -in:trash "), q)
  }
  assert.equal(sweepQuery(PRIVATE_SENT_PATTERNS[0], 30), 'in:sent -in:trash subject:"Tarte weekly" newer_than:30d')
  assert.equal(new Set(PRIVATE_SENT_PATTERNS.map((p) => p.key)).size, PRIVATE_SENT_PATTERNS.length)
})

test("dry-run flag parsing", () => {
  for (const v of ["1", "true", "TRUE", "yes", " on "]) assert.equal(isTruthyFlag(v), true, v)
  for (const v of [undefined, null, "", "0", "false", "no"]) assert.equal(isTruthyFlag(v), false, String(v))
})
