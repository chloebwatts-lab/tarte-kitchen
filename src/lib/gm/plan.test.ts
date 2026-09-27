import { test } from "node:test"
import assert from "node:assert/strict"
import {
  COGS_TARGET_PCT,
  DEFAULT_GM_DAYS,
  GM_ITEMS,
  GM_MONTHLY_MANUAL,
  GM_TASK_SEEDS,
  ONE_ON_ONE_TARGET,
  THEME_BLURB,
  THEME_LABEL,
  WASTAGE_WEEKLY_CAP,
  type GmAutoKey,
} from "./plan"
import { bucketTargets } from "@/lib/labour/buckets"
import { gmWeekPos } from "./week"

const AUTO_KEYS: GmAutoKey[] = [
  "roster-horizon",
  "open-shifts",
  "hours-vs-roster",
  "checklists",
  "wastage",
  "one-on-ones",
  "weekly-report",
]

test("item slugs are unique and URL-safe", () => {
  const slugs = GM_ITEMS.map((i) => i.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/, s)
})

test("every auto key is claimed by exactly one item, and every item's auto key is known", () => {
  const used = GM_ITEMS.filter((i) => i.auto).map((i) => i.auto as GmAutoKey)
  assert.equal(new Set(used).size, used.length, "no auto key shared by two items")
  assert.deepEqual([...used].sort(), [...AUTO_KEYS].sort())
})

test("every theme in use has a label, and every non-everyday theme has a blurb", () => {
  for (const i of GM_ITEMS) {
    assert.ok(THEME_LABEL[i.theme], i.slug)
    if (i.theme !== "everyday") assert.ok(THEME_BLURB[i.theme], i.slug)
  }
})

test("default GM days are Thu people, Fri kitchen, Mon rosters, and never Tue or Wed (days off)", () => {
  assert.deepEqual(DEFAULT_GM_DAYS, { "4": "people", "5": "kitchen", "1": "rosters" })
  assert.equal(DEFAULT_GM_DAYS["2"], undefined)
  assert.equal(DEFAULT_GM_DAYS["3"], undefined)
  // The report day (Mon) is the last GM day of the Wed-anchored week.
  const positions = Object.keys(DEFAULT_GM_DAYS).map((k) => gmWeekPos(Number(k)))
  assert.equal(Math.max(...positions), gmWeekPos(1))
})

test("the roster-in-band hint quotes the same Burleigh bands as bucketTargets", () => {
  const item = GM_ITEMS.find((i) => i.slug === "roster-in-band")
  assert.ok(item)
  for (const t of bucketTargets("BURLEIGH")) {
    assert.ok(item.hint.includes(`${t.label} ${t.min} to ${t.max}%`), `${t.label} band drifted from hint`)
  }
})

test("the wastage hint quotes the weekly cap", () => {
  const item = GM_ITEMS.find((i) => i.slug === "wastage")
  assert.ok(item)
  assert.ok(item.title.includes(`$${WASTAGE_WEEKLY_CAP}`))
  assert.equal(WASTAGE_WEEKLY_CAP, 400)
})

test("the one-on-one target matches its item title", () => {
  const item = GM_ITEMS.find((i) => i.slug === "one-on-ones")
  assert.ok(item)
  assert.equal(ONE_ON_ONE_TARGET, 4)
  assert.match(item.title, /^Four /)
})

test("COGS target is 26% and the four-clean-weeks task says so", () => {
  assert.equal(COGS_TARGET_PCT, 26)
  const task = GM_TASK_SEEDS.find((t) => t.slug === "four-clean-weeks")
  assert.ok(task)
  assert.ok(task.title.includes(`${COGS_TARGET_PCT}%`))
})

test("items with counters name both counters; noteOnDone items have a question", () => {
  for (const i of GM_ITEMS) {
    if (i.counts) {
      assert.ok(i.counts.num1 && i.counts.num2, i.slug)
    }
    if (i.noteOnDone) assert.ok(i.noteOnDone.endsWith("?"), i.slug)
  }
})

test("hrefs are in-app relative paths", () => {
  for (const i of GM_ITEMS) {
    if (i.href) assert.match(i.href, /^\/(kitchen|log)(\/|$)/, i.slug)
  }
})

test("task seeds: unique slugs, valid ISO due dates in 2026, ascending by sortOrder and dueOn", () => {
  const slugs = GM_TASK_SEEDS.map((t) => t.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  let prevOrder = 0
  let prevDue = ""
  for (const t of GM_TASK_SEEDS) {
    assert.match(t.dueOn, /^2026-\d{2}-\d{2}$/, t.slug)
    assert.ok(!Number.isNaN(new Date(t.dueOn).getTime()), t.slug)
    assert.ok(t.sortOrder > prevOrder, `${t.slug} sortOrder`)
    assert.ok(t.dueOn >= prevDue, `${t.slug} due before the task listed above it`)
    assert.ok(t.doneMeans.length > 20, t.slug)
    prevOrder = t.sortOrder
    prevDue = t.dueOn
  }
  assert.ok(GM_TASK_SEEDS.every((t) => t.dueOn <= "2026-12-31"), "all due by 31 Dec 2026")
})

test("monthly manual numbers have distinct slugs and a target", () => {
  const slugs = GM_MONTHLY_MANUAL.map((m) => m.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const m of GM_MONTHLY_MANUAL) assert.ok(m.target.length > 0, m.slug)
})

test("no em dashes in any copy Oliver or Chloe will read", () => {
  const texts = [
    ...GM_ITEMS.flatMap((i) => [i.title, i.hint, i.noteOnDone ?? ""]),
    ...GM_TASK_SEEDS.flatMap((t) => [t.title, t.doneMeans]),
    ...Object.values(THEME_LABEL),
    ...Object.values(THEME_BLURB),
  ]
  for (const t of texts) assert.ok(!t.includes("—"), t)
})
