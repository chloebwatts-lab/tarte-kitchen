import { test } from "node:test"
import assert from "node:assert/strict"
import { auditGmWeek, auditSummary, BLAMES_ROSTER, missStreakFromHistory } from "./audit"
import type { BoardItem } from "./board"

const item = (slug: string, state: BoardItem["state"], extra: Partial<BoardItem> = {}): BoardItem =>
  ({ slug, title: slug, theme: "everyday", pillar: "efficient", hint: "", state, note: null, num1: null, num2: null, auto_: null, manual: false, ...extra }) as BoardItem

const rosterDraft = { met: false, detail: "Wed 14 Oct: live. Wed 21 Oct: draft, not published." }

test("a tick the app's reading contradicts is disputed, not confirmed", () => {
  const a = auditGmWeek([
    item("checklists", "done", { manual: true, auto_: { met: false, detail: "19 of 24 done so far (79%). Gaps on Thu 8 Oct." } }),
    item("wastage", "done", { manual: true, auto_: { met: true, detail: "$210 so far against $400." } }),
    item("open-shifts", "auto-ok", { auto_: { met: true, detail: "None in the next 7 days." } }),
  ])
  assert.deepEqual(a.disputed.map((l) => l.slug), ["checklists"])
  assert.match(a.disputed[0].detail, /^Ticked done\. The app sees: 19 of 24/)
  assert.deepEqual(a.confirmed.map((l) => l.slug), ["wastage", "open-shifts"])
  assert.equal(a.onHisWord.length, 0)
})

test("ticks the app cannot check rest on his word", () => {
  const a = auditGmWeek([
    item("floor-walks", "done", { manual: true }),
    item("hours-vs-roster", "done", { manual: true, auto_: { met: null, detail: "Not enough data for last week." } }),
  ])
  assert.deepEqual(a.onHisWord.map((l) => l.slug), ["floor-walks", "hours-vs-roster"])
  assert.equal(a.disputed.length, 0)
  assert.equal(a.confirmed.length, 0)
})

test("blaming the roster does not hold up when the roster itself never went live", () => {
  const a = auditGmWeek([
    item("roster-2wk", "couldnt", { manual: true, note: "Three trials ate Monday.", auto_: rosterDraft }),
    item("portion-checks", "couldnt", { manual: true, note: "Rosters took the whole day." }),
    item("label-walk", "couldnt", { manual: true, note: "Coolroom was being serviced." }),
  ])
  const by = Object.fromEntries(a.reasons.map((r) => [r.slug, r]))
  assert.equal(by["portion-checks"].holdsUp, false)
  assert.match(by["portion-checks"].why!, /Blames the roster, but the roster did not get done either: Wed 14 Oct/)
  // The roster item blaming something else is judged on its own note, not on itself.
  assert.equal(by["roster-2wk"].holdsUp, true)
  assert.equal(by["label-walk"].holdsUp, true)
})

test("blaming the roster holds up when the roster is actually live", () => {
  const a = auditGmWeek([
    item("roster-2wk", "auto-ok", { auto_: { met: true, detail: "Both weeks live." } }),
    item("portion-checks", "couldnt", { manual: true, note: "Rostering ran long." }),
  ])
  assert.equal(a.reasons[0].holdsUp, true)
  assert.equal(a.reasons[0].why, undefined)
})

test("roster blamed and roster ticked done by hand over a draft: the tick is disputed and the excuse fails", () => {
  const a = auditGmWeek([
    item("roster-2wk", "done", { manual: true, auto_: rosterDraft }),
    item("kitchen-rosters", "couldnt", { manual: true, note: "No time after the roster." }),
  ])
  assert.deepEqual(a.disputed.map((l) => l.slug), ["roster-2wk"])
  // Ticked done counts as done for the cross-check: the dispute is already called out on its own line.
  assert.equal(a.reasons[0].holdsUp, true)
})

