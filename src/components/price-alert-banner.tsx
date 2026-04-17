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
    <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-6 py-2">
      <Link
        href="/suppliers"
        className="flex items-center gap-2 text-sm text-amber-800 hover:underline"
      >
        <AlertTriangle className="h-4 w-4" />
        <span>
          {count} price change{count !== 1 ? "s" : ""} detected — review in
          Suppliers
        </span>
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-800"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
