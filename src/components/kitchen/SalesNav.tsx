import Link from "next/link"

const TABS = [
  { key: "sales", label: "Sales", path: "" },
  { key: "challenge", label: "Challenge", path: "/challenge" },
  { key: "average", label: "Avg sale", path: "/average" },
  { key: "hourly", label: "By hour", path: "/hourly" },
] as const

export type SalesTab = (typeof TABS)[number]["key"]

/** The buttons across the top of the sales pages: one page each, no long scroll. */
export function SalesNav({ current, venue }: { current: SalesTab; venue: string }) {
  return (
    <nav className="grid grid-cols-4 gap-2" aria-label="Sales pages">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/kitchen/managers/sales${t.path}?venue=${venue}`}
          aria-current={t.key === current ? "page" : undefined}
          className={`flex min-h-[48px] items-center justify-center rounded-full px-2 text-[15px] font-semibold transition active:scale-[0.98] ${
            t.key === current ? "bg-[var(--tk-charcoal)] text-white" : "border border-[var(--tk-line)] bg-white text-[var(--tk-charcoal)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
