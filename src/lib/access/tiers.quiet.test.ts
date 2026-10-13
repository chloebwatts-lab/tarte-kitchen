import { test, describe } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { TOOL_GROUPS, groupBySlug } from "../staff-tools"
import { QUIET_HIDDEN_PREFIXES, copyVisibleTools, isQuietHiddenHref, visibleTools } from "../manager-quiet"
import { MANAGER_PREFIXES, MANAGERS_AREA_PREFIXES, meetsTier, tierForHref, toolsForTier, type Tier } from "./tiers"

/**
 * The staff grids now run two filters in a row (src/app/staffaccess):
 * tier first, then the quiet list. These cases pin the two rules down
 * together so a change to either cannot quietly reopen a page or take an
 * open tile off a kitchen hand's grid.
 */

const stock = groupBySlug("stock")!
const managers = groupBySlug("managers")!
const hrefs = (tools: { href: string }[]) => tools.map((t) => t.href)

describe("tiers and the quiet list together", () => {
  test("every quiet-hidden page sits behind the managers password: quiet is a rule inside that area, never a hole for staff", () => {
    const gated = [...MANAGER_PREFIXES, ...MANAGERS_AREA_PREFIXES]
    for (const p of QUIET_HIDDEN_PREFIXES) {
      assert.ok(gated.some((g) => p === g || p.startsWith(`${g}/`)), p)
    }
    // The meeting deck is now on both lists.
    assert.equal(isQuietHiddenHref("/kitchen/meeting"), true)
    assert.equal(tierForHref("/kitchen/meeting"), "MANAGER")
    assert.equal(isQuietHiddenHref("/kitchen/meetings"), false)
    assert.equal(tierForHref("/kitchen/meetings"), "STAFF")
  })

  test("a quiet Manager's stock grid keeps ordering, serves and the prep list but loses Price check", () => {
    const grid = hrefs(visibleTools(toolsForTier(stock.tools, "MANAGER"), true))
    for (const keep of ["/kitchen/stock", "/kitchen/restock", "/kitchen/prep", "/kitchen/order", "/kitchen/ordering", "/kitchen/serves", "/kitchen/high-tea"]) {
      assert.ok(grid.includes(keep), keep)
    }
    assert.equal(grid.includes("/kitchen/prices"), false)
    // The same Manager, not quiet, gets Price check back.
    assert.ok(hrefs(visibleTools(toolsForTier(stock.tools, "MANAGER"), false)).includes("/kitchen/prices"))
  })

  test("the quiet flag changes nothing for Staff: their grid has no manager tile to take away", () => {
    const open = toolsForTier(stock.tools, "STAFF")
    assert.deepEqual(visibleTools(open, true), open)
    assert.equal(open.some((t) => t.href === "/kitchen/prices"), false)
  })

  test("a quiet Senior (a supervisor on the list) loses the same tiles as a quiet Manager", () => {
    const seniorGrid = hrefs(visibleTools(toolsForTier(managers.tools, "SENIOR"), true))
    const managerGrid = hrefs(visibleTools(toolsForTier(managers.tools, "MANAGER"), true))
    assert.deepEqual(seniorGrid, managerGrid)
    assert.ok(seniorGrid.includes("/kitchen/lineup"))
    assert.equal(seniorGrid.some((h) => h.startsWith("/kitchen/managers/sales")), false)
    const seniorStock = hrefs(visibleTools(toolsForTier(stock.tools, "SENIOR"), true))
    assert.equal(seniorStock.includes("/kitchen/prices"), false)
    assert.ok(hrefs(visibleTools(toolsForTier(stock.tools, "SENIOR"), false)).includes("/kitchen/prices"))
  })

  test("a quiet Manager inside the Managers group loses exactly the withheld tiles and nothing operational", () => {
    const grid = hrefs(visibleTools(toolsForTier(managers.tools, "MANAGER"), true))
    assert.ok(grid.includes("/kitchen/lineup"))
    assert.ok(grid.includes("/kitchen/managers/board"))
    assert.ok(grid.includes("/kitchen/jobs"))
    assert.equal(grid.some((h) => h.startsWith("/kitchen/managers/sales")), false)
    assert.equal(grid.includes("/kitchen/managers/agenda"), false)
    assert.equal(grid.includes("/kitchen/training"), false)
    // Tier alone never hides a manager tile from a Manager.
    assert.deepEqual(toolsForTier(managers.tools, "MANAGER"), managers.tools)
  })

  test("the two filters commute, so the order the pages apply them in does not matter", () => {
    for (const g of TOOL_GROUPS) {
      for (const tier of ["STAFF", "SENIOR", "MANAGER", "OWNER", null] as (Tier | null)[]) {
        for (const quiet of [true, false]) {
          assert.deepEqual(
            visibleTools(toolsForTier(g.tools, tier), quiet),
            toolsForTier(visibleTools(g.tools, quiet), tier),
            `${g.slug} ${tier} quiet=${quiet}`
          )
        }
      }
    }
  })

  test("Staff gets the Managers tile and the area's grid, but never Where to order it or Price check (Chloe, 13 Oct)", () => {
    // The tile itself (href /kitchen/managers) is on every grid; the password decides inside.
    const groupTiles = TOOL_GROUPS.map((g) => ({ href: g.href ?? `/staffaccess/${g.slug}`, slug: g.slug }))
    assert.ok(toolsForTier(groupTiles, "STAFF").some((t) => t.slug === "managers"))
    assert.equal(meetsTier("STAFF", tierForHref("/kitchen/managers")), true)

    // Inside the area a kitchen hand who knows the password still never sees the supplier map.
    const staffGrid = hrefs(visibleTools(toolsForTier(managers.tools, "STAFF"), false))
    assert.ok(staffGrid.includes("/kitchen/managers/board"))
    assert.ok(staffGrid.includes("/kitchen/lineup"))
    assert.equal(staffGrid.includes("/kitchen/managers/preferred"), false)
    assert.equal(hrefs(toolsForTier(stock.tools, "STAFF")).includes("/kitchen/prices"), false)

    // Direct links, with and without a query string, resolve to Senior: mayOpen/assertPage refuse STAFF.
    for (const h of ["/kitchen/managers/preferred", "/kitchen/managers/preferred?q=anchor%20butter%205kg", "/kitchen/prices", "/kitchen/prices?q=bridor%20croissant"]) {
      assert.equal(tierForHref(h), "SENIOR", h)
      assert.equal(meetsTier("STAFF", tierForHref(h)), false, h)
      assert.equal(meetsTier("SENIOR", tierForHref(h)), true, h)
    }
    // A neighbour under /kitchen/managers is not swallowed by the preferred prefix.
    assert.equal(tierForHref("/kitchen/managers/preferred-x"), "STAFF")
    assert.equal(tierForHref("/kitchen/managers/pref"), "STAFF")

    // A Senior gets Where to order it, and the copy-quiet list takes it away again.
    const seniorGrid = hrefs(toolsForTier(managers.tools, "SENIOR"))
    assert.ok(seniorGrid.includes("/kitchen/managers/preferred"))
    const copyQuiet = hrefs(copyVisibleTools(toolsForTier(managers.tools, "SENIOR"), true))
    assert.equal(copyQuiet.includes("/kitchen/managers/preferred"), false)
    assert.ok(copyQuiet.includes("/kitchen/managers/board"))
    assert.equal(hrefs(copyVisibleTools(toolsForTier(stock.tools, "SENIOR"), true)).includes("/kitchen/prices"), false)
  })

  test("nasty inputs: nobody signed in gets nothing whatever the quiet flag, empty grids stay empty", () => {
    assert.deepEqual(visibleTools(toolsForTier(stock.tools, null), true), [])
    assert.deepEqual(visibleTools(toolsForTier(stock.tools, null), false), [])
    assert.deepEqual(visibleTools(toolsForTier([], "OWNER"), false), [])
    assert.equal(meetsTier(null, "STAFF"), false)
  })
})

