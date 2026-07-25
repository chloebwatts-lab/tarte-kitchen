import "../kitchen/kitchen.css"

export default function StaffAccessLayout({ children }: { children: React.ReactNode }) {
  // Same kiosk shell as /kitchen — no sidebar, no login, iPad-first.
  return (
    <div className="tk-root min-h-screen" style={{ background: "var(--tk-bg)" }}>
      {children}
    </div>
  )
}
