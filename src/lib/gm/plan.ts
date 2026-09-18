/**
 * The GM desk plan: what Oliver owns, and which GM day it belongs to.
 *
 * Deliberately NOT on this list, because someone or something else does it:
 *   - Timesheet approval, Deputy salary cards and pay rates: Shawna.
 *   - Wage %, COGS %, supplier price rises, review reply drafts: worked out
 *     automatically and shown to him here as readings, never as chores.
 *   - Loading prices in the till: Shawna.
 *   - Pricing decisions, supplier contracts, subscriptions: Chloe.
 *
 * Anything the app can see for itself carries an `auto` key and ticks
 * itself. A manual mark always wins over the auto reading.
 */

export type GmTheme = "everyday" | "rosters" | "kitchen" | "people"
export type GmPillar = "efficient" | "profitable" | "happier"

export type GmAutoKey =
  | "roster-horizon"
  | "open-shifts"
  | "hours-vs-roster"
  | "checklists"
  | "wastage"
  | "one-on-ones"
  | "weekly-report"

export interface GmItem {
  slug: string
  theme: GmTheme
  pillar: GmPillar
  title: string
  /** One line, how to do it or what good looks like. */
  hint: string
  auto?: GmAutoKey
  /** A "done" needs a line of text (what was found, what changed). */
  noteOnDone?: string
  /** Optional counters captured with the tick. */
  counts?: { num1: string; num2: string }
  /** Staff tool that does the job, if there is one. */
  href?: string
}

export const MISSION =
  "Make the business more efficient. Make the business more profitable. Make the staff happier."

export const THEME_LABEL: Record<GmTheme, string> = {
  everyday: "Every GM day",
  rosters: "Rosters and wages",
  kitchen: "Kitchen and money",
  people: "People and quality",
}

export const THEME_BLURB: Record<Exclude<GmTheme, "everyday">, string> = {
  rosters: "Two weeks live, inside band, no holes. Then the Monday report.",
  kitchen: "Labels, prep, portions, orders, waste.",
  people: "One-on-ones, new starters, reviews, one fix.",
}

export const GM_ITEMS: GmItem[] = [
  // ── Every GM day ────────────────────────────────────────────
  {
    slug: "floor-walks",
    theme: "everyday",
    pillar: "efficient",
    title: "Three walks: open, mid-morning, close",
    hint: "Watch, fix, note. Coffee under 5 minutes, cabinet full to 1pm, tables reset. Do not jump on a section.",
  },

  // ── Rosters and wages ───────────────────────────────────────
  {
    slug: "roster-2wk",
    theme: "rosters",
    pillar: "efficient",
    title: "Roster live two full weeks ahead",
    hint: "Publish on Monday, before your two days off. The app checks Deputy for you.",
    auto: "roster-horizon",
  },
  {
    slug: "roster-in-band",
    theme: "rosters",
    pillar: "profitable",
    title: "Both weeks rostered inside band before publishing",
    hint: "Chefs + KP 11.5 to 12%. FOH + Barista 20.5 to 21%. Pastry 4.75 to 5.25%. Fix it on the roster, not after payroll.",
  },
  {
    slug: "open-shifts",
    theme: "rosters",
    pillar: "efficient",
    title: "No open shifts in the next 7 days",
    hint: "Every hole has a name on it. Sick calls are filled from the roster, not by you.",
    auto: "open-shifts",
  },
  {
    slug: "kitchen-rosters",
    theme: "rosters",
    pillar: "efficient",
    title: "Kitchen and pastry rosters checked with their heads",
    hint: "Prep is covered. No solo days that force overtime.",
  },
  {
    slug: "hours-vs-roster",
    theme: "rosters",
    pillar: "profitable",
    title: "Last week's worked hours within 3% of rostered",
    hint: "Overtime creep is where the wage % goes. If it is over, name where.",
    auto: "hours-vs-roster",
  },
  {
    slug: "gm-days-blocked",
    theme: "rosters",
    pillar: "efficient",
    title: "My three GM days are in Deputy for the next two weeks",
    hint: "As GM shifts, so nobody books you into service.",
  },

  // ── Kitchen and money ───────────────────────────────────────
  {
    slug: "label-walk",
    theme: "kitchen",
    pillar: "efficient",
    title: "Unannounced coolroom and fridge walk",
    hint: "Everything labelled with item, date and name. Count what is wrong.",
    counts: { num1: "Out of date", num2: "Unlabelled" },
  },
  {
    slug: "checklists",
    theme: "kitchen",
    pillar: "efficient",
    title: "Daily checklists and temp logs done",
    hint: "The app counts these. If a day is missing, find out who and why.",
    auto: "checklists",
    href: "/kitchen",
  },
  {
    slug: "prep-soldout",
    theme: "kitchen",
    pillar: "efficient",
    title: "Prep run from the restock counts, nothing sold out before 1pm",
    hint: "If something ran out, the reason is written down.",
    href: "/kitchen/restock",
  },
  {
    slug: "wastage",
    theme: "kitchen",
    pillar: "profitable",
    title: "Wastage logged every day, week under $400",
    hint: "The app adds it up. A blank day means nobody logged, not that nothing was binned.",
    auto: "wastage",
    href: "/log",
  },
  {
    slug: "portion-checks",
    theme: "kitchen",
    pillar: "profitable",
    title: "Five random portion weigh checks",
    hint: "Against the portion guide. A miss is named to the chef the same day.",
    href: "/kitchen/portions",
  },
  {
    slug: "orders-par",
    theme: "kitchen",
    pillar: "profitable",
    title: "Orders approved by dept heads against pars",
    hint: "One order per supplier. Supermarket top-ups under $200 for the week.",
    href: "/kitchen/order",
  },

  // ── People and quality ──────────────────────────────────────
  {
    slug: "one-on-ones",
    theme: "people",
    pillar: "happier",
    title: "Four 10-minute one-on-ones",
    hint: "The app picks who is most overdue. Tap a name when it is done. Four a week gets round the whole team about once a quarter.",
    auto: "one-on-ones",
  },
  {
    slug: "new-starters",
    theme: "people",
    pillar: "happier",
    title: "Every new starter has a booklet, a buddy and a week-one check-in",
    hint: "No new starters this week still counts as done.",
    href: "/kitchen/training",
  },
  {
    slug: "issues-closed",
    theme: "people",
    pillar: "happier",
    title: "Staff issues raised this week are closed this week",
    hint: "Only pay, contracts and warnings go to Chloe.",
  },
  {
    slug: "reviews-read",
    theme: "people",
    pillar: "efficient",
    title: "Read this week's Google reviews",
    hint: "Replies are drafted for Chloe. Your job is the fix on the floor.",
  },
  {
    slug: "quality-fix",
    theme: "people",
    pillar: "efficient",
    title: "One quality problem found and fixed",
    hint: "Write what it was and what changed.",
    noteOnDone: "What was it, and what changed?",
  },
  {
    slug: "weekly-report",
    theme: "rosters",
    pillar: "efficient",
    title: "Monday report sent to Chloe by 3pm",
    hint: "Last job before your two days off. The app writes the numbers. You add two lines and press send.",
    auto: "weekly-report",
  },
]

