# Tarte Kitchen off Deputy: the Tarte Shifts labour feed

Written 9 Oct 2026, ahead of the Deputy cancellation (Wed 21 Oct 2026).

## What Kitchen reads from shift-level labour

Kitchen keeps its own `LabourShift` table (one row per rostered shift, one
per timesheet). Readers, none of which know or care where the rows came
from:

- `/labour` dashboard and the dashboard ops widget (ROSTER rows, this + next week)
- `/labour/live` live wage % tracker (TIMESHEET + ROSTER rows, this week)
- `/kitchen/lineup` "Today" section (ROSTER rows for today)
- GM desk readings: open shifts, worked vs rostered hours, who to sit down
  with, roster horizon (published shifts for the next 3 weeks)
- Friday digest wage section: `src/lib/labour/recode.ts` rebuilds department
  splits from TIMESHEET rows of the finished week (needs 100+ rows)
- Sides challenge hours (`src/lib/actions/upsell.ts`, TIMESHEET rows)

Until Oct 2026 every row came from Deputy (`src/lib/deputy/client.ts`,
cron `/api/cron/sync-deputy` every 15 min). Since commit "Labour source
switch" the same cron goes through `src/lib/labour/sync.ts`, which picks the
source from `LABOUR_SOURCE`:

| LABOUR_SOURCE | behaviour |
| --- | --- |
| `deputy` (default) | exactly as before |
| `shifts` | pull `GET /api/internal/labour` from Tarte Shifts; if that fails (404 = not built, 5xx, timeout) and a Deputy connection still exists, sync Deputy instead and report `fellBackToDeputy: true`; with no Deputy connection either, leave the last rows as they are and return 500 |

The Deputy client is untouched. Nothing is deleted.

## NEEDS SHIFTS: the endpoint Kitchen calls

Tarte Shifts does not serve this yet (probed 9 Oct 2026: 404). Build it in
`tarte-shifts/src/app/api/internal/labour/route.ts`, same bearer check as the
other internal routes (`bearerOk(..., process.env.CRON_SECRET)`).

```
GET /api/internal/labour?from=YYYY-MM-DD&to=YYYY-MM-DD
Authorization: Bearer <CRON_SECRET>
```

`from` inclusive, `to` exclusive, AEST calendar dates. Kitchen asks for
last Wednesday to this Wednesday + 4 weeks (about 5 weeks). Response:

```jsonc
{
  "ok": true,
  "from": "2026-09-30",
  "to": "2026-11-04",

  // Shift rows with date in [from, to): every venue, published or not,
  // open shifts included, SALARY staff included (cost 0).
  "shifts": [{
    "id": "cuid",                  // Shift.id
    "venue": "BURLEIGH",           // BURLEIGH | BEACH_HOUSE | TEA_GARDEN
    "area": "Kitchen",             // Area.name (same names Deputy used)
    "employeeId": "cuid" | null,   // null = open shift
    "employeeName": "First Last" | null,
    "start": "2026-10-06T20:00:00.000Z",  // ISO instant of date + startMin AEST
    "end":   "2026-10-07T04:30:00.000Z",
    "breakMin": 30,
    "hours": 8,                    // shiftHours(): paid hours, break removed
    "cost": 264,                   // shiftGross() with openShiftRate forced to 0:
                                   // gross ex super, day-type rate applied,
                                   // 0 for SALARY staff and for open shifts
    "isOpen": false,
    "published": true
  }],

  // Timesheet rows with clockIn in [from, to): every venue, approved or
  // not, still clocked on included (clockOut null).
  "timesheets": [{
    "id": "cuid",
    "venue": "BURLEIGH",
    "area": "FOH",                 // Timesheet.area, else shift.area, else employee default area
    "employeeId": "cuid",
    "employeeName": "First Last",
    "clockIn": "2026-10-06T20:02:00.000Z",
    "clockOut": "2026-10-07T04:00:00.000Z" | null,
    "breakMin": 30,
    "hours": 7.47,                 // timesheetHours() (live when clockOut null)
    "cost": 240.3,                 // timesheetGross(): gross ex super, 0 for SALARY
    "approved": true
  }],

  // Weekly salary roll-up, NO names. Active, not sandbox, employmentType
  // SALARY, includeInWagePct true. Grouped by the employee's venue and the
  // bucket of their default area (Area.bucket; OTHER when no default area).
  "salaries": [
    { "venue": "BURLEIGH", "bucket": "CHEFS_KP", "weeklyGross": 4196.34, "headcount": 3 }
  ],

  // Optional. What getRosterWeek shows as the week's forecast (ex GST):
  // the manager's SalesForecast row, else last year's same week.
  "forecasts": [
    { "venue": "BURLEIGH", "weekStartWed": "2026-10-07", "amount": 111500, "source": "manager" }
  ]
}
```

Kitchen is tolerant: `salaries` and `forecasts` may be omitted at first,
rows with an unknown venue or unparseable dates are skipped and counted,
negative costs are stored as 0. Please do send salaries from day one, or the
`/labour` and `/labour/live` wage totals drop by the salaried payroll
(Deputy carried it as "Salary X" placeholder cards; Kitchen writes your
roll-up back under those same card names, see `SALARY_PLACEHOLDER_AREA` in
`src/lib/shifts/labour.ts`).

Reference implementation hints (all in tarte-shifts already):
`shiftHours`, `shiftGross`, `timesheetHours`, `timesheetGross`,
`toWageSettings` in `src/lib/wages.ts`; public holidays from
`PublicHoliday`; the `lastYearWeekSales` fallback used by `getRosterWeek`.

## Cutover runbook (Kitchen side, after the endpoint exists)

1. Confirm the feed answers: from the Kitchen droplet,
   `curl -H "Authorization: Bearer $SHIFTS_SECRET" "$SHIFTS_BASE/api/internal/labour?from=2026-10-14&to=2026-10-21"`
   should return `ok: true` with a few hundred shifts.
2. Do NOT flip while Shifts timesheets are still sparse (kiosks went live
   7 to 9 Oct 2026). The digest recode needs 100+ timesheet rows for the
   finished week or it falls back to Louise's splits. Flip the week after
   the first full kiosk week has been approved (plan: 21 Oct 2026).
3. On the droplet: add `LABOUR_SOURCE=shifts` to `/root/tarte-kitchen/.env`,
   then `cd /root/tarte-kitchen && docker compose up -d app` (no cron
   recreate needed, the crontab line is unchanged).
4. Check `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-deputy`
   returns `"source":"shifts"` without `fellBackToDeputy`. The next
   `/labour` load shows "pulled from Tarte Shifts" and "Last sync" moves.
5. The Friday digest `?labour=1` debug (`/api/cron/weekly-digest?labour=1`)
   for the first Shifts-fed week should still show `recoded: true` per venue.
6. Deputy can then be disconnected in Settings (or just cancelled); with
   `LABOUR_SOURCE=shifts` nothing reads it. Leave the DeputyConnection row
   while useful: `/labour` still takes super and on-cost rates from it
   (defaults 12% and 0% if it goes).

## Pay runs (already off Deputy)

`/api/cron/sync-labour` (daily) never read Deputy. It reads posted Xero pay
runs through Tarte Shifts' `/api/internal/payruns`, and since 9 Oct 2026 for
both orgs (`SHIFTS_PAYRUNS_ORGS`, default "Tarte Bakery,Tarte Currumbin"),
summing same-week runs into `WeeklyLabourCost`. Burleigh's pay runs were
missing from that table before.
