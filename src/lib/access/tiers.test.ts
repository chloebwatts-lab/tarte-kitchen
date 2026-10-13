import { test, describe } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { TOOL_GROUPS, groupBySlug } from "../staff-tools"
import {
  MANAGER_PREFIXES,
  SENIOR_PREFIXES,
  TIER_LANDING,
  meetsTier,
  tierForHref,
  tierOfRole,
  toolsForTier,
} from "./tiers"

describe("tiers: who", () => {
  test("Shifts roles map to tiers, Senior is the Shifts SENIOR role", () => {
    assert.equal(tierOfRole("STAFF"), "STAFF")
    assert.equal(tierOfRole("SUPERVISOR"), "SENIOR")
    assert.equal(tierOfRole("MANAGER"), "MANAGER")
    assert.equal(tierOfRole("OWNER"), "OWNER")
  })

  test("a tier meets itself and everything below, never above", () => {
    assert.equal(meetsTier("STAFF", "STAFF"), true)
    assert.equal(meetsTier("STAFF", "SENIOR"), false)
    assert.equal(meetsTier("SENIOR", "SENIOR"), true)
    assert.equal(meetsTier("SENIOR", "MANAGER"), false)
    assert.equal(meetsTier("MANAGER", "SENIOR"), true)
    assert.equal(meetsTier("MANAGER", "OWNER"), false)
    assert.equal(meetsTier("OWNER", "MANAGER"), true)
  })

  test("nobody signed in meets nothing, not even STAFF", () => {
    assert.equal(meetsTier(null, "STAFF"), false)
    assert.equal(meetsTier(undefined, "STAFF"), false)
  })
})

describe("tiers: what", () => {
  test("supplier map, order sheet, recipes and bookings are Senior; a section's own order is open to every chef", () => {
    for (const h of ["/kitchen/ordering", "/kitchen/order/sheet", "/kitchen/serves", "/kitchen/portions", "/kitchen/high-tea", "/kitchen/high-tea?day=2026-10-12", "/kitchen/functions"]) {
      assert.equal(tierForHref(h), "SENIOR", h)
    }
    for (const h of ["/kitchen/order", "/kitchen/order/pastry", "/kitchen/order/kitchen"]) {
      assert.equal(tierForHref(h), "STAFF", h)
    }
  })

  test("the managers area is open to every tier (its password decides); price check is Senior; GM desk and meeting deck are Manager", () => {
    for (const h of ["/kitchen/managers", "/kitchen/managers/sales", "/kitchen/lineup", "/kitchen/jobs", "/kitchen/commitments", "/kitchen/training"]) {
      assert.equal(tierForHref(h), "STAFF", h)
    }
    for (const h of ["/kitchen/prices", "/kitchen/managers/preferred"]) {
      assert.equal(tierForHref(h), "SENIOR", h)
    }
    for (const h of ["/kitchen/gm", "/kitchen/meeting", "/kitchen/meeting?deck=2026-09"]) {
      assert.equal(tierForHref(h), "MANAGER", h)
    }
  })

  test("Chloe's calls: fix, services, inspection, prep and the logs stay open to everyone", () => {
    for (const h of ["/kitchen", "/kitchen/fix", "/kitchen/fix/oven-1", "/kitchen/services", "/kitchen/inspection", "/kitchen/prep", "/kitchen/restock", "/kitchen/stock", "/kitchen/printers", "/kitchen/pastry", "/kitchen/cooling", "/log", "/kitchen/report", "/kitchen/raise"]) {
      assert.equal(tierForHref(h), "STAFF", h)
    }
  })

  test("a prefix never swallows a neighbour", () => {
    assert.equal(tierForHref("/kitchen/orders-history"), "STAFF")
    assert.equal(tierForHref("/kitchen/managersx"), "STAFF")
    assert.equal(tierForHref("/kitchen/meetings"), "STAFF")
  })

  test("the landing page is open to every tier", () => {
    assert.equal(tierForHref(TIER_LANDING), "STAFF")
  })
})

