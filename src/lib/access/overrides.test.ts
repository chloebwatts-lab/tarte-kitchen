import { test, describe } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { groupBySlug } from "../staff-tools"
import { COPY_QUIET_PREFIXES, copyVisibleTools, isCopyQuietHref, isQuietPerson, visibleTools } from "../manager-quiet"
import { parseTierOverrides, tierForHref, tierWithOverrides, toolsForTier } from "./tiers"

const seeded = fs.readFileSync(
  path.join(process.cwd(), "prisma", "migrations", "20261012050000_tier_overrides_and_copy_quiet", "migration.sql"),
  "utf8"
)
/** The quoted SQL value that follows `after` in the migration. */
const between = (after: string) => {
  const at = seeded.indexOf(after)
  assert.ok(at >= 0, after)
  const start = seeded.indexOf("'", at + after.length) + 1
  return seeded.slice(start, seeded.indexOf("'", start))
}
const overrides = parseTierOverrides(between("'tierOverrides',"))
const copyQuiet = between("'copyQuietStaff',")

describe("tier overrides (Chloe's 12 Oct list)", () => {
  test("the seeded JSON parses and only holds real tiers", () => {
    assert.ok(Object.keys(overrides).length >= 15)
    for (const t of Object.values(overrides)) assert.ok(t === "SENIOR" || t === "MANAGER", t)
  })

  test("named people are raised from Staff to Senior; Vini to Manager", () => {
    for (const name of ["Lacey Corby", "Ana Souza", "Carmen Lopez", "Lola Perez", "Michelle Malbog", "Julian Mauricio", "Debbie Embalsado", "Tais Mansur", "Gabriel Santos"]) {
      assert.equal(tierWithOverrides("STAFF", overrides, { id: "x", name }), "SENIOR", name)
    }
    assert.equal(tierWithOverrides("STAFF", overrides, { id: "x", name: "Vinicius Almeida" }), "MANAGER")
    assert.equal(tierWithOverrides("SENIOR", overrides, { id: "x", name: "Vinicius Almeida" }), "MANAGER")
  })

  test("an override never lowers anyone, and leaves everyone else alone", () => {
    assert.equal(tierWithOverrides("MANAGER", overrides, { id: "x", name: "Tais Mansur" }), "MANAGER")
    assert.equal(tierWithOverrides("STAFF", overrides, { id: "x", name: "Jazzmine Lee" }), "STAFF")
    assert.equal(tierWithOverrides("STAFF", overrides, { id: "x", name: "Analise Ward" }), "STAFF", "Ana is not a prefix")
  })

  test("a broken or missing override row changes nothing", () => {
    assert.deepEqual(parseTierOverrides(null), {})
    assert.deepEqual(parseTierOverrides("not json"), {})
    assert.deepEqual(parseTierOverrides('["SENIOR"]'), {})
    assert.deepEqual(parseTierOverrides('{"Lola": "BOSS", "Ana": "SENIOR"}'), { Ana: "SENIOR" })
    assert.deepEqual(parseTierOverrides('{"Lola": "OWNER", "Vini": "MANAGER"}'), { Vini: "MANAGER" }, "an override never grants Owner")
  })
})

