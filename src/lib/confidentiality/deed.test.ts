import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  DEED_CONSIDERATION,
  DEED_EXECUTION,
  DEED_INTRO,
  DEED_SECTIONS,
  DEED_TITLE,
  DEED_VERSION,
  TARTE_ENTITIES,
  deedPlainText,
} from "./deed"

describe("confidentiality deed text", () => {
  test("version string has the dated shape middleware compares on", () => {
    assert.match(DEED_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/)
  })

  test("plain text is deterministic so the stored SHA-256 can be re-proved", () => {
    const a = deedPlainText()
    const b = deedPlainText()
    assert.equal(a, b)
    const h1 = createHash("sha256").update(a).digest("hex")
    const h2 = createHash("sha256").update(b).digest("hex")
    assert.equal(h1, h2)
    assert.equal(h1.length, 64)
  })

  test("plain text carries every part staff are shown", () => {
    const t = deedPlainText()
    assert.ok(t.startsWith(`${DEED_TITLE}\nVersion ${DEED_VERSION}`))
    for (const line of DEED_INTRO) assert.ok(t.includes(line))
    for (const e of TARTE_ENTITIES) assert.ok(t.includes(`- ${e}`))
    assert.ok(t.includes(DEED_CONSIDERATION))
    for (const s of DEED_SECTIONS) {
      assert.ok(t.includes(s.heading), s.heading)
      for (const p of s.paragraphs) assert.ok(t.includes(p))
      for (const b of s.bullets ?? []) assert.ok(t.includes(`- ${b}`))
    }
    assert.ok(t.trimEnd().endsWith(DEED_EXECUTION))
  })

  test("sections are numbered 1..n in order with no gaps", () => {
    DEED_SECTIONS.forEach((s, i) => {
      assert.ok(s.heading.startsWith(`${i + 1}. `), s.heading)
      assert.ok(s.paragraphs.length > 0, s.heading)
    })
  })

  test("both trading entities with their ABNs are named", () => {
    assert.equal(TARTE_ENTITIES.length, 2)
    assert.ok(TARTE_ENTITIES[0].includes("ABN 35 686 638 057"))
    assert.ok(TARTE_ENTITIES[1].includes("ACN 666 527 920"))
    assert.ok(TARTE_ENTITIES[1].includes("ABN 81 931 246 394"))
  })

  test("keeps the legal carve-outs that stop it being read down", () => {
    const t = deedPlainText()
    assert.ok(/own pay and conditions/.test(t))
    assert.ok(/not a restraint of trade/.test(t))
    assert.ok(/law of Queensland/.test(t))
    assert.ok(/under 18/.test(t))
    assert.ok(/Executed as a deed poll/.test(t))
  })

  test("no em or en dashes anywhere in the published wording", () => {
    const t = deedPlainText()
    assert.equal(/[—–]/.test(t), false)
    // A hyphen used as a dash mid-sentence. Bullet markers at line start are fine.
    assert.equal(/\S -{1,2} /.test(t), false)
  })
})
