import { cn } from "@/lib/utils"

const STEPS = ["1. Venue", "2. Category", "3. Section", "4. Checklist"] as const

export function KitchenStepper({
  currentStep,
}: {
  currentStep: 1 | 2 | 3 | 4
}) {
  return (
    <div
      className="flex items-center gap-2.5 tk-caps"
      style={{ color: "var(--tk-ink-mute)", letterSpacing: "0.08em" }}
    >
      {STEPS.map((label, i) => {
        const active = i + 1 === currentStep
        return (
          <span key={label} className="flex items-center gap-2.5">
            <span
              className={cn(active && "")}
              style={{ color: active ? "var(--tk-charcoal)" : undefined }}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span>·</span>}
          </span>
        )
      })}
    </div>
  )
}