describe("copy-quiet list (Cande)", () => {
  const cande = { id: "shifts-77", name: "Candela Rossi" }
  const lola = { id: "shifts-78", name: "Lola Perez" }

  test("Cande is on it, Lola is not, and Cande is still Senior", () => {
    assert.equal(isQuietPerson(copyQuiet, cande), true)
    assert.equal(isQuietPerson(copyQuiet, lola), false)
    assert.equal(tierWithOverrides("STAFF", overrides, cande), "SENIOR")
  })

  test("withheld: the supplier map and prices; kept (Chloe, 12 Oct): order sheet, portions, high tea, functions", () => {
    for (const h of ["/kitchen/ordering", "/kitchen/serves", "/kitchen/prices", "/kitchen/managers/preferred"]) {
      assert.equal(isCopyQuietHref(h), true, h)
    }
    for (const h of ["/kitchen/order/sheet", "/kitchen/portions", "/kitchen/high-tea", "/kitchen/functions", "/kitchen/order", "/kitchen/order/kitchen", "/kitchen/lineup", "/kitchen/managers/board", "/kitchen/jobs", "/kitchen/managers", "/kitchen/prep", "/kitchen/stock"]) {
      assert.equal(isCopyQuietHref(h), false, h)
    }
    // Nothing on the copy-quiet list is open to plain Staff anyway.
    for (const p of COPY_QUIET_PREFIXES) assert.notEqual(tierForHref(p), "STAFF", p)
  })

  test("a copy-quiet Senior's grids keep the shift tools and lose the copyable ones", () => {
    const stock = groupBySlug("stock")!
    const grid = copyVisibleTools(toolsForTier(stock.tools, "SENIOR"), true).map((t) => t.href)
    for (const keep of ["/kitchen/stock", "/kitchen/restock", "/kitchen/prep", "/kitchen/order", "/kitchen/high-tea"]) assert.ok(grid.includes(keep), keep)
    for (const gone of ["/kitchen/ordering", "/kitchen/serves", "/kitchen/prices"]) assert.equal(grid.includes(gone), false, gone)

    const managers = groupBySlug("managers")!
    const mgrid = copyVisibleTools(visibleTools(toolsForTier(managers.tools, "SENIOR"), false), true).map((t) => t.href)
    assert.ok(mgrid.includes("/kitchen/lineup") && mgrid.includes("/kitchen/managers/board") && mgrid.includes("/kitchen/jobs"))
    assert.equal(mgrid.includes("/kitchen/managers/preferred"), false)

    // Not on the list: nothing changes.
    assert.deepEqual(copyVisibleTools(stock.tools, false), stock.tools)
  })
})

describe("copy-quiet routes agree with the prefix list", () => {
  test("every copy-quiet route folder gates on its own href", () => {
    const appDir = path.join(process.cwd(), "src", "app")
    for (const prefix of COPY_QUIET_PREFIXES) {
      const dir = path.join(appDir, ...prefix.split("/").filter(Boolean))
      assert.ok(fs.existsSync(dir), `${prefix} has no route directory`)
      const src = ["layout.tsx", "page.tsx"]
        .map((f) => path.join(dir, f))
        .filter((f) => fs.existsSync(f))
        .map((f) => fs.readFileSync(f, "utf8"))
        .join("\n")
      assert.ok(
        src.includes(`requirePage("${prefix}"`) || src.includes(`requireFullManager("${prefix}"`),
        `${prefix}: needs requirePage or requireFullManager with its own href`
      )
    }
  })
})

describe("tier overrides: nasty entries", () => {
  const lacey = { id: "shifts-207", name: "Lacey Corby" }
  const kitchenHand = { id: "shifts-900", name: "Sam Nguyen" }

  test("a blank or whitespace key raises nobody", () => {
    const o = parseTierOverrides('{"": "SENIOR", "   ": "MANAGER"}')
    assert.equal(tierWithOverrides("STAFF", o, lacey), "STAFF")
    assert.equal(tierWithOverrides("STAFF", o, kitchenHand), "STAFF")
  })

  test("a staff id raises exactly that person; a surname alone raises nobody", () => {
    const o = parseTierOverrides('{"shifts-207": "SENIOR", "Corby": "MANAGER"}')
    assert.equal(tierWithOverrides("STAFF", o, lacey), "SENIOR")
    assert.equal(tierWithOverrides("STAFF", o, kitchenHand), "STAFF")
  })

  test("the highest matching entry wins whatever the order", () => {
    const o = parseTierOverrides('{"Lacey Corby": "MANAGER", "Lacey": "SENIOR"}')
    assert.equal(tierWithOverrides("STAFF", o, lacey), "MANAGER")
    assert.equal(tierWithOverrides("STAFF", parseTierOverrides('{"Lacey": "SENIOR", "Lacey Corby": "MANAGER"}'), lacey), "MANAGER")
  })
})

