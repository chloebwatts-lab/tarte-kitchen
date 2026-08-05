function PulseBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-sage-soft ${className ?? ""}`}
    />
  )
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <PulseBlock className="h-7 w-40" />
        <PulseBlock className="h-4 w-72" />
      </div>

      {/* Ops panel */}
      <div className="rounded-2xl border-[1.5px] border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <PulseBlock className="h-3.5 w-24" />
              <PulseBlock className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Highlights tiles */}
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border-[1.5px] border-border bg-card p-5"
          >
            <PulseBlock className="h-3.5 w-28" />
            <PulseBlock className="mt-3 h-7 w-32" />
            <PulseBlock className="mt-3 h-4 w-40" />
          </div>
        ))}
      </div>

      {/* Report + sales-by-venue cards */}
      <div className="rounded-2xl border-[1.5px] border-border bg-card p-6">
        <PulseBlock className="h-4 w-44" />
        <div className="mt-4 space-y-3">
          <PulseBlock className="h-4 w-full" />
          <PulseBlock className="h-4 w-5/6" />
          <PulseBlock className="h-4 w-2/3" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border-[1.5px] border-border bg-card p-5"
          >
            <PulseBlock className="h-4 w-32" />
            <PulseBlock className="mt-4 h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
