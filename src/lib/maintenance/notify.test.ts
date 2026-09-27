import { test } from "node:test"
import assert from "node:assert/strict"
import { fmtWhen, fmtDay, alertRecipients } from "./notify"

// Both formatters pin Australia/Brisbane, so a UTC droplet prints the same
// clock time staff see on the wall.

test("fmtWhen renders in Brisbane time, not host time", () => {
  // 14:05Z on Tue 22 Sep = 00:05 AEST on Wed 23 Sep
  const s = fmtWhen(new Date("2026-09-22T14:05:00Z"))
  assert.match(s, /Wed/)
  assert.match(s, /23/)
  assert.match(s, /12:05\s?am/i)
})

test("fmtWhen afternoon reading", () => {
  const s = fmtWhen(new Date("2026-09-27T05:30:00Z")) // Sun 27 Sep 15:30 AEST
  assert.match(s, /Sun/)
  assert.match(s, /27/)
  assert.match(s, /3:30\s?pm/i)
})

test("fmtDay gives the Brisbane weekday and date", () => {
  assert.match(fmtDay(new Date("2026-09-22T14:00:00Z")), /^Wednesday,? 23 Sep/)
  assert.match(fmtDay(new Date("2026-09-22T13:59:00Z")), /^Tuesday,? 22 Sep/)
})

test("alertRecipients falls back to the defaults when the env is empty or blank", () => {
  const prev = process.env.MAINTENANCE_ALERT_TO
  try {
    delete process.env.MAINTENANCE_ALERT_TO
    assert.deepEqual(alertRecipients(), ["hello@tarte.com.au", "shawna@tarte.com.au"])
    process.env.MAINTENANCE_ALERT_TO = "  , ,  "
    assert.deepEqual(alertRecipients(), ["hello@tarte.com.au", "shawna@tarte.com.au"])
    process.env.MAINTENANCE_ALERT_TO = " chloe@tarte.com.au , oliver@tarte.com.au,, "
    assert.deepEqual(alertRecipients(), ["chloe@tarte.com.au", "oliver@tarte.com.au"])
  } finally {
    if (prev === undefined) delete process.env.MAINTENANCE_ALERT_TO
    else process.env.MAINTENANCE_ALERT_TO = prev
  }
})