describe("Jess to Manager (12 Oct evening migration)", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "prisma", "migrations", "20261012060000_tier_overrides_jess", "migration.sql"), "utf8")
  /** Every quoted JSON object in the file: the merge literal and the fallback insert. */
  const literals = [...sql.matchAll(/'(\{[^']*\})'/g)].map((m) => m[1])

  test("both JSON literals parse and grant exactly Manager to the two spellings", () => {
    assert.equal(literals.length, 2)
    for (const lit of literals) {
      assert.deepEqual(parseTierOverrides(lit), { "Jess Passos": "MANAGER", "Jessica Passos": "MANAGER" })
    }
  })

  test("Jess reaches Manager from Staff or Senior under either spelling; another Jess does not", () => {
    const jess = parseTierOverrides(literals[0])
    assert.equal(tierWithOverrides("STAFF", jess, { id: "x", name: "Jess Passos" }), "MANAGER")
    assert.equal(tierWithOverrides("SENIOR", jess, { id: "x", name: "jessica  passos" }), "MANAGER")
    assert.equal(tierWithOverrides("STAFF", jess, { id: "x", name: "Jess Taylor" }), "STAFF")
    assert.equal(tierWithOverrides("STAFF", jess, { id: "x", name: "Jess" }), "STAFF", "a bare first name in the log is not the full name")
  })
})

describe("Burleigh managers to Manager (13 Oct migration)", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "prisma", "migrations", "20261013040000_tier_overrides_burleigh_managers", "migration.sql"),
    "utf8"
  )
  const literals = [...sql.matchAll(/'(\{[^']*\})'/g)].map((m) => m[1])
  const expected = {
    "Georgia Farquhar": "MANAGER",
    Georgia: "MANAGER",
    "Savannah Hjorth": "MANAGER",
    Savannah: "MANAGER",
    Sav: "MANAGER",
    "Chloe Johns": "MANAGER",
    Chloe: "MANAGER",
  }

  test("both JSON literals parse, grant exactly Manager, and nothing above it", () => {
    assert.equal(literals.length, 2)
    for (const lit of literals) assert.deepEqual(parseTierOverrides(lit), expected)
  })

  test("the SQL keeps the merge shape: existing row wins on conflict, insert only when missing", () => {
    assert.match(sql, /'\{[^']*\}'::jsonb \|\| "value"::jsonb/, "new literal on the left so a later app edit wins")
    assert.match(sql, /WHERE "key" = 'tierOverrides'/)
    assert.match(sql, /ON CONFLICT \("key"\) DO NOTHING/)
  })

  test("Georgia, Savannah and Chloe Johns reach Manager from Staff or Senior; others untouched", () => {
    const o = parseTierOverrides(literals[0])
    assert.equal(tierWithOverrides("STAFF", o, { id: "x", name: "Georgia Farquhar" }), "MANAGER")
    assert.equal(tierWithOverrides("SENIOR", o, { id: "x", name: "savannah  hjorth" }), "MANAGER")
    assert.equal(tierWithOverrides("STAFF", o, { id: "x", name: "Chloe Johns" }), "MANAGER")
    assert.equal(tierWithOverrides("STAFF", o, { id: "x", name: "Sav Hjorth" }), "MANAGER", "Sav first-name key")
    assert.equal(tierWithOverrides("OWNER", o, { id: "x", name: "Chloe Johns" }), "OWNER", "never lowered")
    assert.equal(tierWithOverrides("STAFF", o, { id: "x", name: "Lacey Corby" }), "STAFF")
    assert.equal(tierWithOverrides("STAFF", o, { id: "x", name: "Savanna Reid" }), "STAFF", "Savanna is not Savannah")
  })

  test("merged with the 12 Oct list, nobody already listed is lowered", () => {
    const merged = { ...parseTierOverrides(literals[0]), ...overrides }
    assert.equal(tierWithOverrides("STAFF", merged, { id: "x", name: "Vinicius Almeida" }), "MANAGER")
    assert.equal(tierWithOverrides("STAFF", merged, { id: "x", name: "Lacey Corby" }), "SENIOR")
    assert.equal(tierWithOverrides("STAFF", merged, { id: "x", name: "Georgia Farquhar" }), "MANAGER")
  })
})

