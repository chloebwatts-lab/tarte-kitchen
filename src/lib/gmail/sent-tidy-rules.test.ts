import { test } from "node:test"
import assert from "node:assert/strict"
import {
  PRIVATE_SENT_PATTERNS,
  SENT_TIDY_FLOOR_MS,
  addressesIn,
  decideTrash,
  decodeMimeHeader,
  isPrivateSentSubject,
  isTruthyFlag,
  matchKeepSentSubject,
  matchPrivateSentSubject,
  sweepQuery,
  tidyLogLine,
  type SentMeta,
} from "./sent-tidy-rules"

const ME = "accounts@tarte.com.au"
const NOV9 = Date.parse("2026-11-09T04:04:53Z")
const meta = (over: Partial<SentMeta> = {}): SentMeta => ({
  id: "1a1be7afb9566222",
  internalDate: NOV9,
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
  const digest = PRIVATE_SENT_PATTERNS.find((p) => p.key === "weekly-digest")!
  assert.equal(sweepQuery(digest), 'in:sent -in:trash subject:"Tarte weekly"')
  assert.equal(sweepQuery(digest, 30, NOV9), `in:sent -in:trash subject:"Tarte weekly" after:${Math.floor((NOV9 - 30 * 86_400_000) / 1000)}`)
  assert.equal(new Set(PRIVATE_SENT_PATTERNS.map((p) => p.key)).size, PRIVATE_SENT_PATTERNS.length)
})

test("floor: BAS, IAS, payroll tax and team notes never reach before 1 Nov 2026", () => {
  assert.equal(new Date(SENT_TIDY_FLOOR_MS).toISOString(), "2026-10-31T14:00:00.000Z") // 1 Nov 00:00 AEST
  const floorSec = Math.floor(SENT_TIDY_FLOOR_MS / 1000)
  for (const key of ["bas", "ias", "payroll-tax", "team-notes"]) {
    const p = PRIVATE_SENT_PATTERNS.find((x) => x.key === key)!
    assert.equal(p.appOnly, undefined, key)
    assert.ok(sweepQuery(p).endsWith(` after:${floorSec}`), key)
    // a longer look-back is clamped to the floor, a shorter one is kept
    assert.ok(sweepQuery(p, 3650, NOV9).endsWith(` after:${floorSec}`), key)
    assert.ok(sweepQuery(p, 7, NOV9).endsWith(` after:${Math.floor((NOV9 - 7 * 86_400_000) / 1000)}`), key)
  }
})

test("floor: Louise-era tax mail is kept, CBK notes since 1 Nov are trashed", () => {
  const old = meta({ subject: "Payroll Tax Burleigh - $52,594.47 due 21st July", internalDate: Date.parse("2025-07-10T01:00:00Z") })
  assert.deepEqual(decideTrash(old, ME), { trash: false, reason: "sent before 1 Nov 2026, kept as a record" })
  assert.deepEqual(decideTrash(meta({ subject: "IAS Nov23 Burleigh 27,128, Currumbin 33,083", internalDate: Date.parse("2023-12-01T00:00:00Z") }), ME).trash, false)
  // one minute before the floor is kept, the floor itself is not
  assert.equal(decideTrash(meta({ subject: "October IAS lodged", internalDate: SENT_TIDY_FLOOR_MS - 60_000 }), ME).trash, false)
  assert.equal(decideTrash(meta({ subject: "October IAS lodged", internalDate: SENT_TIDY_FLOOR_MS }), ME).trash, true)
  assert.equal(decideTrash(meta({ subject: "September BAS and October IAS: pack for Matt, ready to forward" }), ME).trash, true)
  // the explicit flag does not lift the floor either
  assert.equal(decideTrash(meta({ subject: "Set your Tarte Shifts PIN", internalDate: Date.parse("2026-10-01T00:00:00Z") }), ME, { explicit: true }).trash, false)
  // a missing date counts as old
  assert.equal(decideTrash(meta({ subject: "September quarter BAS readiness", internalDate: Number.NaN }), ME).trash, false)
})

test("app-only subjects are trashed whatever their age", () => {
  const sep = Date.parse("2026-09-21T06:00:00Z")
  assert.equal(decideTrash(meta({ subject: "Oliver's Monday report, Wed 16 Sep to Tue 22 Sep", internalDate: sep }), ME).trash, true)
  assert.equal(decideTrash(meta({ subject: "Tarte weekly: 15 to 21 Sep", internalDate: sep }), ME).trash, true)
  assert.equal(decideTrash(meta({ subject: "Team notes 15 to 21 Sep", internalDate: sep }), ME).trash, false)
})

test("dry-run flag parsing", () => {
  for (const v of ["1", "true", "TRUE", "yes", " on "]) assert.equal(isTruthyFlag(v), true, v)
  for (const v of [undefined, null, "", "0", "false", "no"]) assert.equal(isTruthyFlag(v), false, String(v))
})

test("keep list: payment files and CBK needs you stay in Sent, whatever else the subject says", () => {
  assert.equal(matchKeepSentSubject("Payment files Wed 11 November"), "payment-files")
  assert.equal(matchKeepSentSubject("CBK needs you: how to pay Iconic"), "cbk-needs-you")
  for (const s of ["Payment files Wed 11 November: BAS top-up", "CBK needs you: September BAS sign-off", "CBK needs you: payroll tax due 7th"]) {
    assert.equal(isPrivateSentSubject(s), false, s)
    assert.deepEqual(decideTrash(meta({ subject: s }), ME), { trash: false, reason: `on the keep list (${matchKeepSentSubject(s)})` }, s)
    // a sender flag, or a person lifting the floor, does not override the keep list
    assert.equal(decideTrash(meta({ subject: s }), ME, { explicit: true, includeBeforeFloor: true }).trash, false, s)
  }
  // only at the start of the subject
  assert.equal(matchKeepSentSubject("Re: September BAS (CBK needs you: later)"), null)
})

test("include-before-floor: one named old tax note can go, nothing else changes", () => {
  const sep = Date.parse("2026-09-05T10:01:23Z")
  const louise = meta({ subject: "Burleigh Payroll Tax - August", internalDate: sep })
  assert.equal(decideTrash(louise, ME).trash, false)
  assert.equal(decideTrash(louise, ME, { includeBeforeFloor: true }).trash, true)
  // still needs a subject on the list, even with the sender flag
  const pin = meta({ subject: "Set your Tarte Shifts PIN", internalDate: sep })
  assert.equal(decideTrash(pin, ME, { includeBeforeFloor: true }).trash, false)
  assert.equal(decideTrash(pin, ME, { includeBeforeFloor: true, explicit: true }).trash, false)
  // and every mailbox check still applies
  assert.equal(decideTrash({ ...louise, labelIds: ["SENT", "INBOX"] }, ME, { includeBeforeFloor: true }).trash, false)
  assert.equal(decideTrash({ ...louise, to: "accounts@tarte.com.au" }, ME, { includeBeforeFloor: true }).trash, false)
  assert.equal(decideTrash({ ...louise, from: "chloe@tarte.com.au" }, ME, { includeBeforeFloor: true }).trash, false)
})
