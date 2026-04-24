export function KitchenLogo({
  size = 1,
  onDark = false,
}: {
  size?: number
  onDark?: boolean
}) {
  const ink = onDark ? "#ffffff" : "var(--tk-sage)"
  const tagInk = onDark ? "rgba(255,255,255,0.75)" : "var(--tk-ink-soft)"
  const divider = onDark ? "rgba(255,255,255,0.3)" : "var(--tk-line)"
  return (
    <div className="flex items-center" style={{ gap: 12 * size }}>
      <span
        className="tk-display leading-none"
        style={{
          fontSize: 28 * size,
          color: ink,
          letterSpacing: "-0.035em",
        }}
      >
        Tarte.
      </span>
      <span
        style={{
          width: 1,
          height: 26 * size,
          background: divider,
          display: "inline-block",
        }}
      />
      <span
        className="tk-caps"
        style={{
          fontSize: 13 * size,
          color: tagInk,
          letterSpacing: "0.16em",
        }}
      >
        Kitchen
      </span>
    </div>
  )
}