describe("the full list (13 Oct afternoon migration, replaces the row)", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "prisma", "migrations", "20261013050000_tier_overrides_full_list", "migration.sql"),
    "utf8"
  )
  const literals = [...sql.matchAll(/'(\{[^']*\})'/g)].map((m) => m[1])
  const full = parseTierOverrides(literals[0])

  test("one JSON literal, parses as-is, every key Manager or Senior, nothing dropped by the parser", () => {
    assert.equal(literals.length, 1)
    const raw = JSON.parse(literals[0]) as Record<string, string>
    assert.deepEqual(full, raw, "every entry survives parseTierOverrides")
    for (const [k, t] of Object.entries(full)) {
      assert.ok(t === "MANAGER" || t === "SENIOR", `${k}: ${t}`)
      assert.ok(k.trim().length > 0 && !k.includes("'"), k)
    }
    assert.ok(Object.keys(full).length >= 30)
  })

  test("the SQL replaces the row: upsert on key with the new value winning", () => {
    assert.match(sql, /INSERT INTO "AppSetting" \("key", "value", "updatedAt"\)/)
    assert.match(sql, /VALUES \('tierOverrides',/)
    assert.match(sql, /ON CONFLICT \("key"\) DO UPDATE SET "value" = EXCLUDED\."value", "updatedAt" = NOW\(\)/)
    assert.doesNotMatch(sql, /::jsonb \|\|/, "no merge: Chloe's list is the whole row")
    assert.equal((sql.match(/;/g) ?? []).length, 1, "a single statement")
  })

  test("managers reach Manager from Staff or Senior", () => {
    for (const name of [
      "Chloe Johns", "Georgia Rodney", "Georgia Farquhar", "Jose Garcia", "Shawna Brown", "Jess Le Rose",
      "Jessica Le Rose", "Jess Passos", "Savannah Hjorth", "Sav Hjorth", "Oliver Warren", "Vinicius Almeida",
    ]) {
      assert.equal(tierWithOverrides("STAFF", full, { id: "x", name }), "MANAGER", name)
      assert.equal(tierWithOverrides("SENIOR", full, { id: "x", name: name.toUpperCase() }), "MANAGER", name)
    }
  })

  test("seniors reach Senior and no higher", () => {
    for (const name of [
      "Carmen Taylor", "Anastasia Petrova", "Anastasija Petrova", "Ana Souza", "Ava Smith", "Debbie Embalsado",
      "Lacey Corby", "Tais Mansur", "Gabrielle Dupont", "Gabriela Silva", "Gab Jones",
    ]) {
      assert.equal(tierWithOverrides("STAFF", full, { id: "x", name }), "SENIOR", name)
    }
  })

  test("nobody is lowered; names not on the list stay where Shifts puts them", () => {
    assert.equal(tierWithOverrides("MANAGER", full, { id: "x", name: "Lacey Corby" }), "MANAGER")
    assert.equal(tierWithOverrides("OWNER", full, { id: "x", name: "Chloe Johns" }), "OWNER")
    for (const name of ["Sam Nguyen", "Analise Ward", "Savanna Reid", "Lola Perez", "Candela Rossi", "Michelle Malbog", "Gabriel Santos"]) {
      assert.equal(tierWithOverrides("STAFF", full, { id: "x", name }), "STAFF", name)
    }
    assert.equal(tierWithOverrides("STAFF", full, { id: "x", name: "Corby" }), "STAFF", "surname alone is not a first name")
  })
})
