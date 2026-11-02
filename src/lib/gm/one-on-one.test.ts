import { test } from "node:test"
import assert from "node:assert/strict"
import { NOTE_TARGET_WORDS, noteCounter, talkNotesOf, wordCount } from "./one-on-one"

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ")

test("word count ignores extra spaces, tabs and new lines", () => {
  assert.equal(wordCount(""), 0)
  assert.equal(wordCount("   "), 0)
  assert.equal(wordCount("Jess  is\tgoing well.\n\nWants more  pastry shifts."), 8)
})

test("under 30 words counts down to the target", () => {
  assert.deepEqual(noteCounter(""), { line: "0 words. 30 to go to 30.", reached: false })
  assert.deepEqual(noteCounter("Going well"), { line: "2 words. 28 to go to 30.", reached: false })
  assert.deepEqual(noteCounter(words(29)), { line: "29 words. 1 to go to 30.", reached: false })
  assert.equal(noteCounter("one").line, "1 word. 29 to go to 30.")
})

test("30 words or more reaches the target, with no upper limit", () => {
  assert.deepEqual(noteCounter(words(NOTE_TARGET_WORDS)), { line: "30 words. Target reached.", reached: true })
  assert.deepEqual(noteCounter(words(61)), { line: "61 words. Target reached.", reached: true })
  assert.equal(noteCounter(words(200)).reached, true)
})

test("talk notes keep only the talks with something written", () => {
  assert.deepEqual(
    talkNotesOf([
      { staffName: "Jess", note: "  Wants more pastry shifts.  " },
      { staffName: "Sam", note: null },
      { staffName: "Ana", note: "   " },
    ]),
    [{ name: "Jess", note: "Wants more pastry shifts." }]
  )
})
