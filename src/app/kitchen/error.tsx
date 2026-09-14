"use client"

import { useEffect } from "react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"

/**
 * Staff-side error page. Without one, a thrown server action or a dropped
 * connection mid-service lands staff on the framework's raw error screen
 * with no way back. This keeps them inside the app with two obvious taps.
 */
export default function KitchenError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto mt-10 max-w-[520px] rounded-[18px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-6">
      <p className="tk-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-[var(--tk-charcoal)]">
        That didn&apos;t load
      </p>
      <p className="mt-2 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
        Usually the wifi, sometimes an update landing. Nothing you tapped before this
        is lost. Try again, or head back to the staff tools.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[12px] text-[var(--tk-ink-mute)]">Ref {error.digest}</p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <KitchenButton variant="primary" size="lg" onClick={() => reset()} className="flex-1">
          Try again
        </KitchenButton>
        <KitchenButton variant="secondary" size="lg" href="/staffaccess" className="flex-1">
          Staff tools
        </KitchenButton>
      </div>
    </div>
  )
}
