import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { brisbaneDate, summariseOrders, summarisePeople, summariseRestock, toolFor, usageFor, watchList } from "./report"

const at = (iso: string) => new Date(iso)

describe("toolFor", () => {
  test("maps paths to tiles, longest prefix first, query strings ignored", () => {
    assert.equal(toolFor("/kitchen/lineup?venue=BURLEIGH"), "Line-up")
    assert.equal(toolFor("/kitchen/managers/sales/hourly"), "Sales insights")
    assert.equal(toolFor("/kitchen/managers/board"), "Morning board")
    assert.equal(toolFor("/kitchen/managers"), "Managers")
    assert.equal(toolFor("/kitchen/order/kitchen"), "Ordering")
    assert.equal(toolFor("/kitchen/restock/count"), "Prep list")
    assert.equal(toolFor("/log"), "Wastage log")
    assert.equal(toolFor("/kitchen"), "Checklists")
    assert.equal(toolFor("/kitchen/run/abc123"), "Checklists")
    assert.equal(toolFor("/kitchen/start/abc123"), "Checklists")
    assert.equal(toolFor("/kitchen/meeting"), "kitchen/meeting")
    assert.equal(toolFor("/kitchen/raise"), "Raise something")
  })

  test("menus, sign-in and the deed are not tools", () => {
    for (const p of ["/staffaccess", "/staffaccess/stock", "/staff-login", "/kitchen/confidentiality", "/kitchen/managers/unlock", "", null, undefined]) {
      assert.equal(toolFor(p), null, String(p))
    }
  })
})

describe("brisbaneDate", () => {
  test("a 5 am open and a 9 pm close are the same day; 23:30 UTC is already tomorrow", () => {
    assert.equal(brisbaneDate(at("2026-10-11T19:00:00Z")), "2026-10-12")
    assert.equal(brisbaneDate(at("2026-10-12T11:00:00Z")), "2026-10-12")
    assert.equal(brisbaneDate(at("2026-10-12T13:30:00Z")), "2026-10-12")
    assert.equal(brisbaneDate(at("2026-10-12T14:30:00Z")), "2026-10-13")
  })
})

describe("summarisePeople", () => {
  const views = [
    { staffId: "s1", staffName: "Lacey Corby", path: "/kitchen/lineup", at: at("2026-10-10T20:00:00Z") },
    { staffId: "s1", staffName: "Lacey Corby", path: "/kitchen/lineup", at: at("2026-10-11T20:00:00Z") },
    { staffId: "s1", staffName: "Lacey Corby", path: "/kitchen/managers/board", at: at("2026-10-11T20:05:00Z") },
    { staffId: "s1", staffName: "Lacey Corby", path: "/staffaccess", at: at("2026-10-11T20:06:00Z") },
    { staffId: "s2", staffName: "Jose Luis Rincon", path: "/kitchen/order/kitchen", at: at("2026-10-11T06:00:00Z") },
  ]
  const logins = [
    { staffId: "s1", staffName: "Lacey Corby", at: at("2026-10-10T19:55:00Z") },
    { staffId: "s1", staffName: "Lacey Corby", at: at("2026-10-11T19:55:00Z") },
    { staffId: "s3", staffName: "Hannah Summers", at: at("2026-10-09T19:55:00Z") },
  ]
  const people = summarisePeople(views, logins)

  test("one row per person, sorted by name, menus not counted as views", () => {
    assert.deepEqual(people.map((p) => p.name), ["Hannah Summers", "Jose Luis Rincon", "Lacey Corby"])
    const lacey = people[2]
    assert.equal(lacey.views, 3)
    assert.equal(lacey.daysActive, 2)
    assert.equal(lacey.logins, 2)
    assert.deepEqual(lacey.byTool, { "Line-up": 2, "Morning board": 1 })
    assert.equal(lacey.lastSeen?.toISOString(), "2026-10-11T20:05:00.000Z")
  })

  test("someone who signed in but opened nothing shows zero days active", () => {
    const hannah = people[0]
    assert.equal(hannah.logins, 1)
    assert.equal(hannah.daysActive, 0)
    assert.equal(hannah.views, 0)
  })

  test("usageFor matches the watch list by first name or full name and merges split rows", () => {
    const split = summarisePeople(
      [
        { staffId: "s1", staffName: "Lacey Corby", path: "/kitchen/lineup", at: at("2026-10-10T20:00:00Z") },
        { staffId: null, staffName: "Lacey Corby", path: "/kitchen/jobs", at: at("2026-10-11T20:00:00Z") },
      ],
      []
    )
    const u = usageFor({ name: "Lacey", venue: "BURLEIGH", role: "Supervisor" }, split)
    assert.ok(u)
    assert.equal(u.views, 2)
    assert.deepEqual(u.byTool, { "Line-up": 1, "Jobs board": 1 })
    assert.equal(usageFor({ name: "Jazz", venue: "BURLEIGH", role: "Supervisor" }, people), null)
    assert.equal(usageFor({ name: "Jose Luis Rincon", venue: null, role: "Manager" }, people)?.views, 1)
  })
})

