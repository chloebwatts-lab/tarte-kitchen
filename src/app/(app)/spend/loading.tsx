function PulseBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-sage-soft ${className ?? ""}`}
    />
  )
}

export default function SpendLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading live spend">
      <div className="space-y-2">
        <PulseBlock className="h-7 w-36" />
        <PulseBlock className="h-4 w-80" />
      </div>

      {/* Week banner */}
      <PulseBlock className="h-9 w-full" />

      {/* Per-venue cards with stat tiles + day table */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border-[1.5px] border-border bg-card p-6"
        >
          <PulseBlock className="h-5 w-40" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="rounded-lg border border-border p-3">
                <PulseBlock className="h-3 w-20" />
                <PulseBlock className="mt-2 h-6 w-24" />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <PulseBlock className="h-4 w-full" />
            <PulseBlock className="h-4 w-full" />
            <PulseBlock className="h-4 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  )
}
