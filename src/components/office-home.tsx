import Link from "next/link"
import { ArrowRight, Smartphone } from "lucide-react"
import { OFFICE_GROUPS, type OfficeTool } from "@/lib/office-tools"

type Counts = Record<NonNullable<OfficeTool["badge"]>, number>

export function OfficeHome({ counts }: { counts: Counts }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Tarte HQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick what you are here to do.</p>
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" /> Put this on your phone
          </summary>
          <div className="mt-2 max-w-xs leading-relaxed">
            iPhone: open this page in Safari, tap Share, then &quot;Add to Home Screen&quot;.
            Android: open in Chrome, tap the menu, then &quot;Add to Home screen&quot;. It
            installs as its own icon, separate from the staff tools app.
          </div>
        </details>
      </div>

      {OFFICE_GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.title}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.tools.map((t) => {
              const n = t.badge ? counts[t.badge] : 0
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group relative flex min-h-[112px] flex-col justify-between rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/40 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <t.icon className="h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.7} />
                    {n > 0 && (
                      <span className="rounded-full bg-red-light px-2 py-0.5 text-xs font-semibold tabular-nums text-red-text">
                        {n}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="font-serif text-[17px] font-semibold leading-tight tracking-tight">{t.title}</div>
                    <div className="mt-1 text-xs leading-snug text-muted-foreground">{t.sub}</div>
                  </div>
                  <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/60 transition group-hover:translate-x-0.5" />
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
