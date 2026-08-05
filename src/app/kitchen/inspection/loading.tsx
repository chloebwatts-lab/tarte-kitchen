// Instant feedback while the (data-heavy) inspection view streams in.
// Without this, tapping the tile gave no response for several seconds on
// an iPad and staff assumed the button was broken.
export default function InspectionLoading() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-48 animate-pulse rounded-full bg-[var(--tk-charcoal-soft)]" />
      <div
        className="tk-display leading-none text-[var(--tk-charcoal)]"
        style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
      >
        Inspection view
      </div>
      <div className="text-[14px] text-[var(--tk-ink-soft)]">
        Pulling the records…
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-[16px] border border-[var(--tk-line)] bg-white"
          />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-[14px] border border-[var(--tk-line)] bg-white"
        />
      ))}
    </div>
  )
}
