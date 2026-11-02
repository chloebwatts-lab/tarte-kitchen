import { test } from "node:test"
import assert from "node:assert/strict"
import { NOTE_MAX_WORDS, NOTE_MIN_WORDS, noteProblem, talkNotesOf, wordCount } from "./one-on-one"

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ")

test("word count ignores extra spaces, tabs and new lines", () => {
  assert.equal(wordCount(""), 0)
  assert.equal(wordCount("   "), 0)
  assert.equal(wordCount("Jess  is\tgoing well.\n\nWants more  pastry shifts."), 8)
})

test("a note between 30 and 60 words passes, both ends included", () => {
  assert.equal(noteProblem(words(NOTE_MIN_WORDS)), null)
  assert.equal(noteProblem(words(45)), null)
  assert.equal(noteProblem(words(NOTE_MAX_WORDS)), null)
})

test("too short or too long says how many words to add or take out", () => {
  assert.equal(noteProblem(""), "Write 30 more words (30 to 60).")
  assert.equal(noteProblem(words(29)), "Write 1 more word (30 to 60).")
  assert.equal(noteProblem(words(61)), "Take out 1 word (30 to 60).")
  assert.equal(noteProblem(words(70)), "Take out 10 words (30 to 60).")
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
