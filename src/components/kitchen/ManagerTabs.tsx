import Link from "next/link"

/**
 * The three manager views of one list, as a tab strip: the board (allocate),
 * the manager's own list (tick off), and the plate (read, for the other
 * managers). Same venue carries across.
 */
export function ManagerTabs({
  venue,
  manager,
  active,
}: {
  venue: string
  manager: string | null
  active: "board" | "list" | "plate"
}) {
  const first = manager ? manager.split(/\s+/)[0] : null
  const tabs: { key: "board" | "list" | "plate"; label: string; href: string }[] = [
    { key: "board", label: "Morning board", href: `/kitchen/managers/board?venue=${venue}` },
    { key: "list", label: first ? `${first}'s list` : "My list", href: `/kitchen/managers/list?venue=${venue}` },
    { key: "plate", label: first ? `On ${first}` : "The plate", href: `/kitchen/managers/plate?venue=${venue}` },
  ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          replace
          aria-current={t.key === active ? "page" : undefined}
          className={`rounded-[12px] px-4 py-2 text-[15px] font-semibold transition active:scale-[0.98] ${
            t.key === active
              ? "bg-[var(--tk-charcoal)] text-white"
              : "border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-ink-soft)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
