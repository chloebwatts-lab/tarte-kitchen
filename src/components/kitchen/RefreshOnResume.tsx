"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * iOS home-screen apps resume the last rendered page from memory, which is
 * how a days-old inspection view can sit on screen looking current. When the
 * app regains visibility, silently re-fetch the server data.
 */
export function RefreshOnResume() {
  const router = useRouter()
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [router])
  return null
}
