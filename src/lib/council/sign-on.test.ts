import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ASKS,
  FIELD_LIMITS,
  SCRIPT,
  STATUSES,
  STATUS_LABEL,
  cleanFields,
  isSignaturePng,
  isStatus,
  signProblem,
  signedTime,
  sortKey,
} from "./sign-on"

test("sortKey: drops a leading The, folds case and punctuation", () => {
  assert.equal(sortKey("The Pantry"), "pantry")
  assert.equal(sortKey("  pantry "), "pantry")
  assert.equal(sortKey("Fletcher's Pantry & Espresso"), "fletcher s pantry espresso")
  assert.equal(sortKey("Maman Bar & Kitchen"), sortKey("maman bar   kitchen"))
  assert.equal(sortKey("Café Ole"), "cafe ole")
  assert.equal(sortKey("Theory Bar"), "theory bar")
  assert.equal(sortKey(""), "")
})

test("isStatus: only the five known statuses", () => {
  for (const s of STATUSES) assert.ok(isStatus(s))
  assert.ok(!isStatus("deleted"))
  assert.ok(!isStatus(undefined))
  assert.ok(!isStatus(1))
  for (const s of STATUSES) assert.ok(STATUS_LABEL[s].length > 0)
})

test("cleanFields: trims, caps length, removes control characters, ignores unknown keys", () => {
  const f = cleanFields({ owner: "  Sam\nLee  ", note: "x".repeat(1000), hacker: "nope", email: 42 })
  assert.equal(f.owner, "Sam Lee")
  assert.equal(f.note.length, FIELD_LIMITS.note)
  assert.equal(f.email, "")
  assert.ok(!("hacker" in f))
  const empty = cleanFields(null)
  assert.equal(empty.worksPct, "")
  assert.deepEqual(Object.keys(empty).sort(), Object.keys(FIELD_LIMITS).sort())
})

test("isSignaturePng: accepts a PNG data URL, rejects anything else or too big", () => {
  const ok = "data:image/png;base64," + "iVBORw0KGgo".padEnd(400, "A") + "=="
  assert.ok(isSignaturePng(ok))
  assert.ok(!isSignaturePng("data:image/jpeg;base64," + "A".repeat(400)))
  assert.ok(!isSignaturePng("data:image/png;base64,short"))
  assert.ok(!isSignaturePng("data:image/png;base64," + "A".repeat(400) + "<script>"))
  assert.ok(!isSignaturePng("data:image/png;base64," + "A".repeat(500_000)))
  assert.ok(!isSignaturePng(null))
})

test("signProblem: needs a name and a signature", () => {
  assert.match(signProblem({ owner: " ", hasSignature: true }) ?? "", /name/)
  assert.match(signProblem({ owner: "Sam", hasSignature: false }) ?? "", /sign/)
  assert.equal(signProblem({ owner: "Sam", hasSignature: true }), null)
})

test("script and asks: no em dashes, no dollar totals beyond the per m2 rate", () => {
  const all = [...ASKS, ...SCRIPT.flatMap((s) => [s.heading, ...s.points])].join(" ")
  assert.ok(!/[–—]/.test(all))
  const dollars = all.match(/\$[0-9,]+/g) ?? []
  assert.deepEqual(dollars, ["$200"])
})

test("signedTime: keeps the iPad's time for an offline signature, refuses a silly clock", () => {
  const now = Date.parse("2026-11-20T03:00:00.000Z") // 1pm AEST
  const twoHoursAgo = "2026-11-20T01:00:00.000Z"
  assert.equal(signedTime(twoHoursAgo, now).toISOString(), twoHoursAgo)
  assert.equal(signedTime("2026-11-20T03:05:00.000Z", now).toISOString(), "2026-11-20T03:05:00.000Z")
  assert.equal(signedTime("2026-11-21T03:00:00.000Z", now).getTime(), now)
  assert.equal(signedTime("2025-01-01T00:00:00.000Z", now).getTime(), now)
  assert.equal(signedTime("not a date", now).getTime(), now)
  assert.equal(signedTime(undefined, now).getTime(), now)
})
