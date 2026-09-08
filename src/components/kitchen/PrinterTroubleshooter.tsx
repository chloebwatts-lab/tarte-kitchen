"use client"

import Link from "next/link"
import { useCallback, useMemo, useState, useSyncExternalStore } from "react"
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Plug,
  Printer,
  RotateCcw,
  Router,
  Tablet,
  Wrench,
} from "lucide-react"
import { KitchenTick } from "@/components/kitchen/KitchenTick"

// Content source: Chloe's "Procedure for printers" (Epson docket printers),
// added 2026-09-08. Order matters: each stage rules out one cause before
// the next, so a staff member who isn't the usual fixer can work through
// it top to bottom. Keep the wording plain.

type Step = {
  id: string
  title: string
  detail?: string
  /** Shown as a boxed "if this, then that" under the step. */
  branch?: string
}

type Stage = {
  key: string
  title: string
  question: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  steps: Step[]
  /** What tells you this stage is not the problem, so move on. */
  moveOn: string
}

const STAGES: Stage[] = [
  {
    key: "power",
    title: "Power",
    question: "Is the printer getting power?",
    icon: Plug,
    steps: [
      {
        id: "plugs",
        title: "Check everything is plugged in.",
        detail:
          "Three places: the switch on the wall, the socket at the back of the printer, and the power connection half way down the cord.",
      },
      {
        id: "lights",
        title: "Are there any lights on the printer?",
        detail:
          "If it is completely dark, plug the printer into a different power point. That tells you whether it is the printer or the power source.",
      },
      {
        id: "cord",
        title: "Power point works but the printer is still dead? Swap the black power cord.",
        detail: "Water damage on the cord happens. Try a spare cord before anything else.",
      },
    ],
    moveOn: "Lights on the printer? Power is fine. Go to Internet.",
  },
  {
    key: "internet",
    title: "Internet",
    question: "Is the NBN and the network up?",
    icon: Router,
    steps: [
      {
        id: "nbn",
        title: "Check the NBN router has lights.",
        detail:
          "Burleigh: it is in the blue power box outside the main kitchen, as you come out from the blue door. Currumbin: find the router for that building and check it the same way.",
      },
      {
        id: "switchboard",
        title: "No router lights? Check the internal switchboard in the kitchen.",
        detail: "Is a switch down? Flip it back up.",
        branch:
          "Switch will not stay up: plug the printer in at a different station, for example under the till, and hand the dockets over by hand. The switch often works again in a few hours.",
      },
      {
        id: "ethernet",
        title: "NBN is on, every other printer and iPad is fine, this printer is still offline? Swap the blue ethernet cable.",
      },
    ],
    moveOn: "Router lit, other printers and iPads working? The network is fine. Go to IP address.",
  },
  {
    key: "ip",
    title: "IP address",
    question: "Is Lightspeed talking to the right address?",
    icon: Printer,
    steps: [
      {
        id: "reset-print",
        title: "Print the printer's own status page.",
        detail:
          "At the back of the printer there is a small reset button. Push it in with a pin. It prints a page that includes the IP address.",
      },
      {
        id: "lightspeed-ip",
        title: "Check the IP address in Lightspeed matches the printout.",
        detail:
          "Lightspeed, then Printing, then find this printer (Main kitchen, Market and so on). The IP must match the printout exactly, with no spaces.",
      },
    ],
    moveOn: "IP address matches? Go to iPads.",
  },
  {
    key: "ipads",
    title: "iPads",
    question: "Does the Lightspeed app need a repair?",
    icon: Tablet,
    steps: [
      {
        id: "close-app",
        title: "Close Lightspeed completely on the iPad.",
      },
      {
        id: "repair",
        title: "Open the iPad Settings app, search for \"restaurant\", tap \"Repair on next launch\".",
      },
      {
        id: "relaunch",
        title: "Reopen Lightspeed and log back in with the details below.",
      },
      {
        id: "all-ipads",
        title: "Repeat on every iPad, not just the one you are holding.",
      },
    ],
    moveOn: "Dockets printing again? Done. Still nothing? Go to Replace.",
  },
  {
    key: "replace",
    title: "Replace",
    question: "Power good, NBN good, printer still down?",
    icon: Wrench,
    steps: [
      {
        id: "swap-printer",
        title: "Swap in a replacement printer and plug everything in.",
      },
      {
        id: "new-ip",
        title: "Push the reset button at the back with a pin to print the new IP address.",
      },
      {
        id: "enter-ip",
        title: "Enter the new IP in Lightspeed.",
        detail:
          "Lightspeed, then Printing, then the correct printer for where it lives (Main kitchen, Market and so on). No spaces.",
      },
    ],
    moveOn: "Test print from an iPad. Then tell a manager the old printer is out so it gets replaced properly.",
  },
]

