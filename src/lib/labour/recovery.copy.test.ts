import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { recoveryCopy, recoveryPlan, type RecoveryCopy } from "./recovery"
import type { LiveBucketRow, LiveVenueSnapshot } from "./live"
import type { Venue } from "@/generated/prisma/client"

/**
 * recoveryCopy, the wording of the "To finish the week on target" box on
 * Wages + COGS. Every line is read by Chloe on her phone, so beyond the
 * figures: the right day range on a Wednesday and a Tuesday, never a "$0",
 * never green beside a team over, and no sentence that reads as a
 * contradiction.
 */

const R = 96336 // Beach House week takings, ex GST

type Key = "chefsKp" | "fohBarista" | "pastry"
const BANDS: Record<Venue, Partial<Record<Key, { label: string; min: number; max: number }>>> = {
  BEACH_HOUSE: {
    chefsKp: { label: "Chefs + KP", min: 12.5, max: 13.5 },
    fohBarista: { label: "FOH (incl. Barista)", min: 21.5, max: 22.5 },
    pastry: { label: "Pastry", min: 2.5, max: 3 },
  },
  BURLEIGH: {
    chefsKp: { label: "Chefs + KP", min: 11.5, max: 12 },
    fohBarista: { label: "FOH + Barista", min: 20.5, max: 21 },
    pastry: { label: "Pastry", min: 4.75, max: 5.25 },
  },
  TEA_GARDEN: {},
} as Record<Venue, Partial<Record<Key, { label: string; min: number; max: number }>>>

/** A department `dollarsOverTop` over (negative: under) its band top on `revenue`. */
function team(key: Key, dollarsOverTop: number, stillToRun: number, venue: Venue = "BEACH_HOUSE", revenue = R): LiveBucketRow {
  const b = BANDS[venue][key]!
  const total = (b.max / 100) * revenue + dollarsOverTop
  return {
    key,
    label: b.label,
    target: { key, label: b.label, min: b.min, max: b.max },
    spentToDate: 0,
    projectedTotal: total,
    projectedPct: (total / revenue) * 100,
    status: "no-target",
    varianceVsBandPct: null,
    paidLeave: 0,
    workingPct: (total / revenue) * 100,
    workingStatus: "no-target",
    workingVarianceVsBandPct: null,
    rosterStillToRun: stillToRun,
  }
}

interface Opts {
  venue?: Venue
  revenue?: number
  /** Wages outside every band (admin, unmapped areas): they land in the week gap, not in a team. */
  outside?: number
  lockedDays?: number
  /** Finished days, dollars over (negative: under) target. */
  lockedOver?: number
  rosterStillToRun?: number
  revenueStillToCome?: number
}

function snap(buckets: LiveBucketRow[], o: Opts = {}): LiveVenueSnapshot {
  const venue = o.venue ?? "BEACH_HOUSE"
  const revenue = o.revenue ?? R
  const lockedDays = o.lockedDays ?? 5
  const target = venue === "BURLEIGH" ? 0.3825 : 0.39
  const lockedRevenue = lockedDays === 0 ? 0 : (revenue * lockedDays) / 7
  const lockedLabour = lockedDays === 0 ? 0 : target * lockedRevenue + (o.lockedOver ?? -604)
  // A band left out of `buckets` sits exactly on its top, so it neither adds to nor nets the week.
  const missing = (Object.values(BANDS[venue]) as { max: number }[])
    .filter((b) => !buckets.some((x) => x.target?.max === b.max))
    .reduce((s, b) => s + (b.max / 100) * revenue, 0)
  const working = buckets.reduce((s, b) => s + b.projectedTotal, 0) + missing + (o.outside ?? 0)
  const stillToRun = o.rosterStillToRun ?? buckets.reduce((s, b) => s + b.rosterStillToRun, 0) + 300
  return {
    venue,
    label: venue,
    labourToDate: 0,
    labourProjected: working,
    revenueToDate: lockedRevenue,
    revenueProjected: revenue,
    revenueLastWeekSameDays: null,
    revenueVsLastWeekPct: null,
    revenueLastWeekTotal: null,
    overallProjectedPct: (working / revenue) * 100,
    paidLeave: 0,
    workingProjectedPct: (working / revenue) * 100,
    locked: { labour: lockedLabour, revenue: lockedRevenue, pct: null, days: lockedDays, paidLeave: 0, workingPct: null },
    today: { live: true, labourSoFar: 0, revenueSoFar: 0, shareOfDayDone: null, revenueRestOfDay: 0, labourRestOfDay: 0 },
    rosterStillToRun: stillToRun,
    revenueStillToCome: o.revenueStillToCome ?? 9572,
    days: [],
    buckets,
    coverage: { daysLocked: lockedDays, daysRemaining: 6 - lockedDays, asOf: "2026-11-23T09:59:00.000Z" },
  }
}