test("a Couldn't with nothing written is a reason that does not hold up", () => {
  const a = auditGmWeek([item("quality-fix", "couldnt", { manual: true, note: "   " })])
  assert.equal(a.reasons[0].holdsUp, false)
  assert.equal(a.reasons[0].why, "No reason written.")
  assert.equal(a.reasons[0].detail, "No reason written.")
})

test("open and auto-bad items with no mark are listed as no reason given", () => {
  const a = auditGmWeek([
    item("quality-fix", "open"),
    item("wastage", "auto-bad", { auto_: { met: false, detail: "$460 so far against $400." } }),
  ])
  assert.deepEqual(a.noReason.map((l) => [l.slug, l.detail]), [
    ["quality-fix", "Never ticked, nothing written."],
    ["wastage", "The app sees: $460 so far against $400."],
  ])
})

test("the Monday report item is left out of the audit entirely", () => {
  const a = auditGmWeek([item("weekly-report", "open", { auto_: { met: false, detail: "Not sent yet." } })])
  assert.equal(a.noReason.length, 0)
  assert.equal(a.repeats.length, 0)
})

test("repeats count this week plus prior misses, only for items not done now", () => {
  const a = auditGmWeek(
    [
      item("roster-2wk", "couldnt", { manual: true, note: "Trials.", auto_: rosterDraft }),
      item("quality-fix", "open"),
      item("label-walk", "done", { manual: true }),
      item("portion-checks", "couldnt", { manual: true, note: "Sick." }),
    ],
    { "roster-2wk": 2, "label-walk": 5, "portion-checks": 0 }
  )
  assert.deepEqual(a.repeats.map((r) => [r.slug, r.weeks]), [["roster-2wk", 3]])
  assert.equal(auditSummary(a), "1 with no reason, 1 not done 2+ weeks running")
})

test("summary names disputes, shaky reasons, silence and repeats", () => {
  const a = auditGmWeek(
    [
      item("roster-2wk", "done", { manual: true, auto_: rosterDraft }),
      item("portion-checks", "couldnt", { manual: true, note: "Rosters." }),
      item("quality-fix", "open"),
    ],
    { "quality-fix": 1 }
  )
  // Roster ticked done counts as done, so the roster excuse holds; quality-fix is silent and repeated.
  assert.equal(auditSummary(a), "1 tick disputed, 1 with no reason, 1 not done 2+ weeks running")
  const b = auditGmWeek([item("portion-checks", "couldnt", { manual: true, note: "" }), item("label-walk", "couldnt", { manual: true, note: "" })])
  assert.equal(auditSummary(b), "2 reasons do not hold up")
  assert.equal(auditSummary(auditGmWeek([item("floor-walks", "done", { manual: true })])), "")
})

test("the roster pattern catches roster, rosters and rostering, not unrelated words", () => {
  for (const s of ["Rosters took Monday", "the roster", "rostering ran long", "Roster!"]) assert.ok(BLAMES_ROSTER.test(s), s)
  for (const s of ["trials", "coolroom service", "foster"]) assert.equal(BLAMES_ROSTER.test(s), false, s)
})

test("miss streaks walk back week by week and stop at the first met mark", () => {
  const slugs = ["a", "b", "c"]
  const history = [
    { marks: [{ itemSlug: "a", met: false }, { itemSlug: "b", met: true }] }, // last week: a missed, b done, c unmarked (missed)
    { marks: [{ itemSlug: "a", met: false }, { itemSlug: "c", met: true }] }, // two weeks ago: a missed, c done
    { marks: [{ itemSlug: "a", met: true }] }, // three weeks ago: a done
    { marks: [{ itemSlug: "a", met: false }] }, // older miss must not count past a done week
  ]
  assert.deepEqual(missStreakFromHistory(slugs, history), { a: 2, c: 1 })
})

test("a week with no marks at all ends every streak, so the count never predates the desk", () => {
  const history = [
    { marks: [{ itemSlug: "a", met: false }] },
    { marks: [] },
    { marks: [{ itemSlug: "a", met: false }, { itemSlug: "b", met: false }] },
  ]
  // b was not marked last week, in a week that had marks: that is a miss.
  assert.deepEqual(missStreakFromHistory(["a", "b"], history), { a: 1, b: 1 })
  assert.deepEqual(missStreakFromHistory(["a"], []), {})
})

