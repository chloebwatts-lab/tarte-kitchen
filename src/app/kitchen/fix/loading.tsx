// Instant feedback while the maintenance asset list streams in. Same
// pattern as inspection/loading.tsx: rough page shape in neutral pulses
// (breadcrumb, header with venue toggle, search bar, asset card grid).
export default function FixLoading() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-56 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
          <div className="h-11 w-56 animate-pulse rounded-[12px] bg-[var(--tk-charcoal-soft)]" />
          <div className="h-4 w-64 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
        </div>
        <div className="h-14 w-64 animate-pulse rounded-2xl border border-[var(--tk-line)] bg-white" />
      </div>
      <div className="h-14 animate-pulse rounded-[16px] border border-[var(--tk-line)] bg-white" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-[18px] border border-[var(--tk-line)] bg-white"
          />
        ))}
      </div>
    </div>
  )
}
