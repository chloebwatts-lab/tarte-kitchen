// Instant feedback while any kitchen page streams in. Follows the
// inspection/loading.tsx pattern: without it, tapping a tile gives no
// response for seconds on an iPad and staff assume the button is broken.
// Kept neutral because this boundary also covers nested pages (cooling,
// pastry, prep, serves, training) that have no loading file of their own.
export default function KitchenLoading() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-48 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
      <div className="space-y-3 px-1">
        <div className="h-11 w-72 max-w-full animate-pulse rounded-[12px] bg-[var(--tk-charcoal-soft)]" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-[20px] border border-[var(--tk-line)] bg-white"
          />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-[18px] border border-[var(--tk-line)] bg-white"
          />
        ))}
      </div>
    </div>
  )
}
