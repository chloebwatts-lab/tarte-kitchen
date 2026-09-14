"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { recordSignal, recordCount } from "@/lib/actions/venue-stock"
import type { RoundArea, RoundItem } from "@/lib/actions/venue-stock"

function SignalRow({ item, name }: { item: RoundItem; name: string }) {
  const [busy, start] = useTransition()
  const set = (s: "OK" | "LOW" | "OUT") => start(async () => { await recordSignal(item.id, s, name) })
  const btn = (active: boolean, tone: "ok" | "warn") =>
    `rounded-[10px] px-3 py-2 text-[14px] font-semibold ${
      active
        ? tone === "warn" ? "bg-[var(--tk-charcoal)] text-white" : "bg-[var(--tk-line)] text-[var(--tk-charcoal)]"
        : "border border-[var(--tk-line)] text-[var(--tk-ink-soft)]"
    }`
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="flex-1 text-[16px] text-[var(--tk-charcoal)]">
        {item.name}
        {item.signal !== "OK" && item.signalBy ? (
          <span className="ml-2 text-[12px] text-[var(--tk-ink-soft)]">flagged by {item.signalBy}</span>
        ) : null}
      </span>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <button onClick={() => set("OK")} className={btn(item.signal === "OK", "ok")}>Fine</button>
      <button onClick={() => set("LOW")} className={btn(item.signal === "LOW", "warn")}>Low</button>
      <button onClick={() => set("OUT")} className={btn(item.signal === "OUT", "warn")}>Out</button>
    </div>
  )
}

function CountRow({ item, name }: { item: RoundItem; name: string }) {
  const [val, setVal] = useState(item.onHand?.toString() ?? "")
  const [busy, start] = useTransition()
  const save = () => {
    const n = Number(val)
    if (!Number.isFinite(n)) return
    start(async () => { await recordCount(item.id, n, name) })
  }
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="flex-1 text-[16px] text-[var(--tk-charcoal)]">
        {item.name}
        <span className="ml-2 text-[12px] text-[var(--tk-ink-soft)]">
          par {item.parLevel ?? "?"}{item.unit ? ` ${item.unit}` : ""}
        </span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        className="w-20 rounded-[10px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-2.5 py-2 text-right text-[16px]"
      />
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
    </div>
  )
}

export function StockWalk({ areas }: { areas: RoundArea[] }) {
  const [name, setName] = useRememberedName()
  if (areas.length === 0) {
    return (
      <p className="text-[17px] text-[var(--tk-ink-soft)]">
        No stock list for this venue yet. A manager sets it up under Managers, Stock list.
      </p>
    )
  }
  return (
    <div className="space-y-6">
      <label className="block max-w-[260px]">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">Your name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3 text-[17px]"
        />
      </label>
      {areas.map((a) => (
        <section key={a.id} className="border-t-[1.5px] border-[var(--tk-line)] pt-4">
          <h2 className="tk-display mb-1 text-[20px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">{a.name}</h2>
          <div className="divide-y divide-[var(--tk-line)]">
            {a.items.map((i) =>
              i.tracking === "SIGNAL"
                ? <SignalRow key={i.id} item={i} name={name} />
                : <CountRow key={i.id} item={i} name={name} />
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
