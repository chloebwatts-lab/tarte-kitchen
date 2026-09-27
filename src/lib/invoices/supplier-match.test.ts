import { test } from "node:test"
import assert from "node:assert/strict"
import {
  isOwnMailbox,
  isOwnEntityLetterhead,
  isIgnoredSender,
  letterheadMatches,
  disambiguateSupplier,
  type SupplierRef,
} from "./supplier-match"

const FERMEX: SupplierRef = { id: "f", name: "Fermex" }
const BIDFOOD: SupplierRef = { id: "b", name: "Bidfood" }
const PIXEL: SupplierRef = { id: "pb", name: "Pixel Bread" }
const BREADTOP: SupplierRef = { id: "bt", name: "Breadtop" }
const CHEESE_TIME: SupplierRef = { id: "ct", name: "Cheese Time" }
const PARAMOUNT: SupplierRef = { id: "pl", name: "Paramount Liquor" }
const LIQUOR_BARONS: SupplierRef = { id: "lb", name: "Liquor Barons" }
const COASTAL: SupplierRef = { id: "cf", name: "Coastal Fresh" }
const GC_PREMIUM: SupplierRef = { id: "gc", name: "Gold Coast Premium Foods" }

// ---------------------------------------------------------------- own mailbox / entity

test("isOwnMailbox: tarte.com.au only, case-insensitive, trimmed", () => {
  assert.equal(isOwnMailbox("chloe@tarte.com.au"), true)
  assert.equal(isOwnMailbox("ACCOUNTS@TARTE.COM.AU"), true)
  assert.equal(isOwnMailbox("  hello@tarte.com.au  "), true)
  assert.equal(isOwnMailbox("x@tarte.com.au.evil.com"), false)
  assert.equal(isOwnMailbox("x@nottarte.com.au"), false)
  assert.equal(isOwnMailbox("accounts@bidfood.com.au"), false)
  assert.equal(isOwnMailbox(null), false)
  assert.equal(isOwnMailbox(""), false)
})

test("isOwnEntityLetterhead: our trusts and entities, never a supplier", () => {
  assert.equal(isOwnEntityLetterhead("Tarte Pty Ltd atf CBW Trust"), true)
  assert.equal(isOwnEntityLetterhead("TARTE CURRUMBIN PTY LTD"), true)
  assert.equal(isOwnEntityLetterhead("Saltwater Currumbin Trust t/a Tarte Beach House"), true)
  assert.equal(isOwnEntityLetterhead("Bidfood Gold Coast"), false)
  assert.equal(isOwnEntityLetterhead(null), false)
  assert.equal(isOwnEntityLetterhead(""), false)
})

// ---------------------------------------------------------------- ignored senders

test("isIgnoredSender: catches non-food senders via letterhead OR display name", () => {
  assert.equal(isIgnoredSender("Office of Liquor and Gaming Regulation", "Department of Justice and Attorney-General"), true)
  assert.equal(isIgnoredSender("AGC Catering Equipment Pty Ltd", null), true)
  assert.equal(isIgnoredSender(null, "Origin Energy"), true)
  assert.equal(isIgnoredSender("HERE TO HELP CLEAN", null), true)
  assert.equal(isIgnoredSender("Bidfood", "Bidfood Accounts"), false)
  assert.equal(isIgnoredSender("Paramount Liquor", "Paramount Liquor"), false)
  assert.equal(isIgnoredSender(null, null), false)
})

// ---------------------------------------------------------------- letterheadMatches

test("letterheadMatches: real supplier letterheads confirm", () => {
  assert.equal(letterheadMatches("Bidfood", "Bidfood Gold Coast (Burleigh Marr Distribution) Pty Ltd"), "match")
  assert.equal(letterheadMatches("Fermex", "  FERMEX PTY LTD  "), "match")
  assert.equal(letterheadMatches("The Provedores", "Provedores Distribution Qld"), "match")
  assert.equal(letterheadMatches("Global Food & Wine", "Global Food and Wine Pty Ltd"), "match")
  assert.equal(letterheadMatches("Son of a Bunn", "Son Of A Bunn Pty Ltd"), "match")
})

test("letterheadMatches: aliases (legal entities, platforms) confirm", () => {
  assert.equal(letterheadMatches("Breadtop", "Ka Wai Chan"), "match")
  assert.equal(letterheadMatches("Breadtop", "EAC Business Group Pty Ltd"), "match")
  assert.equal(letterheadMatches("Eustralis", "Pencil.One"), "match")
  assert.equal(letterheadMatches("Coastal Fresh", "The Dave's Wholesale Trust"), "match")
  assert.equal(letterheadMatches("Cookers", "Cookers Bulk Oil System Pty Ltd"), "match")
  assert.equal(letterheadMatches("Paramount Liquor", "Tambavale Pty Ltd"), "match")
})