// ─── Gap tests added by the pre-push guard ───────────────────────────

import { GM_ITEMS } from "./plan"

test("the slugs audit.ts hard-codes still exist in the plan, and the roster one carries a reading", () => {
  const bySlug = new Map(GM_ITEMS.map((i) => [i.slug, i]))
  assert.ok(bySlug.has("roster-2wk"), "roster-2wk is the anchor for the roster excuse cross-check")
  assert.ok(bySlug.has("weekly-report"), "weekly-report is the item the audit leaves out")
  assert.equal(bySlug.get("roster-2wk")!.auto, "roster-horizon")
})

test("an empty week audits to nothing and an empty summary", () => {
  const a = auditGmWeek([])
  assert.deepEqual(a, { confirmed: [], disputed: [], onHisWord: [], reasons: [], noReason: [], repeats: [] })
  assert.equal(auditSummary(a), "")
})

test("a Couldn't saved with a null note is a reason that does not hold up, and the summary says so in the singular", () => {
  const a = auditGmWeek([item("kitchen-rosters", "couldnt", { manual: true, note: null })])
  assert.equal(a.reasons[0].reason, "")
  assert.equal(a.reasons[0].holdsUp, false)
  assert.equal(a.reasons[0].why, "No reason written.")
  assert.equal(auditSummary(a), "1 reason does not hold up")
})

test("a tick over a frozen app reading that agrees is confirmed, even with a note", () => {
  const a = auditGmWeek([item("wastage", "done", { manual: true, note: "App reading: $190 so far against $400.", auto_: { met: true, detail: "$190 so far against $400." } })])
  assert.deepEqual(a.confirmed.map((l) => [l.slug, l.detail]), [["wastage", "$190 so far against $400."]])
  assert.equal(a.onHisWord.length, 0)
})

test("the whole plan left untouched is all no-reason, and one prior miss each makes every one a repeat", () => {
  const items = GM_ITEMS.map((i) => item(i.slug, "open", { title: i.title }))
  const fresh = auditGmWeek(items)
  assert.equal(fresh.noReason.length, GM_ITEMS.length - 1)
  assert.equal(fresh.repeats.length, 0)
  assert.equal(fresh.confirmed.length + fresh.disputed.length + fresh.onHisWord.length + fresh.reasons.length, 0)

  const prior = Object.fromEntries(GM_ITEMS.map((i) => [i.slug, 1]))
  const again = auditGmWeek(items, prior)
  assert.equal(again.repeats.length, GM_ITEMS.length - 1)
  assert.ok(again.repeats.every((r) => r.weeks === 2))
  assert.ok(!again.repeats.some((r) => r.slug === "weekly-report"))
  assert.equal(auditSummary(again), `${GM_ITEMS.length - 1} with no reason, ${GM_ITEMS.length - 1} not done 2+ weeks running`)
})

test("miss streaks: frozen app readings end a streak, unknown slugs are ignored, and the count caps at the history given", () => {
  // The close cron freezes auto readings as marks, so an auto item that was fine last week ends its streak there.
  const history = [
    { marks: [{ itemSlug: "open-shifts", met: true }, { itemSlug: "label-walk", met: false }, { itemSlug: "retired-item", met: false }] },
    { marks: [{ itemSlug: "open-shifts", met: false }, { itemSlug: "label-walk", met: false }] },
  ]
  const out = missStreakFromHistory(["open-shifts", "label-walk"], history)
  assert.deepEqual(out, { "label-walk": 2 })
  assert.equal("retired-item" in out, false)

  // Eight weeks of misses with no done week in sight: the streak is 8, not more.
  const eight = Array.from({ length: 8 }, () => ({ marks: [{ itemSlug: "label-walk", met: false }] }))
  assert.deepEqual(missStreakFromHistory(["label-walk"], eight), { "label-walk": 8 })
})
