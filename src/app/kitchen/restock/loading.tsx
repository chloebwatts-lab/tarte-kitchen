// Instant feedback while the restock hub (or its count / run / report
// children without their own loading file) streams in. Same pattern as
// inspection/loading.tsx: rough page shape in neutral pulse blocks.
export default function RestockLoading() {
  return (
    <div className="space-y-8">
      <div className="h-5 w-56 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
      <div className="space-y-3 px-1">
        <div className="h-11 w-80 max-w-full animate-pulse rounded-[12px] bg-[var(--tk-charcoal-soft)]" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-52 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse rounded-[16px] border border-[var(--tk-line)] bg-white"
          />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-40 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-[80px] animate-pulse rounded-[16px] border border-[var(--tk-line)] bg-white"
          />
        ))}
      </div>
    </div>
  )
}
