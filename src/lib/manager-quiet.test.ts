import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { TOOL_GROUPS, groupBySlug } from "./staff-tools"
import fs from "node:fs"
import path from "node:path"
import { isQuietHiddenHref, isQuietPerson, parseQuietList, visibleTools, QUIET_HIDDEN_PREFIXES, QUIET_LANDING } from "./manager-quiet"

const savannah = { id: "shifts-412", name: "Savannah Hjorth" }
const lacey = { id: "shifts-207", name: "Lacey Corby" }
const list = JSON.stringify(["Savannah Hjorth"])

describe("managers quiet list: who", () => {
  test("no row set means nobody is quiet", () => {
    assert.equal(isQuietPerson(null, savannah), false)
    assert.equal(isQuietPerson(undefined, savannah), false)
  })

  test("full name matches, case and spacing ignored", () => {
    assert.equal(isQuietPerson(list, savannah), true)
    assert.equal(isQuietPerson(list, { id: "x", name: "  savannah   HJORTH " }), true)
    assert.equal(isQuietPerson(JSON.stringify(["SAVANNAH HJORTH"]), savannah), true)
  })

  test("staff id matches too", () => {
    assert.equal(isQuietPerson(JSON.stringify(["shifts-412"]), savannah), true)
  })

  test("other people are untouched, first name alone never matches", () => {
    assert.equal(isQuietPerson(list, lacey), false)
    assert.equal(isQuietPerson(JSON.stringify(["Savannah"]), savannah), false)
    assert.equal(isQuietPerson(list, { id: "y", name: "Savannah Hjorth-Smith" }), false)
  })

  test("no signed-in person is never quiet", () => {
    assert.equal(isQuietPerson(list, null), false)
  })

  test("a broken list fails closed: everyone signed in is quiet", () => {
    assert.equal(isQuietPerson("not json", lacey), true)
    assert.equal(isQuietPerson(JSON.stringify({ a: 1 }), lacey), true)
    assert.equal(isQuietPerson(JSON.stringify([1, 2]), lacey), true)
    assert.deepEqual(parseQuietList("[]"), { list: [] })
    assert.equal(isQuietPerson("[]", savannah), false)
  })
})

describe("managers quiet list: what", () => {
  test("sales, agenda, supplier pricing, training records are withheld, operational tools are not", () => {
    for (const h of ["/kitchen/managers/sales", "/kitchen/managers/sales/hourly", "/kitchen/managers/agenda", "/kitchen/managers/preferred", "/kitchen/prices", "/kitchen/training", "/kitchen/training/new"]) {
      assert.equal(isQuietHiddenHref(h), true, h)
    }
    for (const h of ["/kitchen/lineup", "/kitchen/managers/board", "/kitchen/jobs", "/kitchen/commitments", "/kitchen/managers/stock-setup", "/kitchen/managers", "/kitchen/pricesx", "/kitchen/trainingx"]) {
      assert.equal(isQuietHiddenHref(h), false, h)
    }
  })

  test("a quiet manager's grid drops exactly the withheld tiles, nobody else's changes", () => {
    const managers = groupBySlug("managers")!
    const quiet = visibleTools(managers.tools, true)
    assert.deepEqual(
      quiet.map((t) => t.href),
      managers.tools.map((t) => t.href).filter((h) => !isQuietHiddenHref(h))
    )
    assert.ok(quiet.length < managers.tools.length)
    assert.ok(quiet.some((t) => t.href === "/kitchen/lineup"))
    assert.ok(quiet.some((t) => t.href === "/kitchen/managers/board"))
    assert.equal(quiet.some((t) => t.href.startsWith("/kitchen/managers/sales")), false)
    assert.deepEqual(visibleTools(managers.tools, false), managers.tools)
  })

  test("price check is hidden from the open stock group for a quiet manager", () => {
    const stock = groupBySlug("stock")!
    assert.ok(stock.tools.some((t) => t.href === "/kitchen/prices"))
    assert.equal(visibleTools(stock.tools, true).some((t) => t.href === "/kitchen/prices"), false)
  })

  test("the landing page is itself never withheld", () => {
    assert.equal(isQuietHiddenHref(QUIET_LANDING), false)
    assert.ok(TOOL_GROUPS.some((g) => g.href === QUIET_LANDING))
  })
})

describe("managers quiet list: edges", () => {
  test("spacing and case on the list side are ignored too, ids are exact", () => {
    assert.equal(isQuietPerson(JSON.stringify(["  savannah   hjorth "]), savannah), true)
    assert.equal(isQuietPerson(JSON.stringify(["Savannah\tHjorth"]), savannah), true)
    assert.equal(isQuietPerson(JSON.stringify(["SHIFTS-412"]), savannah), false)
    assert.equal(isQuietPerson(JSON.stringify(["", " "]), savannah), false)
  })

  test("a cleared or null row body is a broken list, so it fails closed", () => {
    assert.deepEqual(parseQuietList(""), { broken: true })
    assert.deepEqual(parseQuietList("null"), { broken: true })
    assert.deepEqual(parseQuietList(JSON.stringify([null])), { broken: true })
    assert.equal(isQuietPerson("", lacey), true)
    assert.equal(isQuietPerson("null", lacey), true)
  })

  test("visibleTools on an empty grid stays empty and never throws", () => {
    assert.deepEqual(visibleTools([], true), [])
    assert.deepEqual(visibleTools([], false), [])
  })
})

describe("managers quiet list: pages agree with the prefix list", () => {
  // Drift guard. A new sales or prices page written with plain requireManager
  // would quietly reopen the withheld area; the pure helpers cannot see that.
  test("every page under a withheld prefix calls requireFullManager", () => {
    const appDir = path.join(process.cwd(), "src", "app")
    assert.ok(fs.existsSync(appDir), `expected ${appDir} (run from repo root)`)
    const pages: string[] = []
    for (const prefix of QUIET_HIDDEN_PREFIXES) {
      const dir = path.join(appDir, ...prefix.split("/").filter(Boolean))
      assert.ok(fs.existsSync(dir), `withheld prefix ${prefix} has no route directory at ${dir}`)
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name)
          if (e.isDirectory()) walk(p)
          else if (e.name === "page.tsx") pages.push(p)
        }
      }
      walk(dir)
    }
    assert.ok(pages.length >= 8, `expected the sales, agenda, preferred and prices pages, found ${pages.length}`)
    for (const p of pages) {
      // The gate may sit in the page or in the route folder's layout (training).
      const layout = path.join(path.dirname(p), "layout.tsx")
      const src = fs.readFileSync(p, "utf8") + (fs.existsSync(layout) ? fs.readFileSync(layout, "utf8") : "")
      assert.ok(src.includes("requireFullManager("), `${path.relative(process.cwd(), p)} does not call requireFullManager`)
      assert.equal(/\brequireManager\(/.test(src), false, `${path.relative(process.cwd(), p)} still calls plain requireManager`)
    }
  })
})