const LOGIN = {
  username: "Georgiafarquhar@gmail.com",
  password: "0400Jessie123!",
}

const ALL_STEP_IDS = STAGES.flatMap((s) => s.steps.map((st) => st.id))
// Steps are numbered straight through all stages, so "go to 9" means one thing.
const STEP_NUMBER: Record<string, number> = Object.fromEntries(
  ALL_STEP_IDS.map((id, i) => [id, i + 1])
)

// Ticks are per device and time out on their own, so the next outage on
// the same iPad starts with a clean sheet instead of last week's ticks.
const STORAGE_KEY = "tk-printer-checklist"
const EXPIRY_MS = 12 * 60 * 60 * 1000

type Saved = { at: number; done: string[] }

// Same shape as use-remembered-name: the raw localStorage string is the
// external store, so the server snapshot is empty and the ticks fill in
// after hydration without a mismatch.
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

function parseSaved(raw: string): Set<string> {
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as Saved
    if (!parsed?.at || Date.now() - parsed.at > EXPIRY_MS) return new Set()
    return new Set(parsed.done.filter((id) => ALL_STEP_IDS.includes(id)))
  } catch {
    return new Set()
  }
}

function persist(done: Set<string>) {
  try {
    if (done.size === 0) window.localStorage.removeItem(STORAGE_KEY)
    else {
      const payload: Saved = { at: Date.now(), done: [...done] }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    }
  } catch {
    // Private mode or storage blocked: ticks just don't survive a reload.
  }
  for (const cb of [...listeners]) cb()
}

function useTicks(): [Set<string>, boolean, (next: Set<string>) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null)
  const done = useMemo(() => parseSaved(raw ?? ""), [raw])
  const hydrated = raw !== null
  return [done, hydrated, persist]
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked: staff can still read and type it.
    }
  }, [value])
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--tk-line)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--tk-ink-soft)] transition active:scale-95"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

