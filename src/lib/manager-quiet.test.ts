import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { TOOL_GROUPS, groupBySlug } from "./staff-tools"
import { isQuietHiddenHref, isQuietPerson, parseQuietList, visibleTools, QUIET_LANDING } from "./manager-quiet"

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
  test("sales, agenda, supplier pricing are withheld, operational tools are not", () => {
    for (const h of ["/kitchen/managers/sales", "/kitchen/managers/sales/hourly", "/kitchen/managers/agenda", "/kitchen/managers/preferred", "/kitchen/prices"]) {
      assert.equal(isQuietHiddenHref(h), true, h)
    }
    for (const h of ["/kitchen/lineup", "/kitchen/managers/board", "/kitchen/jobs", "/kitchen/commitments", "/kitchen/training", "/kitchen/managers/stock-setup", "/kitchen/managers", "/kitchen/pricesx"]) {
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
