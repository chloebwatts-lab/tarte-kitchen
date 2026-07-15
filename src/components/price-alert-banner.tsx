"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, X } from "lucide-react"

export function PriceAlertBanner() {
  const [count, setCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch("/api/alerts/count")
        if (res.ok) {
          const data = await res.json()
          setCount(data.count)
        }
      } catch {
        // Silently ignore — banner just won't show
      }
    }
    fetchCount()
  }, [])

  if (count === 0 || dismissed) return null

  return (
    <div className="flex items-center justify-between border-b border-gold bg-gold-soft px-4 py-2 md:px-6">
      <Link
        href="/price-alerts"
        className="flex items-center gap-2 text-sm text-amber-text hover:underline"
      >
        <AlertTriangle className="h-4 w-4" />
        <span>
          {count} price alert{count !== 1 ? "s" : ""} open — review in Price
          Alerts
        </span>
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 text-amber-text/70 hover:text-amber-text"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