export const ONE_ON_ONE_TARGET = 4
export const WASTAGE_WEEKLY_CAP = 400
export const COGS_TARGET_PCT = 26

// ── Must-achieve tasks, to 31 Dec 2026 ────────────────────────
export interface GmTaskSeed {
  slug: string
  title: string
  doneMeans: string
  dueOn: string // YYYY-MM-DD
  sortOrder: number
}

export const GM_TASK_SEEDS: GmTaskSeed[] = [
  {
    slug: "rosters-live",
    title: "Two weeks of rosters live, inside band, GM days blocked",
    doneMeans: "Weeks starting 23 Sep and 30 Sep published. Every dept in band on the forecast. Zero open shifts.",
    dueOn: "2026-09-21",
    sortOrder: 1,
  },
  {
    slug: "oct-1-briefing",
    title: "Staff briefed on the 1 October changes",
    doneMeans: "Card surcharge ends 1 Oct. Every FOH person can explain it and the Sunday surcharge to a guest. Menus and signage match the till. Shawna loads the prices, you run the floor.",
    dueOn: "2026-09-28",
    sortOrder: 2,
  },
  {
    slug: "square-floor",
    title: "Square live on the Burleigh floor",
    doneMeans: "Every terminal working. Every shift lead can take a payment, do a refund and run end of day without calling anyone.",
    dueOn: "2026-10-16",
    sortOrder: 3,
  },
  {
    slug: "label-system",
    title: "Labelling and dating system that runs without you",
    doneMeans: "Every fridge and coolroom shelf labelled. Day dots and label stock never run out. Two walks in a row with zero out-of-date items.",
    dueOn: "2026-10-30",
    sortOrder: 4,
  },
  {
    slug: "roster-templates",
    title: "Roster templates that land inside band",
    doneMeans: "A saved Deputy template per day type (weekday, Saturday, Sunday, public holiday) for each dept. Copying one gives a week already in band.",
    dueOn: "2026-10-30",
    sortOrder: 5,
  },
  {
    slug: "training-signed",
    title: "Every Burleigh staff member on a signed-off training booklet",
    doneMeans: "Each person has the booklet for their dept. Sign-offs are in the app. Reset Cards are up in each section.",
    dueOn: "2026-11-13",
    sortOrder: 6,
  },
  {
    slug: "par-forms",
    title: "Par-level order forms in use",
    doneMeans: "Four straight weeks ordered from the par forms for Bidfood, Fermex, Eustralis and produce. Supermarket top-ups under $200 a week for the month.",
    dueOn: "2026-11-27",
    sortOrder: 7,
  },
  {
    slug: "four-clean-weeks",
    title: "Four straight weeks: COGS at or under 26%, every dept in band",
    doneMeans: "Exactly that, off the numbers on this page. No adjustments.",
    dueOn: "2026-11-27",
    sortOrder: 8,
  },
  {
    slug: "holiday-rosters",
    title: "Christmas and school holiday rosters published",
    doneMeans: "9 Dec to 19 Jan live by 30 Nov, staffed for 1.35 times a normal week. Public holidays covered. Leave requests closed.",
    dueOn: "2026-11-30",
    sortOrder: 9,
  },
  {
    slug: "quarter-review",
    title: "First quarter review with Chloe",
    doneMeans: "Three monthly sheets side by side. Three biggest wins, three things still broken, 2027 targets agreed.",
    dueOn: "2026-12-14",
    sortOrder: 10,
  },
]

// ── Monthly numbers only a person knows ───────────────────────
export const GM_MONTHLY_MANUAL: { slug: string; label: string; target: string }[] = [
  { slug: "pulse", label: "Staff pulse, anonymous 1 to 5", target: "4.0 or better" },
  { slug: "leavers", label: "Leavers (not end of visa or study)", target: "1 or fewer" },
  { slug: "sick-calls", label: "Sick calls this month", target: "3% of shifts or under" },
]

// ── GM days ───────────────────────────────────────────────────
/** ISO weekday (1 = Mon) to theme. Thu people, Fri kitchen, Mon rosters + report. Editable on the page. */
export type GmDays = Partial<Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", Exclude<GmTheme, "everyday">>>
export const DEFAULT_GM_DAYS: GmDays = { "4": "people", "5": "kitchen", "1": "rosters" }