test("letterheadMatches: completely different companies mismatch", () => {
  assert.equal(letterheadMatches("Paramount Liquor", "Origin Energy"), "mismatch")
  assert.equal(letterheadMatches("Pixel Bread", "Breadtop Aus Fair Pty Ltd"), "mismatch") // token-level, not substring
  assert.equal(letterheadMatches("Fermex", "Bidfood Gold Coast"), "mismatch")
  assert.equal(letterheadMatches("Fermex", "Fermx"), "mismatch") // a typo is a mismatch, by design
})

test("letterheadMatches: shared generic token is enough (why isIgnoredSender must run first)", () => {
  assert.equal(letterheadMatches("Paramount Liquor", "Office of Liquor and Gaming Regulation"), "match")
})

test("letterheadMatches: missing, blank, own-entity or noise-only names are unverifiable", () => {
  assert.equal(letterheadMatches("Bidfood", null), "unverifiable")
  assert.equal(letterheadMatches("Bidfood", "   "), "unverifiable")
  assert.equal(letterheadMatches("Bidfood", "Tarte Currumbin Pty Ltd"), "unverifiable")
  assert.equal(letterheadMatches("Breadtop", "Tarte Pty Ltd atf CBW Trust"), "unverifiable")
  assert.equal(letterheadMatches("Co", "Zed Ltd"), "unverifiable") // supplier name is pure noise words
})

// ---------------------------------------------------------------- disambiguateSupplier

test("disambiguateSupplier: sole candidate still has to pass the letterhead", () => {
  assert.deepEqual(disambiguateSupplier([PARAMOUNT], "Paramount Liquor Pty Ltd", "Paramount"), { supplier: PARAMOUNT, reason: null })
  assert.deepEqual(disambiguateSupplier([PARAMOUNT], null, "Paramount"), { supplier: PARAMOUNT, reason: null })
  const r = disambiguateSupplier([PARAMOUNT], "Origin Energy", "Origin Energy")
  assert.equal(r.supplier, null)
  assert.match(r.reason ?? "", /contradicted by letterhead "Origin Energy"/)
})

test("disambiguateSupplier: sender hints break Xero-relay ties", () => {
  assert.equal(disambiguateSupplier([BREADTOP, PIXEL], "Tarte Pty Ltd atf CBW Trust", "Ka Wai Chan").supplier?.id, "bt")
  assert.equal(disambiguateSupplier([BREADTOP, PIXEL], "EAC Business Group Pty Ltd", null).supplier?.id, "bt")
  assert.equal(disambiguateSupplier([COASTAL, GC_PREMIUM], "The Dave's Wholesale Trust", "Accounts Receivable - Coastal Fresh").supplier?.id, "cf")
})

test("disambiguateSupplier: hint only selects from the mapped candidates", () => {
  // Breadtop is not a candidate on this address, so the hint must not conjure it.
  const r = disambiguateSupplier([FERMEX, BIDFOOD], "Ka Wai Chan", null)
  assert.equal(r.supplier, null)
})

test("disambiguateSupplier: unique distinctive token wins", () => {
  assert.equal(disambiguateSupplier([PIXEL, CHEESE_TIME], "Pixel Bakehouse Pty Ltd", null).supplier?.id, "pb")
  assert.equal(disambiguateSupplier([FERMEX, BIDFOOD], "Bidfood Gold Coast (Burleigh Marr Distribution)", "Bidfood AR").supplier?.id, "b")
})

test("disambiguateSupplier: shared token across candidates is ambiguous, not a coin flip", () => {
  const r = disambiguateSupplier([PARAMOUNT, LIQUOR_BARONS], "Liquor Wholesale", null)
  assert.equal(r.supplier, null)
  assert.match(r.reason ?? "", /ambiguous/)
  assert.match(r.reason ?? "", /Paramount Liquor and Liquor Barons/)
})

test("disambiguateSupplier: nothing matches yields null with a diagnostic reason", () => {
  const r = disambiguateSupplier([FERMEX, BIDFOOD], "Origin Energy", "Origin")
  assert.equal(r.supplier, null)
  assert.match(r.reason ?? "", /no candidate matched/)
  assert.deepEqual(disambiguateSupplier([], "Bidfood", null).supplier, null)
  assert.deepEqual(disambiguateSupplier([FERMEX, BIDFOOD], null, null).supplier, null)
})

test("disambiguateSupplier: fuzzy winner is still rejected when the letterhead contradicts it", () => {
  const r = disambiguateSupplier([FERMEX, BIDFOOD], "Fermx", null)
  assert.equal(r.supplier, null)
  assert.match(r.reason ?? "", /no candidate matched|contradicted by letterhead/)
})
