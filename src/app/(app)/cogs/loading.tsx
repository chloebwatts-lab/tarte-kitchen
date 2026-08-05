function PulseBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-sage-soft ${className ?? ""}`}
    />
  )
}

export default function CogsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading COGS">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <PulseBlock className="h-7 w-28" />
          <PulseBlock className="h-4 w-80" />
        </div>
        <PulseBlock className="h-9 w-36" />
      </div>

      {/* Stat tile row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border-[1.5px] border-border bg-card p-5"
          >
            <PulseBlock className="h-3.5 w-24" />
            <PulseBlock className="mt-3 h-7 w-28" />
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div className="rounded-2xl border-[1.5px] border-border bg-card p-6">
        <PulseBlock className="h-4 w-48" />
        <PulseBlock className="mt-4 h-64 w-full" />
      </div>

      {/* Weekly table card */}
      <div className="rounded-2xl border-[1.5px] border-border bg-card p-6">
        <PulseBlock className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <PulseBlock key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
