import { test, describe } from "node:test"
import assert from "node:assert/strict"

process.env.NEXTAUTH_SECRET = "test-only-secret-not-real-0000000000"

import { STAFF_SESSION_DAYS, buildStaffCookieValue, checkStaffCredentials, isValidStaffCookie } from "./staff-auth"

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k]
    if (vars[k] === undefined) delete process.env[k]
    else process.env[k] = vars[k]
  }
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })
}

describe("legacy shared staff password gate", () => {
  test("fails closed when the expected username or password is unset", () =>
    withEnv({ STAFF_USERNAME: undefined, STAFF_PASSWORD: undefined }, async () => {
      assert.equal(await checkStaffCredentials("tarte", "anything"), false)
      assert.equal(await checkStaffCredentials("", ""), false)
    }))

  test("empty password never matches even if configured empty", () =>
    withEnv({ STAFF_USERNAME: "tarte", STAFF_PASSWORD: "" }, async () => {
      assert.equal(await checkStaffCredentials("tarte", ""), false)
    }))

  test("username is case and whitespace tolerant, password is exact", () =>
    withEnv({ STAFF_USERNAME: "tarte", STAFF_PASSWORD: "Cr0issant!" }, async () => {
      assert.equal(await checkStaffCredentials("Tarte", "Cr0issant!"), true)
      assert.equal(await checkStaffCredentials("  TARTE ", "Cr0issant!"), true)
      assert.equal(await checkStaffCredentials("tarte", "cr0issant!"), false)
      assert.equal(await checkStaffCredentials("tarte", "Cr0issant! "), false)
      assert.equal(await checkStaffCredentials("tart", "Cr0issant!"), false)
      assert.equal(await checkStaffCredentials("tarte", ""), false)
    }))

  test("cookie round-trips and expires in 90 days measured in ms", async () => {
    const before = Date.now()
    const { value, expiresAt } = await buildStaffCookieValue()
    const days = (expiresAt.getTime() - before) / 86_400_000
    assert.ok(days > STAFF_SESSION_DAYS - 0.01 && days <= STAFF_SESSION_DAYS + 0.01)
    assert.equal(await isValidStaffCookie(value), true)
  })

  test("rejects missing, malformed, tampered and expired cookies", async () => {
    assert.equal(await isValidStaffCookie(undefined), false)
    assert.equal(await isValidStaffCookie(null), false)
    assert.equal(await isValidStaffCookie(""), false)
    assert.equal(await isValidStaffCookie("nodot"), false)
    assert.equal(await isValidStaffCookie("123."), false)
    const { value } = await buildStaffCookieValue()
    const [payload, sig] = value.split(".")
    // Move the expiry forward by a year, keep the old signature.
    assert.equal(await isValidStaffCookie(`${Number(payload) + 365 * 86_400_000}.${sig}`), false)
    assert.equal(await isValidStaffCookie(`${payload}.${sig.slice(1)}`), false)
    assert.equal(await isValidStaffCookie(`${payload}.${"0".repeat(64)}`), false)
    // Non numeric / infinite payloads with a wrong signature are refused too.
    assert.equal(await isValidStaffCookie(`Infinity.${sig}`), false)
    assert.equal(await isValidStaffCookie(`NaN.${sig}`), false)
  })
})
