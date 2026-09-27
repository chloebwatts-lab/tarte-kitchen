import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { isUsableName, scrubReply } from "./scrub-reply"

describe("scrubReply voice guards", () => {
  test("em and en dashes become commas, with no double spacing", () => {
    assert.equal(scrubReply("Thanks Sam — the crullers are fresh daily"), "Thanks Sam, the crullers are fresh daily")
    assert.equal(scrubReply("Thanks Sam – see you soon"), "Thanks Sam, see you soon")
    assert.equal(scrubReply("Thanks Sam—see you soon"), "Thanks Sam, see you soon")
    const out = scrubReply("A — B – C — D")
    assert.equal(/[—–]/.test(out), false)
  })

  test("a spaced hyphen used as a dash is a comma, hyphenated words stay", () => {
    assert.equal(scrubReply("Great spot - loved the bake"), "Great spot, loved the bake")
    assert.equal(scrubReply("Great spot -- loved the bake"), "Great spot, loved the bake")
    assert.equal(scrubReply("A well-made drop-in brunch"), "A well-made drop-in brunch")
    assert.equal(scrubReply("Open 6am-2pm daily"), "Open 6am-2pm daily")
  })

  test("ellipses become a full stop", () => {
    assert.equal(scrubReply("We hear you... and we're sorry"), "We hear you. and we're sorry")
    assert.equal(scrubReply("We hear you… and we're sorry"), "We hear you. and we're sorry")
    assert.equal(/\.{3}|…/.test(scrubReply("Hmm... ok… fine...")), false)
  })

  test("churro becomes cruller, keeping case and plurals", () => {
    assert.equal(scrubReply("Glad you loved the churro"), "Glad you loved the cruller")
    assert.equal(scrubReply("Glad you loved the churros"), "Glad you loved the crullers")
    assert.equal(scrubReply("Churros are back"), "Crullers are back")
    assert.equal(scrubReply("Churro fans rejoice"), "Cruller fans rejoice")
    assert.equal(scrubReply("CHURROS!"), "Crullers!")
    // Not inside other words.
    assert.equal(scrubReply("churrosity"), "churrosity")
  })

  test("comma swaps do not leave stray punctuation", () => {
    assert.equal(scrubReply("Thanks again — ."), "Thanks again.")
    assert.equal(scrubReply("Thanks again — !"), "Thanks again!")
    assert.equal(scrubReply("Thanks , again"), "Thanks, again")
    assert.equal(scrubReply("Thanks  again   Sam"), "Thanks again Sam")
  })

  test("trims and leaves clean text untouched", () => {
    const clean = "Thanks Sam, we're glad the sourdough hit the spot at Tarte Burleigh. See you next weekend."
    assert.equal(scrubReply(clean), clean)
    assert.equal(scrubReply(`  ${clean}\n`), clean)
    assert.equal(scrubReply(""), "")
  })

  test("newlines between paragraphs survive", () => {
    assert.equal(scrubReply("Hi Sam.\n\nThanks — really."), "Hi Sam.\n\nThanks, really.")
  })
})

describe("isUsableName", () => {
  test("rejects empty, short and truncated-article names", () => {
    assert.equal(isUsableName(null), false)
    assert.equal(isUsableName(undefined), false)
    assert.equal(isUsableName(""), false)
    assert.equal(isUsableName("  "), false)
    assert.equal(isUsableName("Jo"), false)
    assert.equal(isUsableName("The"), false)
    assert.equal(isUsableName("the"), false)
    assert.equal(isUsableName(" THE "), false)
    assert.equal(isUsableName("Mrs"), false)
    assert.equal(isUsableName("Anonymous"), false)
    assert.equal(isUsableName("Google"), false)
    assert.equal(isUsableName("Local"), false)
    assert.equal(isUsableName("Customer"), false)
  })

  test("rejects names with no run of three letters", () => {
    assert.equal(isUsableName("J. B."), false)
    assert.equal(isUsableName("123456"), false)
    assert.equal(isUsableName("A B C"), false)
    assert.equal(isUsableName("😀😀😀"), false)
  })

  test("accepts ordinary names", () => {
    assert.equal(isUsableName("Sam"), true)
    assert.equal(isUsableName("Chloe Watts"), true)
    assert.equal(isUsableName("Jo-Anne"), true)
    assert.equal(isUsableName("  Kai Tanaka "), true)
  })
})