describe("tiers: the grids", () => {
  const groupTiles = TOOL_GROUPS.map((g) => ({ href: g.href ?? `/staffaccess/${g.slug}`, slug: g.slug }))

  test("Staff keeps the locked Managers tile but sees no Oliver or Functions tile; Senior gets Functions; Manager gets all three", () => {
    const staff = toolsForTier(groupTiles, "STAFF").map((t) => t.slug)
    assert.ok(staff.includes("checklists") && staff.includes("stock") && staff.includes("spotted") && staff.includes("pastry"))
    assert.ok(staff.includes("managers"), "the Managers tile stays on every grid with its lock (Chloe, 13 Oct)")
    assert.equal(staff.includes("gm"), false)
    assert.equal(staff.includes("functions"), false)

    const senior = toolsForTier(groupTiles, "SENIOR").map((t) => t.slug)
    assert.ok(senior.includes("functions"))
    assert.ok(senior.includes("managers"))
    assert.equal(senior.includes("gm"), false)

    const manager = toolsForTier(groupTiles, "MANAGER").map((t) => t.slug)
    assert.ok(manager.includes("managers") && manager.includes("gm") && manager.includes("functions"))
    assert.deepEqual(toolsForTier(groupTiles, "OWNER"), groupTiles)
  })

  test("Staff keeps the stock walk and prep list but loses ordering, where to buy, serves and price check", () => {
    const stock = groupBySlug("stock")!
    const staff = toolsForTier(stock.tools, "STAFF").map((t) => t.href)
    assert.ok(staff.includes("/kitchen/stock"))
    assert.ok(staff.includes("/kitchen/restock"))
    assert.ok(staff.includes("/kitchen/prep"))
    assert.ok(staff.includes("/kitchen/order"), "every chef orders for their section")
    for (const gone of ["/kitchen/ordering", "/kitchen/serves", "/kitchen/high-tea"]) {
      assert.equal(staff.includes(gone), false, gone)
    }
    const senior = toolsForTier(stock.tools, "SENIOR").map((t) => t.href)
    assert.ok(senior.includes("/kitchen/order") && senior.includes("/kitchen/ordering") && senior.includes("/kitchen/serves"))
    assert.ok(senior.includes("/kitchen/prices"), "price check is behind the managers password, which supervisors hold")
    assert.equal(toolsForTier(stock.tools, "STAFF").some((t) => t.href === "/kitchen/prices"), false)
  })

  test("nobody signed in sees no tiles at all", () => {
    assert.deepEqual(toolsForTier(groupBySlug("checklists")!.tools, null), [])
  })
})

describe("tiers: routes agree with the prefix list", () => {
  // Drift guard. A page under a Senior prefix must be gated in its own folder
  // (page or layout) with requireTier, or the tile filter is the only thing
  // standing between a kitchen hand and the supplier map.
  test("every Senior route folder carries a requireTier gate", () => {
    const appDir = path.join(process.cwd(), "src", "app")
    assert.ok(fs.existsSync(appDir), `expected ${appDir} (run from repo root)`)
    for (const prefix of SENIOR_PREFIXES) {
      const dir = path.join(appDir, ...prefix.split("/").filter(Boolean))
      assert.ok(fs.existsSync(dir), `${prefix} has no route directory`)
      const gates = ["layout.tsx", "page.tsx"]
        .map((f) => path.join(dir, f))
        .filter((f) => fs.existsSync(f))
        .map((f) => fs.readFileSync(f, "utf8"))
      assert.ok(
        gates.some((src) => src.includes('requireTier("SENIOR"') || src.includes(`requirePage("${prefix}"`)),
        `${prefix}: no requireTier("SENIOR") or requirePage("${prefix}") in its layout or page`
      )
    }
  })

  test("the meeting deck route is behind the full managers gate and a Manager tier gate", () => {
    const route = path.join(process.cwd(), "src", "app", "kitchen", "meeting", "route.ts")
    const src = fs.readFileSync(route, "utf8")
    assert.ok(src.includes("requireFullManager("), "meeting deck must call requireFullManager")
    // Supervisors hold the managers password, so the password gate alone no
    // longer keeps a Senior out of P&L and wages: the route must also ask for
    // the Manager tier, and the prefix list must agree so the tile is withheld.
    assert.ok(src.includes('requireTier("MANAGER")'), "meeting deck must call requireTier(\"MANAGER\")")
    assert.ok(MANAGER_PREFIXES.includes("/kitchen/meeting"))
    assert.equal(meetsTier("SENIOR", tierForHref("/kitchen/meeting")), false)
  })
})