describe("watchList", () => {
  test("team list first, overrides added once, a bare first name folds into its full name", () => {
    const w = watchList(
      [
        { venue: "BURLEIGH", name: "Georgia", role: "MANAGER" },
        { venue: "BURLEIGH", name: "Sav", role: "SUPERVISOR" },
      ],
      { "Lacey Corby": "SENIOR", Lacey: "SENIOR", Vinicius: "MANAGER", Vini: "MANAGER", Georgia: "SENIOR" }
    )
    assert.deepEqual(
      w.map((x) => [x.name, x.role]),
      [["Georgia", "Manager"], ["Sav", "Supervisor"], ["Lacey Corby", "Senior"], ["Vinicius", "Manager"], ["Vini", "Manager"]]
    )
  })
})

describe("ordering and prep summaries", () => {
  test("orders: per venue and department, with days, lines and who", () => {
    const rows = summariseOrders([
      { venue: "BEACH_HOUSE", dept: "KITCHEN", requestDate: at("2026-10-10T00:00:00Z"), enteredBy: "Jose" },
      { venue: "BEACH_HOUSE", dept: "KITCHEN", requestDate: at("2026-10-10T00:00:00Z"), enteredBy: "Jose" },
      { venue: "BEACH_HOUSE", dept: "KITCHEN", requestDate: at("2026-10-11T00:00:00Z"), enteredBy: " Julian " },
      { venue: "BEACH_HOUSE", dept: "KITCHEN", requestDate: at("2026-10-11T00:00:00Z"), enteredBy: null },
      { venue: "BURLEIGH", dept: "PASTRY", requestDate: at("2026-10-11T00:00:00Z"), enteredBy: "Jess" },
    ])
    assert.deepEqual(
      rows.map((r) => [r.venue, r.dept, r.lines, r.days, r.people]),
      [["BEACH_HOUSE", "KITCHEN", 4, 2, ["Jose", "Julian"]], ["BURLEIGH", "PASTRY", 1, 1, ["Jess"]]]
    )
    assert.deepEqual(summariseOrders([]), [])
  })

  test("prep sheets: per venue and station, submitted vs started", () => {
    const rows = summariseRestock([
      { venue: "TEA_GARDEN", station: "PASTRY", sheetDate: at("2026-10-10T00:00:00Z"), countedBy: "Hannah", submittedAt: at("2026-10-10T10:00:00Z") },
      { venue: "TEA_GARDEN", station: "PASTRY", sheetDate: at("2026-10-11T00:00:00Z"), countedBy: null, submittedAt: null },
    ])
    assert.deepEqual(rows.map((r) => [r.venue, r.station, r.sheets, r.submitted, r.people]), [["TEA_GARDEN", "PASTRY", 2, 1, ["Hannah"]]])
  })
})