export function PrinterTroubleshooter() {
  const [done, hydrated, save] = useTicks()
  // Password is hidden until tapped, and hides again whenever the page is
  // reloaded, so it is not sitting on screen on a shared iPad all day.
  const [showPassword, setShowPassword] = useState(false)

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(done)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      save(next)
    },
    [done, save]
  )

  const reset = useCallback(() => save(new Set()), [save])

  const doneCount = useMemo(
    () => ALL_STEP_IDS.filter((id) => done.has(id)).length,
    [done]
  )

  // The first stage with an unticked step is where the person is up to.
  const currentStageKey = useMemo(() => {
    for (const stage of STAGES) {
      if (stage.steps.some((s) => !done.has(s.id))) return stage.key
    }
    return null
  }, [done])

  return (
    <div className="space-y-5">
      {/* Progress + reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--tk-line)] bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="tk-display text-[22px] font-bold leading-none tabular-nums text-[var(--tk-charcoal)]">
            {hydrated ? doneCount : 0}/{ALL_STEP_IDS.length}
          </div>
          <div className="text-[13px] leading-tight text-[var(--tk-ink-soft)]">
            steps ticked
            <br />
            <span className="text-[var(--tk-ink-mute)]">clears itself after 12 hours</span>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={doneCount === 0}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--tk-line)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--tk-ink-soft)] transition active:scale-95 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start again
        </button>
      </div>

      {STAGES.map((stage, stageIdx) => {
        const isCurrent = hydrated && stage.key === currentStageKey
        const stageDone = stage.steps.every((s) => done.has(s.id))
        const Icon = stage.icon
        return (
          <section
            key={stage.key}
            id={stage.key}
            className="overflow-hidden rounded-[20px] border-[1.5px] bg-white"
            style={{
              borderColor: isCurrent
                ? "var(--tk-sage)"
                : stageDone
                  ? "var(--tk-done-soft)"
                  : "var(--tk-line)",
            }}
          >
            <div
              className="flex items-center gap-3.5 px-4 py-4 sm:px-6"
              style={{
                background: stageDone
                  ? "var(--tk-done-soft)"
                  : isCurrent
                    ? "var(--tk-sage-soft)"
                    : "var(--tk-bg)",
              }}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
                style={{
                  background: stageDone ? "var(--tk-done)" : "white",
                  color: stageDone ? "white" : "var(--tk-charcoal)",
                }}
              >
                {stageDone ? (
                  <Check className="h-6 w-6" strokeWidth={2.6} />
                ) : (
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
                  Stage {stageIdx + 1} of {STAGES.length}
                </div>
                <div
                  className="tk-display text-[22px] leading-tight text-[var(--tk-charcoal)] sm:text-[26px]"
                  style={{ fontWeight: 700, letterSpacing: "-0.02em" }}
                >
                  {stage.title}
                </div>
                <div className="text-[14px] text-[var(--tk-ink-soft)]">{stage.question}</div>
              </div>
            </div>

            <ol className="divide-y divide-[var(--tk-line)]">
              {stage.steps.map((step) => {
                const n = STEP_NUMBER[step.id]
                const isDone = done.has(step.id)
                return (
                  <li key={step.id} className="flex gap-3.5 px-4 py-4 sm:gap-5 sm:px-6">
                    <KitchenTick done={isDone} onClick={() => toggle(step.id)} />
                    <button
                      type="button"
                      onClick={() => toggle(step.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div
                        className="text-[17px] font-semibold leading-snug sm:text-[18px]"
                        style={{
                          color: isDone ? "var(--tk-ink-mute)" : "var(--tk-charcoal)",
                          textDecoration: isDone ? "line-through" : "none",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        <span className="mr-2 tabular-nums text-[var(--tk-ink-mute)]">{n}.</span>
                        {step.title}
                      </div>
                      {step.detail && (
                        <div className="mt-1 text-[15px] leading-snug text-[var(--tk-ink-soft)]">
                          {step.detail}
                        </div>
                      )}
                      {step.branch && (
                        <div
                          className="mt-2.5 rounded-[12px] px-3.5 py-2.5 text-[14px] leading-snug"
                          style={{ background: "var(--tk-gold-soft)", color: "#5c4a12" }}
                        >
                          {step.branch}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>

            {stage.key === "ipads" && (
              <div className="border-t border-[var(--tk-line)] px-4 py-4 sm:px-6">
                <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
                  Lightspeed login for the iPads
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tk-ink-mute)]">
                        Username
                      </div>
                      <div className="truncate font-mono text-[13px] text-[var(--tk-charcoal)] sm:text-[14px]">
                        {LOGIN.username}
                      </div>
                    </div>
                    <CopyButton value={LOGIN.username} label="username" />
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tk-ink-mute)]">
                        Password
                      </div>
                      <div className="truncate font-mono text-[13px] text-[var(--tk-charcoal)] sm:text-[14px]">
                        {showPassword ? LOGIN.password : "\u2022".repeat(LOGIN.password.length)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-pressed={showPassword}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tk-line)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--tk-ink-soft)] transition active:scale-95"
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {showPassword ? "Hide" : "Show"}
                      </button>
                      <CopyButton value={LOGIN.password} label="password" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              className="flex items-start gap-2.5 border-t border-[var(--tk-line)] px-4 py-3.5 text-[14px] leading-snug sm:px-6"
              style={{ color: "var(--tk-done)" }}
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
              <span className="font-semibold">{stage.moveOn}</span>
            </div>
          </section>
        )
      })}

      <div className="rounded-[16px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-4 text-[14px] leading-snug text-[var(--tk-ink-soft)]">
        Worked through all five stages and it is still down? Log it under{" "}
        <Link href="/kitchen/fix" className="font-semibold underline">
          Something broken?
        </Link>{" "}
        so a manager sees it, and keep the printer plugged in under the till with dockets
        handed over by hand until it is sorted.
      </div>
    </div>
  )
}
