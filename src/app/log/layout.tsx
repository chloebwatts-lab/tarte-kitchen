import "../kitchen/kitchen.css"

export default function LogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Mirrors the /kitchen kiosk layout — same tokens, same proportions, so
  // the wastage entry page reads as part of the same in-store iPad app.
  return (
    <div
      className="tk-root min-h-screen"
      style={{ background: "var(--tk-bg)" }}
    >
      <div className="mx-auto max-w-[1194px] px-6 py-5 md:px-10 md:py-8">
        {children}
      </div>
    </div>
  )
}
