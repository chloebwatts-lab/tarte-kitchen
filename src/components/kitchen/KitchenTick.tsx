import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export function KitchenTick({
  done,
  onClick,
  className,
  size = 46,
}: {
  done: boolean
  onClick?: () => void
  className?: string
  size?: number
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[14px] border-[1.5px] transition active:scale-90",
        done
          ? "bg-[var(--tk-done)] border-[var(--tk-done)] text-white"
          : "bg-white border-[var(--tk-line)] text-transparent",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Check className="h-6 w-6" strokeWidth={2.8} />
    </button>
  )
}
