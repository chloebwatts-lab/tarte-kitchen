function PulseBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-sage-soft ${className ?? ""}`}
    />
  )
}

export default function AnalysisLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading analysis">
      <div className="space-y-2">
        <PulseBlock className="h-7 w-32" />
        <PulseBlock className="h-4 w-96 max-w-full" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <PulseBlock key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Trend chart card */}
      <div className="rounded-2xl border-[1.5px] border-border bg-card p-6">
        <PulseBlock className="h-4 w-48" />
        <PulseBlock className="mt-4 h-64 w-full" />
      </div>

      {/* Movers tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border-[1.5px] border-border bg-card p-6"
          >
            <PulseBlock className="h-4 w-44" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <PulseBlock key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