describe("tiers: Manager routes agree with the prefix list", () => {
  // Drift guard, the Manager half of the Senior one in tiers.test.ts. Every
  // Manager prefix is a password-gated area or page; its own route folder must
  // carry that gate (requireManager, requireFullManager or requireGm), or the
  // tile filter is the only thing between a Senior and yesterday's take.
  test("every Manager route folder carries a managers or GM gate", () => {
    const appDir = path.join(process.cwd(), "src", "app")
    assert.ok(fs.existsSync(appDir), `expected ${appDir} (run from repo root)`)
    for (const prefix of [...MANAGER_PREFIXES, ...MANAGERS_AREA_PREFIXES]) {
      const dir = path.join(appDir, ...prefix.split("/").filter(Boolean))
      assert.ok(fs.existsSync(dir), `${prefix} has no route directory`)
      const src = ["layout.tsx", "page.tsx", "route.ts"]
        .map((f) => path.join(dir, f))
        .filter((f) => fs.existsSync(f))
        .map((f) => fs.readFileSync(f, "utf8"))
        .join("\n")
      assert.ok(
        /\b(requireManager|requireFullManager|requireGm)\(/.test(src),
        `${prefix}: no requireManager / requireFullManager / requireGm in its layout, page or route`
      )
    }
  })
})
