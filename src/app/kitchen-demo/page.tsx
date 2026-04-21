// Public demo of the iPad kitchen flow — renders the same KitchenRunView
// staff see, with static mock data so no auth or DB is required. Exists to
// let owners/managers preview the UX without handing out credentials.
// The real kitchen routes live at /kitchen and are behind auth.

import { KitchenRunView } from "@/components/kitchen-run-view"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import Link from "next/link"

export default function KitchenDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1100px] px-4 py-4">
        <DemoContent searchParams={searchParams} />
      </div>
    </div>
  )
}

async function DemoContent({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const screen = typeof sp.screen === "string" ? sp.screen : "home"

  if (screen === "venue") return <KitchenVenuePicker />

  if (screen === "run") {
    return (
      <>
        <DemoStripe />
        <KitchenRunView
          initial={{
            id: "demo-run",
            templateId: "demo-template",
            templateName: "Closing clean — kitchen",
            area: "Pastry section",
            venue: "BURLEIGH",
            runDate: new Date().toISOString().split("T")[0],
            shift: "CLOSE",
            status: "IN_PROGRESS",
            isFoodSafety: true,
            items: [
              {
                id: "i1",
                label: "Wipe down all benches with sanitiser",
                instructions:
                  "Use the green spray bottle. Let dwell 60 seconds before wiping.",
                requireTemp: false,
                requireNote: false,
                checkedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
                checkedBy: "CR",
                tempCelsius: null,
                note: null,
              },
              {
                id: "i2",
                label: "Walk-in fridge temperature check",
                instructions: "Acceptable range 0–4 °C. Note anything above 5.",
                requireTemp: true,
                requireNote: false,
                checkedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                checkedBy: "CR",
                tempCelsius: 2.8,
                note: null,
              },
              {
                id: "i3",
                label: "Empty bain-marie & wipe dry",
                instructions: null,
                requireTemp: false,
                requireNote: false,
                checkedAt: null,
                checkedBy: null,
                tempCelsius: null,
                note: null,
              },
              {
                id: "i4",
                label: "Stock butter & cream levels for tomorrow",
                instructions: "Target: 3 kg butter, 2 L cream in day fridge.",
                requireTemp: false,
                requireNote: true,
                checkedAt: null,
                checkedBy: null,
                tempCelsius: null,
                note: null,
              },
              {
                id: "i5",
                label: "Mop floors — front to back",
                instructions: null,
                requireTemp: false,
                requireNote: false,
                checkedAt: null,
                checkedBy: null,
                tempCelsius: null,
                note: null,
              },
              {
                id: "i6",
                label: "Turn off oven hoods and lock back door",
                instructions: null,
                requireTemp: false,
                requireNote: false,
                checkedAt: null,
                checkedBy: null,
                tempCelsius: null,
                note: null,
              },
            ],
            photos: [],
          }}
        />
      </>
    )
  }

  // Default: home (venue's checklist list)
  return (
    <>
      <DemoStripe />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Kitchen · Tarte Bakery
            </div>
            <h1 className="text-3xl font-bold">Today&apos;s checklists</h1>
          </div>
          <Link
            href="/kitchen-demo?screen=venue"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Change venue
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DemoChecklistCard
            title="Opening checklist — kitchen"
            area="Pastry section"
            shift="open"
            items={8}
            status="done"
            progress={100}
          />
          <DemoChecklistCard
            title="Fridge temp log"
            area="All cold storage"
            shift="open"
            items={4}
            status="in-progress"
            progress={50}
            href="/kitchen-demo?screen=run"
          />
          <DemoChecklistCard
            title="Closing clean — kitchen"
            area="Pastry section"
            shift="close"
            items={6}
            status="in-progress"
            progress={33}
            href="/kitchen-demo?screen=run"
          />
          <DemoChecklistCard
            title="Closing clean — front of house"
            area="FOH"
            shift="close"
            items={7}
            status="not-started"
            progress={0}
          />
        </div>
      </div>
    </>
  )
}

function DemoChecklistCard({
  title,
  area,
  shift,
  items,
  status,
  progress,
  href,
}: {
  title: string
  area: string
  shift: string
  items: number
  status: "done" | "in-progress" | "not-started"
  progress: number
  href?: string
}) {
  const bg =
    status === "done"
      ? "border-emerald-200 bg-emerald-50"
      : status === "in-progress"
        ? "border-amber-200 bg-amber-50"
        : "border-gray-200 bg-white"
  const inner = (
    <div className={`rounded-2xl border-2 p-5 transition active:scale-[0.99] ${bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{title}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {area} · {shift} · {items} items
          </div>
        </div>
        <div className="shrink-0 text-right">
          {status === "done" ? (
            <div className="text-sm font-medium text-emerald-700">✓ Done</div>
          ) : status === "in-progress" ? (
            <>
              <div className="text-3xl font-bold tabular-nums">
                {Math.round((progress / 100) * items)}/{items}
              </div>
              <div className="text-xs text-muted-foreground">{progress}%</div>
            </>
          ) : (
            <div className="text-3xl font-bold tabular-nums text-gray-300">—</div>
          )}
        </div>
      </div>
      {status === "in-progress" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-amber-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status === "done" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-emerald-500" style={{ width: `100%` }} />
        </div>
      )}
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

function DemoStripe() {
  return (
    <div className="mb-4 flex items-center justify-between rounded-md border-2 border-dashed border-indigo-300 bg-indigo-50 px-4 py-2 text-xs">
      <span>
        <strong>Demo</strong> — this is what staff see on the wall-mounted
        iPad. Real route is <code>/kitchen</code> and requires login.
      </span>
      <Link href="/kitchen-demo" className="font-medium text-indigo-700 hover:underline">
        Home
      </Link>
    </div>
  )
}