const copyOf = (v: LiveVenueSnapshot): RecoveryCopy => recoveryCopy(recoveryPlan(v)!, { lockedDays: v.locked.days, revenueStillToCome: v.revenueStillToCome })
const lines = (c: RecoveryCopy) => [c.headline, ...c.teams, ...c.notes, ...(c.week ? [c.week] : [])]
const dollars = (s: string) => Number(s.replace(/[$,]/g, ""))

describe("recoveryCopy: day ranges at the ends of the week", () => {
  test("Wednesday 6 am, nothing finished: 'Wed to Tue' throughout, no banked line", () => {
    const c = copyOf(snap([team("chefsKp", 1200, 9000), team("fohBarista", -3000, 14000), team("pastry", 0, 1500)], { lockedDays: 0, revenueStillToCome: R }))
    assert.equal(c.headline, "Cut $1,200 of wages, Wed to Tue, to get every team inside its band.")
    assert.doesNotMatch(c.week!, /banked|ran \$/)
    assert.match(c.week!, /^Week overall: \$1,800 under 39%\. Wed to Tue as rostered runs at \d+\.\d%\.$/)
  })

  test("Thursday: Wed is done, Thu to Tue is still to run", () => {
    const c = copyOf(snap([team("chefsKp", 0, 5000)], { lockedDays: 1, outside: 900, rosterStillToRun: 8000, revenueStillToCome: 80000 }))
    assert.equal(c.headline, "Cut $900 of wages, Thu to Tue, to get the week on 39%.")
    assert.match(c.week!, /Wed banked \$604 under; Thu to Tue as rostered/)
  })

  test("Tuesday lunchtime, still trading: 'Tue' alone, Wed to Mon banked, the takings way back offered", () => {
    const c = copyOf(snap([team("chefsKp", 0, 300), team("fohBarista", -100, 200)], { lockedDays: 6, outside: 400, rosterStillToRun: 500, revenueStillToCome: 3000 }))
    assert.equal(c.headline, "Cut $300 of wages, Tue, to get the week on 39%.")
    assert.deepEqual(c.notes, ["From the $500 still rostered."])
    assert.match(c.week!, /Wed to Mon banked \$604 under; Tue as rostered runs at/)
    assert.match(c.week!, /Or take \$769 more than forecast \(26% above the \$3,000 still expected\)/)
  })

  test("Burleigh: 38.25% target and its own band tops in the wording", () => {
    const c = copyOf(snap([team("chefsKp", 700, 1200, "BURLEIGH", 80000), team("pastry", 0, 300, "BURLEIGH", 80000)], { venue: "BURLEIGH", revenue: 80000, outside: 500 }))
    assert.equal(c.target, "38.25%")
    assert.equal(c.headline, "Cut $1,200 of wages, Mon to Tue, to get every team inside its band and the week on 38.25%.")
    assert.match(c.teams[0], /^Chefs \+ KP: \$700 over its 12% top \(12\.9%\)\./)
    assert.deepEqual(c.notes, ["Plus $500 from any team with shifts left to land the week on 38.25%."])
  })
})

