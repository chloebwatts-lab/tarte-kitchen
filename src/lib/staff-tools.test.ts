import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { TOOL_GROUPS, groupBySlug } from "./staff-tools"
import { OFFICE_GROUPS } from "./office-tools"

/** Pages that carry numbers or names. Must never sit in an open staff group. */
const NUMBERS_OR_NAMES = ["/kitchen/lineup", "/kitchen/jobs", "/kitchen/commitments", "/kitchen/training", "/kitchen/managers/board", "/kitchen/managers/agenda", "/kitchen/gm"]

describe("staff tool groups", () => {
  test("managers and gm groups are locked with their own entry href", () => {
    const managers = groupBySlug("managers")
    const gm = groupBySlug("gm")
    assert.equal(managers?.locked, true)
    assert.equal(managers?.href, "/kitchen/managers")
    assert.equal(gm?.locked, true)
    assert.equal(gm?.href, "/kitchen/gm")
  })

  test("open groups never link to a page with numbers or names", () => {
    for (const g of TOOL_GROUPS.filter((g) => !g.locked)) {
      for (const t of g.tools) {
        assert.equal(NUMBERS_OR_NAMES.some((p) => t.href === p || t.href.startsWith(`${p}/`)), false, `${g.slug}: ${t.href}`)
        assert.equal(t.href.startsWith("/kitchen/managers"), false, t.href)
        assert.equal(t.href.startsWith("/kitchen/gm"), false, t.href)
      }
    }
  })

  test("every staff href is inside the staff-gated prefixes", () => {
    const prefixes = ["/kitchen", "/staffaccess", "/log"]
    for (const g of TOOL_GROUPS) {
      const hrefs = [g.href, ...g.tools.map((t) => t.href)].filter((h): h is string => !!h)
      for (const h of hrefs) {
        assert.ok(prefixes.some((p) => h === p || h.startsWith(`${p}/`)), h)
      }
    }
  })

  test("slugs are unique and lookup fails closed", () => {
    const slugs = TOOL_GROUPS.map((g) => g.slug)
    assert.equal(new Set(slugs).size, slugs.length)
    assert.equal(groupBySlug("owner"), undefined)
    assert.equal(groupBySlug(""), undefined)
    assert.equal(groupBySlug("MANAGERS"), undefined)
  })
})

describe("office tool groups", () => {
  test("office tiles never point into the staff area and have unique hrefs", () => {
    const hrefs = OFFICE_GROUPS.flatMap((g) => g.tools.map((t) => t.href))
    assert.equal(new Set(hrefs).size, hrefs.length)
    for (const h of hrefs) {
      assert.ok(h.startsWith("/"), h)
      assert.equal(h.startsWith("/kitchen"), false, h)
      assert.equal(h.startsWith("/staffaccess"), false, h)
    }
  })
})
