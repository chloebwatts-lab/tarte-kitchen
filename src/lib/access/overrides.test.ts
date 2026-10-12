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
