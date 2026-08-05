function PulseBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-sage-soft ${className ?? ""}`}
    />
  )
}

/**
 * Generic branded skeleton for any (app) page while its server data loads.
 * Card shapes match the flat-card system (rounded-2xl, 1.5px border).
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      {/* Page heading */}
      <div className="space-y-2">
        <PulseBlock className="h-7 w-48" />
        <PulseBlock className="h-4 w-72" />
      </div>

      {/* Stat tile row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border-[1.5px] border-border bg-card p-5"
          >
            <PulseBlock className="h-3.5 w-24" />
            <PulseBlock className="mt-3 h-7 w-32" />
          </div>
        ))}
      </div>

      {/* Card blocks */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border-[1.5px] border-border bg-card p-6"
        >
          <PulseBlock className="h-4 w-40" />
          <div className="mt-4 space-y-3">
            <PulseBlock className="h-4 w-full" />
            <PulseBlock className="h-4 w-5/6" />
            <PulseBlock className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