describe("recoveryCopy: the three fixes from the 11cb7b6 NO-GO", () => {
  test("(1) out of reach is said with a team over even when the week itself is under", () => {
    const c = copyOf(snap([team("chefsKp", 1500, 600), team("fohBarista", -2500, 300)], { rosterStillToRun: 1000 }))
    assert.equal(c.tone, "red")
    // Chefs + KP is $1,500 over with $600 left: only its own $600 helps it (corrected after the 83107f2 guard run).
    assert.match(c.headline, /^Cut \$600 of wages, Mon to Tue, to get Chefs \+ KP as close to its band as its shifts allow\.$/)
    assert.match(c.teams[0], /not enough to fix it with cuts alone: cut all of it and it still finishes \$900 over\.$/)
  })

  test("(2) a team under a dollar over and the week over reads 'to get the week on 39%', no team listed", () => {
    const c = copyOf(snap([team("chefsKp", 0.4, 1400), team("fohBarista", 0, 2400)], { outside: 800 }))
    assert.equal(c.headline, "Cut $800 of wages, Mon to Tue, to get the week on 39%.")
    assert.deepEqual(c.teams, [])
  })

  test("(3) never 'Cut $0' or a '$0 over' team, and green never sits beside a team over, across small overs", () => {
    for (const over of [0, 0.01, 0.3, 0.49, 0.5, 0.99, 1, 1.49, 40, 963.36]) {
      for (const outside of [-2000, -0.6, -0.3, 0, 0.3, 0.49, 0.5, 0.8, 600]) {
        for (const lockedDays of [0, 3, 6]) {
          const c = copyOf(snap([team("chefsKp", over, 1400), team("fohBarista", 0, 2400)], { outside, lockedDays, revenueStillToCome: 5000 }))
          const at = `over ${over}, outside ${outside}, locked ${lockedDays}`
          assert.doesNotMatch(c.headline, /Cut \$0\b/, at)
          for (const t of c.teams) assert.doesNotMatch(t, /: \$0 over/, at)
          if (c.tone === "ok") {
            assert.deepEqual(c.teams, [], `green with a team listed: ${at}`)
            assert.match(c.headline, /^On (track|target)/, at)
            assert.equal(c.week, null, at)
          } else {
            assert.match(c.headline, /^Cut \$[1-9][\d,]* of wages, /, at)
            assert.doesNotMatch(c.headline, /^On /, at)
          }
          // A team a dollar or more over is always listed and always red.
          if (Math.round(over) >= 1) {
            assert.equal(c.tone, "red", at)
            assert.equal(c.teams.length, 1, at)
          }
        }
      }
    }
  })

  test("a team exactly 50c over rounds up into the list as $1, not $0", () => {
    const c = copyOf(snap([team("chefsKp", 0.5, 1400), team("fohBarista", -500, 2400)]))
    assert.equal(c.headline, "Cut $1 of wages, Mon to Tue, to get every team inside its band.")
    assert.match(c.teams[0], /^Chefs \+ KP: \$1 over its 13\.5% top/)
  })
})

describe("recoveryCopy: sentences that read wrong (found by test-guard, 24 Nov 2026)", () => {
  test("Tuesday evening, every shift done and a team over: no line says '$0'", () => {
    // Chefs + KP $3,395 over, nothing left rostered anywhere, trading done.
    const c = copyOf(snap([team("chefsKp", 3395, 0), team("fohBarista", -400, 0), team("pastry", -69, 0)], { lockedDays: 6, rosterStillToRun: 0, revenueStillToCome: 0 }))
    for (const l of lines(c)) assert.doesNotMatch(l, /\$0\b/, l)
  })

  test("the out-of-reach note never reads as a smaller figure being 'more than' the roster left", () => {
    // Chefs + KP $963 over with $700 rostered, $600 of admin outside the bands,
    // $1,300 left on the whole roster: the cut is $1,563, the 'Plus' line is $863 (Chefs + KP gives its $700).
    const c = copyOf(snap([team("chefsKp", 963, 700), team("fohBarista", 0, 400), team("pastry", 0, 100)], { outside: 600, rosterStillToRun: 1300 }))
    assert.equal(c.headline, "Cut $1,563 of wages, Mon to Tue, to get Chefs + KP as close to its band as its shifts allow and the week on 39%.")
    const i = c.notes.findIndex((n) => /left on the whole roster/.test(n))
    assert.ok(i >= 0, "out of reach is said")
    const note = c.notes[i]
    const roster = dollars(/the (\$[\d,]+) left on the whole roster/.exec(note)![1])
    // The figure the note compares with the roster: one it names, else the line just above it.
    const named = /^(?:The |That )?(\$[\d,]+)/.exec(note)?.[1]
    const above = i > 0 ? /^Plus (\$[\d,]+)/.exec(c.notes[i - 1])?.[1] : undefined
    const compared = named ?? above
    if (compared) assert.ok(dollars(compared) > roster, `"${i > 0 ? c.notes[i - 1] + " " : ""}${note}" reads as ${compared} being more than $${roster}`)
  })
})

