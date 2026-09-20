"use client"

import { useEffect, useRef, useState } from "react"
import { signDeed } from "@/app/kitchen/confidentiality/actions"

/**
 * Typed legal name + drawn signature. The Sign button stays off until the
 * deed has been scrolled to the end, the box is ticked, the name has two
 * words and something has actually been drawn.
 */
export function DeedSignForm({ next, readToEnd, failed }: { next: string; readToEnd: boolean; failed: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [strokes, setStrokes] = useState(0)
  const [sig, setSig] = useState("")
  const [name, setName] = useState("")
  const [agreed, setAgreed] = useState(false)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
    const ctx = c.getContext("2d")!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#1f2a33"
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvas.current!.getContext("2d")!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvas.current!.getContext("2d")!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  function up() {
    if (!drawing.current) return
    drawing.current = false
    setStrokes((n) => n + 1)
    setSig(canvas.current!.toDataURL("image/png"))
  }
  function clear() {
    const c = canvas.current!
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
    setStrokes(0)
    setSig("")
  }

  const ready = readToEnd && agreed && name.trim().split(/\s+/).length >= 2 && strokes > 0

  return (
    <form action={signDeed} className="rounded-[20px] border border-[var(--tk-line)] bg-white p-5 sm:p-6">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="signatureImg" value={sig} />

      {failed && (
        <p className="mb-4 rounded-[14px] px-4 py-3 text-[14px] font-medium" style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}>
          Something was missing. Tick the box, type your full legal name and draw your signature.
        </p>
      )}

      <label className="flex items-start gap-3 text-[16px] leading-snug text-[var(--tk-charcoal)]">
        <input
          type="checkbox"
          name="agreed"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-6 w-6 shrink-0 accent-[var(--tk-charcoal)]"
        />
        <span>I have read this deed, I understand it, and I agree to be bound by it.</span>
      </label>

      <label className="mt-5 block">
        <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>Your full legal name</span>
        <input
          name="signedName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="words"
          autoComplete="name"
          required
          className="mt-1.5 w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
        />
      </label>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>Sign here with your finger</span>
          <button type="button" onClick={clear} className="text-[13px] text-[var(--tk-ink-soft)] underline">Clear</button>
        </div>
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="mt-1.5 h-[160px] w-full touch-none rounded-[14px] border border-dashed border-[var(--tk-ink-mute)] bg-[var(--tk-bg)]"
          aria-label="Signature"
        />
      </div>

      <button
        type="submit"
        disabled={!ready}
        className="mt-6 w-full rounded-full px-6 py-4 text-[17px] font-semibold text-white transition disabled:opacity-40"
        style={{ background: "var(--tk-charcoal)" }}
      >
        Sign the deed
      </button>
      {!readToEnd && (
        <p className="mt-2 text-center text-[13px] text-[var(--tk-ink-soft)]">Scroll to the end of the deed first.</p>
      )}
    </form>
  )
}
