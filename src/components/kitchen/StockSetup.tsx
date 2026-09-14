"use client"

import { useState, useTransition } from "react"
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import {
  addArea, addItem, moveArea, setAreaActive, setItemActive, updateItem,
} from "@/lib/actions/venue-stock-setup"
import type { SetupArea, SetupItem } from "@/lib/actions/venue-stock-setup"
import type { Venue, VenueStockTracking } from "@/generated/prisma/client"

const field =
  "rounded-[10px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-3 py-2 text-[15px] text-[var(--tk-charcoal)]"
const small = "rounded-[8px] px-2.5 py-1.5 text-[13px] font-semibold"

function ItemRow({ item }: { item: SetupItem }) {
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit ?? "")
  const [tracking, setTracking] = useState<VenueStockTracking>(item.tracking)
  const [par, setPar] = useState(item.parLevel?.toString() ?? "")
  const [busy, start] = useTransition()
  const dirty =
    name !== item.name || unit !== (item.unit ?? "") || tracking !== item.tracking ||
    par !== (item.parLevel?.toString() ?? "")

  const save = () =>
    start(async () => {
      await updateItem(item.id, {
        name, unit, tracking,
        parLevel: tracking === "QUANTITY" ? Number(par) : null,
      })
    })

  return (
    <div className={`flex flex-wrap items-center gap-2 py-2 ${item.isActive ? "" : "opacity-50"}`}>
      <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} min-w-[180px] flex-1`} />
      <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" className={`${field} w-24`} />
      <select value={tracking} onChange={(e) => setTracking(e.target.value as VenueStockTracking)} className={`${field} w-36`}>
        <option value="SIGNAL">Fine / Low / Out</option>
        <option value="QUANTITY">Counted</option>
      </select>
      {tracking === "QUANTITY" ? (
        <input type="number" inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} placeholder="par" className={`${field} w-20 text-right`} />
      ) : null}
      {dirty ? (
        <button onClick={save} disabled={busy} className={`${small} bg-[var(--tk-charcoal)] text-white`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </button>
      ) : null}
      <button
        onClick={() => start(async () => { await setItemActive(item.id, !item.isActive) })}
        className={`${small} text-[var(--tk-ink-soft)]`}
      >
        {item.isActive ? "Hide" : "Show"}
      </button>
    </div>
  )
}

function NewItem({ areaId }: { areaId: string }) {
  const [name, setName] = useState("")
  const [unit, setUnit] = useState("")
  const [tracking, setTracking] = useState<VenueStockTracking>("SIGNAL")
  const [par, setPar] = useState("")
  const [error, setError] = useState("")
  const [busy, start] = useTransition()

  const add = () => {
    setError("")
    start(async () => {
      try {
        await addItem(areaId, { name, unit, tracking, parLevel: tracking === "QUANTITY" ? Number(par) : null })
        setName(""); setUnit(""); setPar("")
      } catch (e) { setError(e instanceof Error ? e.message : "Couldn't add") }
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--tk-card)] p-2.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item, e.g. Tea towels"
        onKeyDown={(e) => { if (e.key === "Enter") add() }} className={`${field} min-w-[180px] flex-1`} />
      <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" className={`${field} w-24`} />
      <select value={tracking} onChange={(e) => setTracking(e.target.value as VenueStockTracking)} className={`${field} w-36`}>
        <option value="SIGNAL">Fine / Low / Out</option>
        <option value="QUANTITY">Counted</option>
      </select>
      {tracking === "QUANTITY" ? (
        <input type="number" inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} placeholder="par" className={`${field} w-20 text-right`} />
      ) : null}
      <button onClick={add} disabled={busy || !name.trim()} className={`${small} bg-[var(--tk-charcoal)] text-white disabled:opacity-40`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
      </button>
      {error ? <span className="text-[13px] text-[#B4432A]">{error}</span> : null}
    </div>
  )
}

export function StockSetup({ venue, areas }: { venue: Venue; areas: SetupArea[] }) {
  const [newArea, setNewArea] = useState("")
  const [busy, start] = useTransition()

  return (
    <div className="space-y-6">
      <div className="rounded-[14px] bg-[var(--tk-card)] p-4">
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
          Add an area
        </p>
        <div className="flex gap-2">
          <input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="e.g. Shed, Bar cupboard, Retail fridge"
            onKeyDown={(e) => { if (e.key === "Enter") start(async () => { await addArea(venue, newArea); setNewArea("") }) }}
            className={`${field} flex-1`} />
          <KitchenButton variant="primary" size="md" disabled={busy || !newArea.trim()}
            onClick={() => start(async () => { await addArea(venue, newArea); setNewArea("") })}>
            Add
          </KitchenButton>
        </div>
        <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">
          Areas appear in the order you walk them. Use the arrows to match the route.
        </p>
      </div>

      {areas.length === 0 ? (
        <p className="text-[16px] text-[var(--tk-ink-soft)]">No areas yet. Start with the first place you walk to.</p>
      ) : null}

      {areas.map((a, idx) => (
        <section key={a.id} className={`border-t-[1.5px] border-[var(--tk-line)] pt-4 ${a.isActive ? "" : "opacity-60"}`}>
          <div className="flex items-center gap-2">
            <h2 className="tk-display flex-1 text-[20px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
              {a.name}
            </h2>
            <button disabled={idx === 0} onClick={() => start(async () => { await moveArea(a.id, "up") })} className={`${small} border border-[var(--tk-line)] disabled:opacity-30`}><ArrowUp className="h-4 w-4" /></button>
            <button disabled={idx === areas.length - 1} onClick={() => start(async () => { await moveArea(a.id, "down") })} className={`${small} border border-[var(--tk-line)] disabled:opacity-30`}><ArrowDown className="h-4 w-4" /></button>
            <button onClick={() => start(async () => { await setAreaActive(a.id, !a.isActive) })} className={`${small} text-[var(--tk-ink-soft)]`}>
              {a.isActive ? "Hide" : "Show"}
            </button>
          </div>
          <div className="mt-1 divide-y divide-[var(--tk-line)]">
            {a.items.map((i) => <ItemRow key={i.id} item={i} />)}
          </div>
          <NewItem areaId={a.id} />
        </section>
      ))}
    </div>
  )
}
