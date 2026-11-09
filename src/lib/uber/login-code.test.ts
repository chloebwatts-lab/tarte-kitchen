import { test } from "node:test"
import assert from "node:assert/strict"
import { extractUberLoginCode, isUberSender, pickLoginCode } from "./login-code"

test("isUberSender: uber.com and its subdomains, display names, nothing else", () => {
  assert.equal(isUberSender("Uber <admin@uber.com>"), true)
  assert.equal(isUberSender("noreply@uber.com"), true)
  assert.equal(isUberSender("Uber Eats <no-reply@mail.uber.com>"), true)
  assert.equal(isUberSender("someone@uber.com.evil.example"), false)
  assert.equal(isUberSender("news@ubereats.com"), false)
  assert.equal(isUberSender("Square <noreply@messaging.squareup.com>"), false)
  assert.equal(isUberSender(null), false)
})

test("extractUberLoginCode: the wordings Uber has used, subject or body", () => {
  assert.equal(extractUberLoginCode("Your Uber login code", "Do not share: 4821\nIf you did not request this, ignore it."), "4821")
  assert.equal(extractUberLoginCode("7310 is your Uber code", ""), "7310")
  assert.equal(extractUberLoginCode(null, "Your verification code is 0042. It expires in 10 minutes."), "0042")
  assert.equal(extractUberLoginCode(null, "Enter this code to log in\n\n5566\n\nThanks, Uber"), "5566")
})

test("extractUberLoginCode: no code in a marketing email, years and money are not codes", () => {
  assert.equal(extractUberLoginCode("Your 2026 Uber Eats summary", "You earned $1,234 in 2026 across 48 weeks."), null)
  assert.equal(extractUberLoginCode("Two offers", "Save 1500 or 2500 points this week"), null)
})

test("pickLoginCode: newest fresh Uber code only, ignores older attempts and other senders", () => {
  const t0 = Date.parse("2026-11-09T04:00:00Z")
  const msgs = [
    { id: "old", receivedAt: t0 - 60_000, from: "Uber <admin@uber.com>", subject: "Your Uber login code", body: "Do not share: 1111" },
    { id: "spoof", receivedAt: t0 + 30_000, from: "x@uber.com.evil.example", subject: "code", body: "Do not share: 2222" },
    { id: "a", receivedAt: t0 + 10_000, from: "Uber <admin@uber.com>", subject: "Your Uber login code", body: "Do not share: 3333" },
    { id: "b", receivedAt: t0 + 20_000, from: "Uber <admin@uber.com>", subject: "Your Uber login code", body: "Do not share: 4444" },
  ]
  assert.deepEqual(pickLoginCode(msgs, t0), { code: "4444", receivedAt: t0 + 20_000, subject: "Your Uber login code" })
  assert.equal(pickLoginCode(msgs, t0 + 60_000), null)
  assert.equal(pickLoginCode([], t0), null)
})

test("isUberSender: case, odd spacing and look-alike domains", () => {
  assert.equal(isUberSender("ADMIN@UBER.COM"), true)
  assert.equal(isUberSender("Uber <  Admin@Uber.com  >"), true)
  assert.equal(isUberSender("admin@notuber.com"), false)
  assert.equal(isUberSender("uber.com@evil.example"), false)
  assert.equal(isUberSender(""), false)
  assert.equal(isUberSender(undefined), false)
})

test("extractUberLoginCode: HTML-ish bodies, code split from its label by whitespace and tags", () => {
  assert.equal(extractUberLoginCode("Your Uber login code", "<p><strong>Do not share:</strong></p>\r\n\r\n<span>  9072  </span>"), "9072")
  assert.equal(extractUberLoginCode(null, "Your code is\n\n\n   3085\n\nIt expires in 10 minutes."), "3085")
  assert.equal(extractUberLoginCode("Your Uber code: 6614", ""), "6614")
})

test("extractUberLoginCode: codes starting with 0 and codes that look like years", () => {
  assert.equal(extractUberLoginCode(null, "Enter this code to log in\n\n0042\n\nThanks, Uber"), "0042")
  assert.equal(extractUberLoginCode(null, "Do not share: 2026"), "2026")
  assert.equal(extractUberLoginCode(null, "Do not share: 0007. Uber Technologies, 2026"), "0007")
})

test("extractUberLoginCode: code next to a year, a time or a footer address", () => {
  assert.equal(extractUberLoginCode(null, "Enter this code to log in\n\n5566\n\n(c) 2026 Uber Technologies Inc."), "5566")
  assert.equal(extractUberLoginCode(null, "Your code expires at 10:45 today. Code: 4821"), "4821")
  assert.equal(extractUberLoginCode(null, "Do not share: 4821\nUber Technologies, 1515 3rd St, San Francisco"), "4821")
})

test("extractUberLoginCode: five digits, money, percentages and empty input are not codes", () => {
  assert.equal(extractUberLoginCode(null, "Do not share: 12345"), null)
  assert.equal(extractUberLoginCode(null, "You paid $4821 and saved 2500% more"), null)
  assert.equal(extractUberLoginCode(null, null), null)
  assert.equal(extractUberLoginCode("", ""), null)
})

test("pickLoginCode: since boundary is inclusive, a fresher Uber email without a code is skipped", () => {
  const t0 = Date.parse("2026-11-09T04:00:00Z")
  const msgs = [
    { id: "exact", receivedAt: t0, from: "Uber <admin@uber.com>", subject: "Your Uber login code", body: "Do not share: 7777" },
    { id: "promo", receivedAt: t0 + 5_000, from: "Uber Eats <noreply@uber.com>", subject: "Your 2026 Uber Eats summary", body: "You earned $1,234 in 2026 across 48 weeks." },
    { id: "late", receivedAt: t0 - 1, from: "Uber <admin@uber.com>", subject: "Your Uber login code", body: "Do not share: 8888" },
  ]
  assert.deepEqual(pickLoginCode(msgs, t0), { code: "7777", receivedAt: t0, subject: "Your Uber login code" })
  assert.equal(pickLoginCode(msgs, t0 + 1), null)
})
