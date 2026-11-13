import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { CAMPAIGN, DUE_ON, FIELD_NAMES, sortKey } from "./sign-on"
import { GM_TASK_SEEDS } from "@/lib/gm/plan"

// Drift guards for the Council sign-ons: the migration, the Prisma schema and
// the server actions have to keep agreeing with the pure rules in sign-on.ts.
// Prisma accepts `data: Record<string, unknown>` in saveSignOn, so a field
// name typo would only blow up on Oliver's iPad, not in the typecheck.

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8")
const MIGRATION = read("prisma", "migrations", "20261113160000_council_sign_on", "migration.sql")
const SCHEMA = read("prisma", "schema.prisma")
const ACTIONS = read("src", "lib", "actions", "council.ts")

function modelBlock(name: string): string {
  const m = SCHEMA.match(new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(m, `model ${name} in schema.prisma`)
  return m[1]
}

// ('seed-x', 'Name', 'sort name', 'Street', true|false, CURRENT_TIMESTAMP)
const STR = "'((?:[^']|'')*)'"
const SEED_RE = new RegExp(`^\\s*\\(${STR}, ${STR}, ${STR}, ${STR}, (true|false), CURRENT_TIMESTAMP\\),?$`, "gm")
const unq = (s: string) => s.replace(/''/g, "'")
const seeds = [...MIGRATION.matchAll(SEED_RE)].map((m) => ({
  id: unq(m[1]),
  name: unq(m[2]),
  sortName: unq(m[3]),
  street: unq(m[4]),
}))

test("council seed: 45 Burleigh venues, each filed under sortKey(name), no duplicates", () => {
  const valueLines = MIGRATION.split("\n").filter((l) => /^\s*\('seed-/.test(l))
  assert.equal(valueLines.length, 45, "seed lines in the migration")
  assert.equal(seeds.length, valueLines.length, "every seed line parsed (same column order)")
  assert.equal(new Set(seeds.map((s) => s.id)).size, seeds.length, "unique ids")
  assert.equal(new Set(seeds.map((s) => s.sortName)).size, seeds.length, "unique sortName (the @@unique key)")
  for (const s of seeds) {
    assert.equal(s.sortName, sortKey(s.name), `${s.name}: sortName must equal sortKey(name) or Add a business makes a duplicate`)
    assert.match(s.id, /^seed-[a-z0-9-]+$/, s.id)
    assert.ok(s.street.length > 0, `${s.name}: street`)
  }
  assert.ok(seeds.some((s) => s.name === "The Pantry" && s.sortName === "pantry"))
})

test("council seed: iPad smart punctuation, case and a leading The still find the seeded business", () => {
  const keys = new Set(seeds.map((s) => s.sortName))
  // iPad Smart Punctuation types a curly apostrophe.
  assert.ok(keys.has(sortKey("Betty’s Burgers")))
  assert.ok(keys.has(sortKey("T’ang Court")))
  assert.ok(keys.has(sortKey("THE PANTRY")))
  assert.ok(keys.has(sortKey("  rick   shores ")))
  assert.ok(keys.has(sortKey("Maman Bar + Kitchen")))
  // A business literally called "The" keeps its name; nothing becomes an empty key.
  assert.equal(sortKey("The"), "the")
  assert.equal(sortKey(" & "), "")
})

test("council migration is additive only: re-runnable seed, restrict on delete, nothing dropped", () => {
  assert.match(MIGRATION, /\nON CONFLICT DO NOTHING;\s*$/)
  assert.match(MIGRATION, /FOREIGN KEY \("signOnId"\) REFERENCES "CouncilSignOn"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE;/)
  const sql = MIGRATION.replace(/--.*$/gm, "").replace(/ON DELETE RESTRICT ON UPDATE CASCADE/g, "")
  assert.doesNotMatch(sql, /\b(DELETE|DROP|TRUNCATE|UPDATE)\b/i)
  const altered = [...sql.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(altered, ["CouncilSignOnEvent"], "only the new event table is altered (its FK)")
  const created = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(created, ["CouncilSignOn", "CouncilSignOnEvent"])
})

test("schema, migration and code agree on the campaign, the unique key and every field column", () => {
  const model = modelBlock("CouncilSignOn")
  assert.match(model, new RegExp(`\\n\\s+campaign\\s+String\\s+@default\\("${CAMPAIGN}"\\)`))
  assert.ok(MIGRATION.includes(`"campaign" TEXT NOT NULL DEFAULT '${CAMPAIGN}'`))
  assert.match(model, /@@unique\(\[campaign, sortName\]\)/)
  assert.ok(MIGRATION.includes(`CREATE UNIQUE INDEX "CouncilSignOn_campaign_sortName_key" ON "CouncilSignOn"("campaign", "sortName");`))
  for (const f of FIELD_NAMES) {
    assert.match(model, new RegExp(`\\n\\s+${f}\\s+String\\s+@default\\(""\\)`), `schema column ${f}`)
    assert.ok(MIGRATION.includes(`"${f}" TEXT NOT NULL DEFAULT ''`), `migration column ${f}`)
  }
  // The signature is optional on the row: a status change must never need one.
  assert.match(model, /\n\s+signature\s+String\?\n/)
  assert.ok(MIGRATION.includes(`"signature" TEXT,`))
  assert.match(modelBlock("CouncilSignOnEvent"), /onDelete: Restrict/)
})

test("council task on Oliver's plan is due the day the sheets go back to Chloe, a Friday", () => {
  const task = GM_TASK_SEEDS.find((t) => t.slug === "council-signons")
  assert.ok(task)
  assert.equal(task.dueOn, DUE_ON)
  assert.equal(new Date(`${DUE_ON}T00:00:00Z`).getUTCDay(), 5, "27 Nov 2026 is a Friday (page copy says Fri 27 Nov)")
})

test("every council server action unlocks the GM gate first, every write logs an event in the same transaction, nothing deletes", () => {
  assert.match(ACTIONS, /^"use server"\n/)
  const lines = ACTIONS.split("\n")
  const exported = lines.map((l, i) => ({ l, i })).filter(({ l }) => /^export (async )?function /.test(l))
  assert.ok(exported.length >= 5, "found the exported actions")
  for (const { l, i } of exported) {
    assert.match(l, /^export async function \w+\(.*\{$/, `${l}: actions are single-line async signatures`)
    const first = lines[i + 1].trim()
    assert.ok(
      first === "await guard()" || first === "if (!(await isGmAuthed())) return LOCKED",
      `${l}: first line must be await guard() or the LOCKED early return`,
    )
  }
  assert.doesNotMatch(ACTIONS, /\.(delete|deleteMany)\(/, "council actions never delete")
  assert.doesNotMatch(ACTIONS, /\bdb\.councilSignOn\.(create|createMany|update|updateMany|upsert)\(/, "writes only inside $transaction")
  const rowWrites = ACTIONS.match(/\btx\.councilSignOn\.(create|update)\(/g) ?? []
  const eventWrites = ACTIONS.match(/\btx\.councilSignOnEvent\.create\(/g) ?? []
  assert.ok(rowWrites.length > 0)
  assert.equal(eventWrites.length, rowWrites.length, "one snapshot event per row write")
  for (const p of ["page.tsx", path.join("sheet", "page.tsx")]) {
    assert.ok(read("src", "app", "kitchen", "gm", "council", p).includes("await requireGm("), `${p} gated by requireGm`)
  }
})
