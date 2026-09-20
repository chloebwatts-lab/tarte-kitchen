"use client"

import { useEffect, useRef, useState } from "react"
import { DeedSignForm } from "@/components/kitchen/DeedSignForm"

/** Wraps the deed text; the form unlocks once the end marker has been on screen. */
export function DeedReader({ children, next, failed }: { children: React.ReactNode; next: string; failed: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  const [readToEnd, setReadToEnd] = useState(false)
  useEffect(() => {
    const el = end.current
    if (!el) return
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setReadToEnd(true)))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      {children}
      <div ref={end} />
      <DeedSignForm next={next} readToEnd={readToEnd} failed={failed} />
    </>
  )
}
