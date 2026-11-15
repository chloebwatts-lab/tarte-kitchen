"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Re-fetch the page's server data every `seconds` while it is on screen. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, Math.max(30, seconds) * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
