"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { signOut } from "@/app/staff-login/actions"

function beacon(kind: "view" | "capture", path: string) {
  try {
    const body = JSON.stringify({ kind, path })
    if (!navigator.sendBeacon?.("/kitchen/beacon", new Blob([body], { type: "application/json" }))) {
      void fetch("/kitchen/beacon", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true })
    }
  } catch {
    // The trail is best effort. Never break the page over it.
  }
}

export function StaffShellClient({ name, idleMinutes }: { name: string; idleMinutes: number }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const [stamp, setStamp] = useState("")
  const lastActive = useRef(Date.now())

  // Who opened what.
  useEffect(() => {
    const q = search?.toString()
    beacon("view", q ? `${pathname}?${q}` : pathname)
  }, [pathname, search])

  // The watermark carries the minute, so a photo can be placed in time.
  useEffect(() => {
    const tick = () =>
      setStamp(
        new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Brisbane" }).format(new Date())
      )
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [])

  // Shared iPads: walk away and the next person must not inherit the name.
  useEffect(() => {
    const touch = () => { lastActive.current = Date.now() }
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > idleMinutes * 60_000) void signOut()
    }, 20_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(t)
    }
  }, [idleMinutes])

  // A browser cannot see a real screenshot. These two are the only signals
  // it does get: the PrintScreen key (Windows keyboards) and a print attempt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "PrintScreen") beacon("capture", `${location.pathname} (PrintScreen key)`) }
    const onPrint = () => beacon("capture", `${location.pathname} (print)`)
    window.addEventListener("keyup", onKey)
    window.addEventListener("beforeprint", onPrint)
    return () => {
      window.removeEventListener("keyup", onKey)
      window.removeEventListener("beforeprint", onPrint)
    }
  }, [])

  const tile = useMemo(() => {
    const text = `${name} · ${stamp} · Tarte confidential`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="10" y="120" transform="rotate(-24 210 110)" font-family="Helvetica,Arial,sans-serif" font-size="15" font-weight="600" fill="#1f2a33">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
  }, [name, stamp])

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] print:opacity-30"
        style={{ backgroundImage: tile, backgroundRepeat: "repeat", opacity: 0.075 }}
      />
      <form action={signOut} className="fixed bottom-3 left-3 z-[61] print:hidden">
        <button
          type="submit"
          className="rounded-full border border-[var(--tk-line)] bg-white/95 px-3.5 py-2 text-[13px] font-medium text-[var(--tk-charcoal)] shadow-sm"
        >
          {name.split(" ")[0]} · Sign out
        </button>
      </form>
    </>
  )
}
