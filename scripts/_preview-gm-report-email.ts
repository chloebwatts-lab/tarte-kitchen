// Renders the GM weekly report email with sample data, to look at the layout.
// Run: npx tsx scripts/_preview-gm-report-email.ts > /tmp/gm-report.html
import { renderGmReportHtml, renderMorningNudgeHtml } from "../src/lib/gm/report-email"
import type { BoardItem } from "../src/lib/gm/board"

const item = (slug: string, title: string, state: BoardItem["state"], extra: Partial<BoardItem> = {}): BoardItem =>
  ({ slug, title, theme: "everyday", pillar: "efficient", hint: "", state, note: null, num1: null, num2: null, auto_: null, manual: false, ...extra }) as BoardItem

const items: BoardItem[] = [
  item("morning-look", "Morning look: the place is right before the first guest", "couldnt", { note: "Electrics and grill. Set up not done, by time done, I had to welcome the trials.\n\nI have ensured the outside area is clean, and the plants are out." }),
  item("roster-2wk", "Roster live two full weeks ahead", "couldnt", { note: "A bit of a scattered start this morning. 3 trials, and a lot of challenges in my roster didn't quite give me time.", auto_: { met: false, detail: "Wed 23 Sep: live. Wed 30 Sep: draft, not published. Next to publish: week of Wed 30 Sep." } }),
  item("quality-fix", "One quality problem found and fixed", "open"),
  item("wastage", "Wastage logged every day", "auto-ok", { auto_: { met: true, detail: "$207 so far against $400. Nothing logged Wed 16 Sep, Sun 20 Sep." } }),
  item("open-shifts", "No open shifts inside 48 hours", "auto-ok", { auto_: { met: true, detail: "None open." } }),
  item("label-walk", "Label walk", "done", { manual: true, num1: 2, num2: 0 }),
  ...Array.from({ length: 13 }, (_, i) => item(`done-${i}`, ["Walk the floor at 10", "Check the cabinet at 1:30", "Coffee check", "Prep list signed off", "Orders in by 2pm", "Portions checked", "Cool room temps", "Cash up reviewed", "Board jobs cleared", "New starter shadowed", "Reviews answered", "Wages inside band", "Hours vs roster checked"][i], "done")),
  item("weekly-report", "Monday report to Chloe", "open"),
]

const numbers = {
  wages: {
    weekLabel: "Wed 9 Sep to Tue 15 Sep",
    tiles: [
      { label: "Venue, ex admin", value: "37.0%" },
      { label: "Chefs + KP", value: "11.6%" },
      { label: "FOH + Barista", value: "20.6%" },
      { label: "Pastry", value: "4.8%" },
    ],
  },
  cogs: { weekLabel: "Wed 9 Sep to Tue 15 Sep", tiles: [{ label: "COGS", value: "24.0%" }] },
} as never

const which = process.argv[2] ?? "report"
if (which === "nudge") {
  process.stdout.write(
    renderMorningNudgeHtml({
      theme: "rosters",
      todays: [
        { title: "Morning look: the place is right before the first guest" },
        { title: "Roster live two full weeks ahead", detail: "Wed 30 Sep: draft, not published." },
        { title: "Wages inside band" },
      ],
      carried: [{ title: "One quality problem found and fixed" }],
      next: { title: "Probation review for Georgia", dueLabel: "Fri 25 Sep", daysLeft: 3 },
    })
  )
} else {
  process.stdout.write(
    renderGmReportHtml({
      weekLabel: "Wed 16 Sep to Tue 22 Sep",
      items,
      numbers,
      talks: ["Georgia", "Jessica"],
      sick: ["Vini (Thu 17 Sep)"],
      fixed: "The grill igniter. Electrician came Thursday, works first time now.",
      need: "A second trial shift for the barista candidate before Friday.",
      sent: which !== "wrap",
    })
  )
}