describe("edges the office page leans on", () => {
  test("brisbaneDate: a date-only column (Prisma hands back UTC midnight) labels that same calendar day, all year", () => {
    assert.equal(brisbaneDate(at("2026-10-12T00:00:00.000Z")), "2026-10-12")
    assert.equal(brisbaneDate(at("2026-01-05T00:00:00.000Z")), "2026-01-05")
    assert.equal(brisbaneDate(at("2026-06-30T00:00:00.000Z")), "2026-06-30")
  })

  test("brisbaneDate: 13:59:59Z is still today, 14:00:00Z exactly is tomorrow (Brisbane is UTC+10, no daylight saving)", () => {
    assert.equal(brisbaneDate(at("2026-10-12T13:59:59Z")), "2026-10-12")
    assert.equal(brisbaneDate(at("2026-10-12T14:00:00Z")), "2026-10-13")
    assert.equal(brisbaneDate(at("2026-12-31T14:00:00Z")), "2027-01-01")
  })

  test("empty inputs give empty output and nothing throws", () => {
    assert.deepEqual(summarisePeople([], []), [])
    assert.deepEqual(watchList([], {}), [])
    assert.deepEqual(summariseOrders([]), [])
    assert.deepEqual(summariseRestock([]), [])
    assert.equal(usageFor({ name: "Jess Passos", venue: null, role: "Manager" }, []), null)
  })

  test("rows with no id and no name land under one 'unknown' row; a view with no path is not a view", () => {
    const people = summarisePeople(
      [
        { staffId: null, staffName: null, path: null, at: at("2026-10-12T01:00:00Z") },
        { staffId: null, staffName: null, path: "/kitchen/cooling", at: at("2026-10-12T01:10:00Z") },
      ],
      [{ staffId: null, staffName: null, at: at("2026-10-12T00:59:00Z") }]
    )
    assert.equal(people.length, 1)
    assert.equal(people[0].key, "unknown")
    assert.equal(people[0].name, "unknown")
    assert.equal(people[0].views, 1)
    assert.equal(people[0].logins, 1)
    assert.equal(people[0].daysActive, 1)
    assert.deepEqual(people[0].byTool, { "Cooling log": 1 })
  })

  test("a person keyed by id but logged with no name shows the id, not a blank", () => {
    const people = summarisePeople([{ staffId: "shifts-41", staffName: null, path: "/kitchen/order/pastry", at: at("2026-10-12T01:00:00Z") }], [])
    assert.equal(people[0].key, "shifts-41")
    assert.equal(people[0].name, "shifts-41")
    assert.deepEqual(people[0].byTool, { Ordering: 1 })
  })

  test("watchList: blank names are dropped and the dedupe ignores case and spacing", () => {
    const w = watchList(
      [
        { venue: "BURLEIGH", name: "   ", role: "MANAGER" },
        { venue: "BEACH_HOUSE", name: "Jose Luis Rincon", role: "MANAGER" },
      ],
      { "  jose luis rincon ": "MANAGER", "Jess Passos": "MANAGER", "": "SENIOR" }
    )
    assert.deepEqual(
      w.map((x) => [x.name, x.venue, x.role]),
      [["Jose Luis Rincon", "BEACH_HOUSE", "Manager"], ["Jess Passos", null, "Manager"]]
    )
  })

  test("usageFor: a full-name watch entry needs the full name in the log, so 'Jess Passos' does not pick up 'Jessica Passos'", () => {
    const people = summarisePeople([{ staffId: "s9", staffName: "Jessica Passos", path: "/kitchen/pastry", at: at("2026-10-12T01:00:00Z") }], [])
    assert.equal(usageFor({ name: "Jess Passos", venue: null, role: "Manager" }, people), null)
    assert.equal(usageFor({ name: "Jessica Passos", venue: null, role: "Manager" }, people)?.views, 1)
    assert.equal(usageFor({ name: "Jessica", venue: null, role: "Manager" }, people)?.views, 1)
  })
})
