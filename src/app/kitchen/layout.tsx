export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No sidebar, no header — the iPad view is a single-purpose kiosk-style
  // layout. Staff can't navigate away to accidentally open a full admin
  // page in the middle of service.
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1100px] px-4 py-4">{children}</div>
    </div>
  )
}
