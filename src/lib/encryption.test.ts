import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

// 32 random bytes, base64, obviously test-only.
const KEY_A = randomBytes(32).toString("base64")
const KEY_B = randomBytes(32).toString("base64")
process.env.TOKEN_ENCRYPTION_KEY = KEY_A

import { decrypt, encrypt } from "./encryption"

describe("token encryption", () => {
  test("round-trips text, unicode and long input", () => {
    for (const s of ["ya29.a0AfB_fake_google_refresh_token", "ünïcödé 🍰 crullers", "a".repeat(5000), " "]) {
      assert.equal(decrypt(encrypt(s)), s)
    }
  })

  test("KNOWN QUIRK: the empty string encrypts to a token decrypt refuses", () => {
    // encrypt("") yields "iv:tag:" and decrypt treats the empty ciphertext as
    // malformed. No caller stores an empty token today; documented, not fixed here.
    const enc = encrypt("")
    assert.ok(enc.endsWith(":"))
    assert.throws(() => decrypt(enc), /Invalid encrypted token format/)
  })

  test("output is iv:tag:ciphertext in hex, with a fresh IV each time", () => {
    const a = encrypt("same")
    const b = encrypt("same")
    assert.notEqual(a, b)
    const [iv, tag, ct] = a.split(":")
    assert.equal(iv.length, 32) // 16 bytes
    assert.equal(tag.length, 32) // 16 byte GCM tag
    assert.match(ct, /^[0-9a-f]*$/)
    assert.equal(a.split(":").length, 3)
  })

  test("tampered ciphertext is rejected", () => {
    const enc = encrypt("refresh-token-123")
    const [iv, tag, ct] = enc.split(":")
    const flip = (h: string) => (h[0] === "0" ? "1" : "0") + h.slice(1)
    assert.throws(() => decrypt(`${iv}:${tag}:${flip(ct)}`))
    assert.throws(() => decrypt(`${iv}:${flip(tag)}:${ct}`))
    assert.throws(() => decrypt(`${flip(iv)}:${tag}:${ct}`))
    // Truncated ciphertext
    assert.throws(() => decrypt(`${iv}:${tag}:${ct.slice(0, -2)}`))
    // Ciphertext from one message with the tag of another
    const enc2 = encrypt("refresh-token-456")
    const [, tag2] = enc2.split(":")
    assert.throws(() => decrypt(`${iv}:${tag2}:${ct}`))
  })

  test("malformed input is rejected with a clear error", () => {
    assert.throws(() => decrypt(""), /Invalid encrypted token format/)
    assert.throws(() => decrypt("abc"), /Invalid encrypted token format/)
    assert.throws(() => decrypt("aa:bb"), /Invalid encrypted token format/)
    assert.throws(() => decrypt("::"), /Invalid encrypted token format/)
    assert.throws(() => decrypt("aa::cc"), /Invalid encrypted token format/)
  })

  test("the wrong key cannot decrypt", () => {
    const enc = encrypt("secret")
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B
    try {
      assert.throws(() => decrypt(enc))
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = KEY_A
    }
    assert.equal(decrypt(enc), "secret")
  })

  test("no key set fails closed on both encrypt and decrypt", () => {
    const enc = encrypt("secret")
    delete process.env.TOKEN_ENCRYPTION_KEY
    try {
      assert.throws(() => encrypt("x"), /TOKEN_ENCRYPTION_KEY is not set/)
      assert.throws(() => decrypt(enc), /TOKEN_ENCRYPTION_KEY is not set/)
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = KEY_A
    }
  })

  test("a short key is refused rather than silently padded", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64")
    try {
      assert.throws(() => encrypt("x"))
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = KEY_A
    }
  })
})