describe("recoveryCopy: second pass on 439e6f4, sentences that still read wrong (test-guard, 24 Nov 2026)", () => {
  test("Tuesday night with admin outside the bands too: nothing left to cut, so no 'Plus $X from any team'", () => {
    // Chefs + KP $3,395 over, $600 of admin wages outside every band, every shift done, trading done.
    const c = copyOf(snap([team("chefsKp", 3395, 0), team("fohBarista", 0, 0), team("pastry", 0, 0)], { lockedDays: 6, outside: 600, rosterStillToRun: 0, revenueStillToCome: 0 }))
    assert.equal(c.headline, "Nothing left on the roster to cut, so Chefs + KP stays over its band this week.")
    for (const n of c.notes) assert.doesNotMatch(n, /^Plus \$|from any team/, `nothing is left to cut, yet: "${n}"`)
  })

  test("the out-of-reach note never says a cut is 'more than' a roster figure that reads the same", () => {
    for (const roster of [999.4, 999.5, 999.6, 999.99, 1000, 1000.4]) {
      const cases = [
        copyOf(snap([team("chefsKp", 0, 500)], { outside: 1000, rosterStillToRun: roster })),
        copyOf(snap([team("chefsKp", 1000, 500), team("fohBarista", -3000, 499)], { rosterStillToRun: roster })),
      ]
      for (const c of cases) {
        for (const n of c.notes) {
          const m = /^The (\$[\d,]+) cut is more than the (\$[\d,]+) left/.exec(n)
          if (m) assert.ok(dollars(m[1]) > dollars(m[2]), `roster $${roster}: "${n}"`)
        }
      }
    }
  })

  test("a team line never says 'not enough' when its dollars over and rostered read the same", () => {
    for (const [over, still] of [[1400.4, 1399.6], [1400.2, 1399.9], [963.4, 963.1]]) {
      const c = copyOf(snap([team("chefsKp", over, still), team("fohBarista", -3000, 2000)]))
      const m = /: (\$[\d,]+) over .* It still has (\$[\d,]+) rostered, not enough/.exec(c.teams[0])
      if (m) assert.ok(dollars(m[2]) < dollars(m[1]), c.teams[0])
    }
  })

  test("a team a few dollars over never shows a % that reads as its top, two places included", () => {
    for (const over of [1, 2, 3, 4, 4.5, 5, 10, 40]) {
      const c = copyOf(snap([team("chefsKp", over, 1400), team("fohBarista", -500, 2000)]))
      const shown = Number(/top \(([\d.]+)%\)/.exec(c.teams[0])![1])
      assert.ok(shown > 13.5, `$${over} over: ${c.teams[0]}`)
    }
    // Burleigh, 12% top on $80,000: $2 over is 12.0025%.
    const b = copyOf(snap([team("chefsKp", 2, 1200, "BURLEIGH", 80000), team("pastry", 0, 300, "BURLEIGH", 80000)], { venue: "BURLEIGH", revenue: 80000, outside: -1000 }))
    const shown = Number(/top \(([\d.]+)%\)/.exec(b.teams[0])![1])
    assert.ok(shown > 12, b.teams[0])
  })

  test("a team over with nothing left rostered: no cut promised that cannot bring that team inside its band", () => {
    // Chefs + KP $963 over with all of its shifts done; FOH has $2,400 still rostered.
    // Cutting FOH cannot bring Chefs + KP's % down, so the box must not promise it.
    const weekUnder = copyOf(snap([team("chefsKp", 963, 0), team("fohBarista", -2500, 2400)]))
    const weekOver = copyOf(snap([team("chefsKp", 963, 0), team("fohBarista", 0, 2400)], { outside: 300 }))
    for (const c of [weekUnder, weekOver]) {
      assert.doesNotMatch(c.headline, /every team inside its band/, `${c.headline} | ${c.teams.join(" | ")}`)
    }
    // With the week already under 39%, a cut from the others achieves nothing.
    for (const l of lines(weekUnder)) assert.doesNotMatch(l, /take it from the others/, `week already under: "${l}"`)
  })

  test("never '$0' in the week line, even when the finished days land within 50c of target", () => {
    for (const lockedOver of [0, 0.3, -0.2, 0.49, -0.49]) {
      const c = copyOf(snap([team("chefsKp", 963, 1400)], { lockedOver }))
      assert.doesNotMatch(c.week!, /\$0\b/, `finished days ${lockedOver} over: ${c.week}`)
    }
  })

  // Older wording carried over from the page on main: recorded, not blocking this push.
  test("the takings ask never reads '0.0% above' the forecast", () => {
    const c = copyOf(snap([team("chefsKp", 0, 9000)], { outside: 15, lockedDays: 0, revenueStillToCome: R }))
    assert.doesNotMatch(c.week!, /\(0\.0% above/, c.week!)
  })

  test("green on Tuesday night with every shift done does not say Tue can carry more wages", () => {
    const c = copyOf(snap([team("chefsKp", -500, 0), team("fohBarista", -1000, 0)], { lockedDays: 6, rosterStillToRun: 0, revenueStillToCome: 0 }))
    assert.doesNotMatch(c.headline, /can carry up to/, c.headline)
  })

  test("nothing left rostered but takings still to come: the headline does not call the week finished while the week line offers a way back", () => {
    const c = copyOf(snap([team("chefsKp", 0, 0)], { lockedDays: 6, outside: 400, rosterStillToRun: 0, revenueStillToCome: 3000 }))
    if (/finishes/.test(c.headline)) assert.doesNotMatch(c.week!, /Or take/, `${c.headline} | ${c.week}`)
  })
})

describe("recoveryCopy: third pass on 83107f2, sentences that still read wrong (test-guard, 24 Nov 2026)", () => {
  test(
    "Tuesday arvo: a team over by more than it still has rostered is not promised 'inside its band', and the others are not cut for it",
    () => {
      // Chefs + KP $963 over with only $400 of today's shifts left; FOH $1,445 under its top with $1,800 left.
      // Cutting FOH does not bring Chefs + KP's % down, so the most worth cutting is the $400 Chefs + KP has left,
      // which also covers the $55 the week is over in the second case.
      const buckets = () => [team("chefsKp", 963, 400), team("fohBarista", -1445, 1800), team("pastry", -400, 100)]
      const weekUnder = copyOf(snap(buckets(), { lockedDays: 6, revenueStillToCome: 4000 }))
      const weekOver = copyOf(snap(buckets(), { lockedDays: 6, outside: 937, revenueStillToCome: 4000 }))
      for (const c of [weekUnder, weekOver]) {
        assert.match(c.teams[0], /not enough to fix it with cuts alone/, "precondition: the team line says it cannot be fixed")
        assert.doesNotMatch(c.headline, /every team inside its band|Chefs \+ KP[^.]* inside/, `${c.headline} | ${c.teams[0]}`)
        const m = /^Cut (\$[\d,]+)/.exec(c.headline)
        if (m) assert.ok(dollars(m[1]) <= 400, `asks for more than Chefs + KP has left to cut: ${c.headline}`)
      }
    }
  )

  test(
    "Tuesday night, every shift and every sale done: the week line ends on a full stop, not a dangling ';'",
    () => {
      const c = copyOf(snap([team("chefsKp", 3395, 0), team("fohBarista", -400, 0), team("pastry", -69, 0)], { lockedDays: 6, rosterStillToRun: 0, revenueStillToCome: 0 }))
      assert.match(c.week!, /\.$/, c.week!)
    }
  )

  test(
    "shifts done but takings still to come: the headline reads as English, not 'the week is heading with a team over its band'",
    () => {
      const c = copyOf(snap([team("chefsKp", 3395, 0), team("fohBarista", -400, 0)], { lockedDays: 6, rosterStillToRun: 0, revenueStillToCome: 1500 }))
      assert.doesNotMatch(c.headline, /is heading with/, c.headline)
    }
  )
})

describe("recoveryCopy: capped team cuts add up (test-guard, 24 Nov 2026, on 3e22531)", () => {
  test("one team fixed in full beside one capped at its shifts left, week over: headline is both team cuts plus the 'Plus' line", () => {
    // Tuesday arvo. Chefs + KP $963 over with $400 left (capped), Pastry $60 over with $100 left (fixed),
    // $1,500 of admin outside the bands. Week gap $2,523 = $400 + $60 + $2,063. Roster $2,600, so in reach.
    const c = copyOf(snap([team("chefsKp", 963, 400), team("pastry", 60, 100), team("fohBarista", 0, 1800)], { lockedDays: 6, outside: 1500, revenueStillToCome: 4000 }))
    assert.equal(c.headline, "Cut $2,523 of wages, Tue, to get Pastry inside its band, Chefs + KP as close to its band as its shifts allow and the week on 39%.")
    assert.match(c.teams[0], /^Chefs \+ KP: \$963 over .* It still has \$400 rostered, not enough to fix it with cuts alone: cut all of it and it still finishes \$563 over\.$/)
    assert.match(c.teams[1], /^Pastry: \$60 over its 3% top \(3\.1%\)\. It still has \$100 rostered\.$/)
    assert.deepEqual(c.notes, ["Plus $2,063 from any team with shifts left to land the week on 39%."])
  })

  test("'Plus' is the week gap left after the capped team cut, not after the team's whole overspend", () => {
    // Chefs + KP $963 over with $700 left, $600 admin: gap $1,563, Chefs + KP gives its $700, so Plus is $863 (not $600).
    const c = copyOf(snap([team("chefsKp", 963, 700), team("fohBarista", 0, 400), team("pastry", 0, 100)], { outside: 600, rosterStillToRun: 1300 }))
    assert.ok(c.notes.includes("Plus $863 from any team with shifts left to land the week on 39%."), c.notes.join(" | "))
  })
})
