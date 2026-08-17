import "../kitchen/kitchen.css"

export default function StaffLoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Same kiosk shell as the rest of staff tools, so the gate looks like part
  // of the app rather than a browser prompt bolted on the front.
  return (
    <div className="tk-root min-h-screen" style={{ background: "var(--tk-sage)" }}>
      {children}
    </div>
  )
}
