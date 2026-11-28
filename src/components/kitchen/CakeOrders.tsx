"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, BellRing, CakeSlice, Loader2, Mail, Phone, Plus } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import {
  markOrderSeen,
  saveCakeOrder,
  saveCakePush,
  setCakeOrderStatus,
  type CakeBoard,
  type CakeOrderInput,
  type CakeOrderRow,
} from "@/lib/actions/cake-orders"
import {
  CAKE_VENUES,
  CAKE_VENUE_LABEL,
  MIN_NOTICE_DAYS,
  groupUpcoming,
  niceTime,
  shortDay,
  type CakeStatus,
  type CakeVenue,
} from "@/lib/cakes/shared"

/**
 * Cake orders (Shawna, 26 Nov 2026): every cake, pie and pre-order a
 * customer is picking up, by day. Website orders arrive by themselves;
 * anyone signed in adds counter, phone and function orders. Pastry taps
 * Got it, Ready, Collected. Nothing is deleted: Cancel keeps the record.
 */

const STATUS: Record<CakeStatus, { label: string; bg: string; fg: string }> = {
  NEW: { label: "New", bg: "var(--tk-warn-soft)", fg: "var(--tk-warn)" },
  SEEN: { label: "Got it", bg: "var(--tk-gold-soft)", fg: "#8a6d1f" },
  READY: { label: "Ready", bg: "var(--tk-done-soft)", fg: "var(--tk-done)" },
  COLLECTED: { label: "Collected", bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" },
  CANCELLED: { label: "Cancelled", bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-mute)" },
}

const NEXT: Partial<Record<CakeStatus, { to: CakeStatus; label: string }>> = {
  NEW: { to: "SEEN", label: "Got it" },
  SEEN: { to: "READY", label: "Ready" },
  READY: { to: "COLLECTED", label: "Collected" },
}

const stamp = new Intl.DateTimeFormat("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })

const field =
  "w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] text-[var(--tk-ink)] focus:border-[var(--tk-charcoal)] focus:outline-none"

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const b64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : "")

type Draft = { [K in Exclude<keyof CakeOrderInput, "quantity" | "paid">]: string } & { quantity: string; paid: boolean }

function emptyDraft(venue: CakeVenue | null): Draft {
  return {
    venue: venue ?? "",
    pickupDate: "",
    pickupTime: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    product: "",
    details: "",
    quantity: "1",
    message: "",
    dietary: "",
    notes: "",
    paid: false,
  }
}

function draftOf(o: CakeOrderRow): Draft {
  return {
    venue: o.venue,
    pickupDate: o.pickupDate ?? "",
    pickupTime: o.pickupTime ?? "",
    customerName: o.customerName,
    customerEmail: o.customerEmail ?? "",
    customerPhone: o.customerPhone ?? "",
    product: o.product,
    details: o.details ?? "",
    quantity: String(o.quantity),
    message: o.message ?? "",
    dietary: o.dietary ?? "",
    notes: o.notes ?? "",
    paid: o.paid,
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[14px] font-semibold text-[var(--tk-ink-soft)]">{children}</span>
}

function OrderForm({
  initial,
  products,
  today,
  onDone,
  id,
}: {
  initial: Draft
  products: string[]
  today: string
  onDone: () => void
  id?: string
}) {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const listId = `cake-products-${id ?? "new"}`

  function save() {
    setError(null)
    start(async () => {
      const r = await saveCakeOrder({ ...d, quantity: d.quantity }, id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Picked up at</Label>
        <div className="flex flex-wrap gap-2">
          {CAKE_VENUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => set("venue", v)}
              className="min-h-[48px] rounded-full border px-5 text-[16px] font-semibold"
              style={
                d.venue === v
                  ? { background: "var(--tk-charcoal)", color: "white", borderColor: "var(--tk-charcoal)" }
                  : { background: "white", color: "var(--tk-charcoal)", borderColor: "var(--tk-line)" }
              }
            >
              {CAKE_VENUE_LABEL[v]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <Label>Pickup date</Label>
          <input type="date" min={id ? undefined : today} value={d.pickupDate} onChange={(e) => set("pickupDate", e.target.value)} className={field} />
        </label>
        <label className="block">
          <Label>Pickup time (if they said)</Label>
          <input type="time" value={d.pickupTime} onChange={(e) => set("pickupTime", e.target.value)} className={field} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
        <label className="block">
          <Label>What they ordered</Label>
          <input list={listId} value={d.product} onChange={(e) => set("product", e.target.value)} placeholder="Tarte Signature Celebration Cake" className={field} />
          <datalist id={listId}>
            {products.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <Label>How many</Label>
          <input type="number" min={1} inputMode="numeric" value={d.quantity} onChange={(e) => set("quantity", e.target.value)} className={field} />
        </label>
      </div>
      <label className="block">
        <Label>Size, flavour, filling</Label>
        <input value={d.details} onChange={(e) => set("details", e.target.value)} placeholder="8 inch, raspberries, dulce de leche" className={field} />
      </label>
      <label className="block">
        <Label>Writing on the cake</Label>
        <input value={d.message} onChange={(e) => set("message", e.target.value)} placeholder="Happy 40th Sam" className={field} />
      </label>
      <label className="block">
        <Label>Allergies or dietaries</Label>
        <input value={d.dietary} onChange={(e) => set("dietary", e.target.value)} placeholder="Nut free" className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <Label>Customer name</Label>
          <input value={d.customerName} onChange={(e) => set("customerName", e.target.value)} className={field} />
        </label>
        <label className="block">
          <Label>Phone</Label>
          <input type="tel" value={d.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} className={field} />
        </label>
        <label className="block">
          <Label>Email</Label>
          <input type="email" value={d.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} className={field} />
        </label>
      </div>
      <label className="block">
        <Label>Notes</Label>
        <textarea rows={3} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="For a function booking, delivery to the table, anything pastry should know" className={field} />
      </label>
      <label className="flex min-h-[48px] items-center gap-3 text-[17px] font-semibold text-[var(--tk-ink)]">
        <input type="checkbox" checked={d.paid} onChange={(e) => set("paid", e.target.checked)} className="h-6 w-6 accent-[var(--tk-charcoal)]" />
        Paid already
      </label>
      {error ? <p className="text-[16px] font-semibold text-[var(--tk-warn)]">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <KitchenButton size="lg" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {id ? "Save changes" : "Add the order"}
        </KitchenButton>
        <KitchenButton size="lg" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </KitchenButton>
      </div>
    </div>
  )
}

function OrderCard({
  o,
  siblingsNew,
  products,
  today,
  highlight,
}: {
  o: CakeOrderRow
  siblingsNew: number
  products: string[]
  today: string
  highlight: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const chip = STATUS[o.status]
  const next = NEXT[o.status]
  const done = o.status === "COLLECTED" || o.status === "CANCELLED"

  function step(to: CakeStatus) {
    setError(null)
    start(async () => {
      const r = await setCakeOrderStatus(o.id, to)
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }
  function allSeen() {
    if (!o.orderRef) return
    start(async () => {
      await markOrderSeen(o.orderRef as string)
      router.refresh()
    })
  }

  return (
    <article
      id={`cake-${o.id}`}
      className="rounded-[18px] border bg-white"
      style={{ borderColor: highlight ? "var(--tk-charcoal)" : "var(--tk-line)", opacity: done ? 0.7 : 1 }}
    >
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <span className="text-[18px] font-bold text-[var(--tk-charcoal)]">{niceTime(o.pickupTime) ?? "Any time"}</span>
        <span className="rounded-full bg-[var(--tk-sage-soft)] px-3 py-1 text-[13px] font-semibold text-[var(--tk-done)]">{CAKE_VENUE_LABEL[o.venue]}</span>
        <span className="rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: chip.bg, color: chip.fg }}>
          {chip.label}
        </span>
        {o.shortNotice && !done ? (
          <span className="rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: "var(--tk-warn-soft)", color: "var(--tk-warn)" }}>
            Short notice
          </span>
        ) : null}
      </div>

      <div className="px-5 pt-2 pb-4">
        <div className="text-[20px] font-semibold leading-snug text-[var(--tk-charcoal)]">
          {o.quantity > 1 ? `${o.quantity} x ` : ""}
          {o.product}
        </div>
        {o.details ? <div className="mt-0.5 text-[16px] text-[var(--tk-ink)]">{o.details}</div> : null}
        {o.message ? (
          <div className="mt-2 text-[16px] text-[var(--tk-ink)]">
            <span className="font-semibold">On the cake: </span>&ldquo;{o.message}&rdquo;
          </div>
        ) : null}
        {o.dietary ? (
          <div className="mt-2 rounded-[10px] px-3 py-2 text-[16px] font-semibold" style={{ background: "var(--tk-warn-soft)", color: "var(--tk-warn)" }}>
            Allergies, dietaries: {o.dietary}
          </div>
        ) : null}
        {o.checkNote ? (
          <div className="mt-2 flex gap-2 rounded-[10px] px-3 py-2 text-[15px]" style={{ background: "var(--tk-gold-soft)", color: "#6f5716" }}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Check: </span>
              {o.checkNote}
            </span>
          </div>
        ) : null}
        {o.notes ? <p className="mt-2 whitespace-pre-line text-[15px] leading-snug text-[var(--tk-ink-soft)]">{o.notes}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-[var(--tk-ink)]">
          <span className="font-semibold">{o.customerName}</span>
          {o.customerPhone ? (
            <a href={`tel:${o.customerPhone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              <Phone className="h-4 w-4" /> {o.customerPhone}
            </a>
          ) : null}
          {o.customerEmail ? (
            <a href={`mailto:${o.customerEmail}`} className="inline-flex items-center gap-1 break-all underline-offset-2 hover:underline">
              <Mail className="h-4 w-4" /> {o.customerEmail}
            </a>
          ) : null}
        </div>
        <div className="mt-1 text-[13px] text-[var(--tk-ink-mute)]">
          {o.source === "WEBSITE" ? `Website order #${o.orderRef}` : `Added by ${o.createdBy ?? "staff"}`}
          {", ordered "}
          {shortDay(o.orderedDay)}
          {o.paid ? ", paid" : ", not paid yet"}
          {o.statusBy && o.statusAt ? `. ${STATUS[o.status].label}: ${o.statusBy}, ${stamp.format(new Date(o.statusAt))}` : ""}
          {o.updatedBy && o.source === "WEBSITE" ? `. Edited by ${o.updatedBy}` : ""}
        </div>
      </div>

      {editing ? (
        <div className="border-t border-[var(--tk-line)] px-5 py-4">
          <OrderForm id={o.id} initial={draftOf(o)} products={products} today={today} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--tk-line)] px-5 py-3">
          {next ? (
            <KitchenButton size="md" onClick={() => step(next.to)} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {next.label}
            </KitchenButton>
          ) : null}
          {o.status === "NEW" && siblingsNew > 1 ? (
            <KitchenButton size="md" variant="secondary" onClick={allSeen} disabled={pending}>
              Got it, all {siblingsNew} on this order
            </KitchenButton>
          ) : null}
          {o.status === "COLLECTED" || o.status === "CANCELLED" || o.status === "READY" ? (
            <KitchenButton size="md" variant="secondary" onClick={() => step(o.status === "COLLECTED" ? "READY" : "SEEN")} disabled={pending}>
              {o.status === "CANCELLED" ? "Bring it back" : "Undo"}
            </KitchenButton>
          ) : null}
          {o.status !== "CANCELLED" ? (
            <KitchenButton size="md" variant="secondary" onClick={() => setEditing(true)} disabled={pending}>
              Edit
            </KitchenButton>
          ) : null}
          {o.status !== "CANCELLED" && o.status !== "COLLECTED" ? (
            <KitchenButton
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Cancel ${o.product} for ${o.customerName}? Pastry gets an alert. It stays on the list as cancelled.`)) step("CANCELLED")
              }}
            >
              Cancel order
            </KitchenButton>
          ) : null}
          {error ? <span className="text-[15px] font-semibold text-[var(--tk-warn)]">{error}</span> : null}
        </div>
      )}
    </article>
  )
}

function Alerts({ pushKey, devices }: { pushKey: string | null; devices: number }) {
  const [msg, setMsg] = useState("")
  const [working, setWorking] = useState(false)
  const router = useRouter()
  if (!pushKey) return null

  async function turnOn() {
    setMsg("")
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setMsg("On an iPhone or iPad, alerts only work from the home screen app. In Safari tap Share, then Add to Home Screen. Open Tarte from the home screen, come back here and tap this again.")
      return
    }
    setWorking(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setMsg("Alerts are blocked for this app. Allow notifications for Tarte in the device settings, then tap this again.")
        return
      }
      const reg = await navigator.serviceWorker.register("/gm-sw.js")
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey as string) as BufferSource }))
      const label = /iPad/.test(navigator.userAgent) ? "iPad" : /iPhone/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Computer"
      const r = await saveCakePush({ endpoint: sub.endpoint, p256dh: b64(sub.getKey("p256dh")), auth: b64(sub.getKey("auth")), label })
      setMsg(r.ok ? "Done. A test alert is on its way to this device." : r.error)
      router.refresh()
    } catch {
      setMsg("That did not work on this device. Tell Shawna.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="rounded-[18px] border border-[var(--tk-line)] bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: "var(--tk-sage-soft)", color: "var(--tk-done)" }}>
          <BellRing className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <h2 className="tk-display text-[22px] leading-none text-[var(--tk-charcoal)]" style={{ fontWeight: 600 }}>
          Cake order alerts
        </h2>
      </div>
      <p className="mt-2 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
        {devices > 0 ? `On for ${devices} ${devices === 1 ? "device" : "devices"}. ` : ""}
        An alert for every new order, change or cancel, one more if nobody taps Got it within 2 hours, and today&apos;s list at 6am.
      </p>
      <div className="mt-3">
        <KitchenButton variant={devices > 0 ? "secondary" : "primary"} size="lg" disabled={working} onClick={turnOn}>
          {working ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Turn on alerts on this device
        </KitchenButton>
      </div>
      {msg ? <p className="mt-3 text-[16px] font-medium text-[var(--tk-ink)]">{msg}</p> : null}
    </section>
  )
}

export function CakeOrders({
  board,
  view,
  at,
  openId,
  orderRef,
}: {
  board: CakeBoard
  view: "upcoming" | "past"
  at: CakeVenue | null
  openId: string | null
  orderRef: string | null
}) {
  const [adding, setAdding] = useState(false)
  const shown = useMemo(() => board.orders.filter((o) => !at || o.venue === at), [board.orders, at])
  const groups = useMemo(() => {
    if (view === "upcoming") return groupUpcoming(shown, board.today)
    const days = new Map<string, CakeOrderRow[]>()
    for (const o of shown) if (o.pickupDate) days.set(o.pickupDate, [...(days.get(o.pickupDate) ?? []), o])
    return [...days.entries()].map(([day, orders]) => ({ key: day, title: shortDay(day), tone: "normal" as const, orders }))
  }, [shown, view, board.today])
  const newByOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of board.orders) if (o.orderRef && o.status === "NEW") m.set(o.orderRef, (m.get(o.orderRef) ?? 0) + 1)
    return m
  }, [board.orders])

  useEffect(() => {
    const target = openId ? board.orders.find((o) => o.id === openId) : orderRef ? board.orders.find((o) => o.orderRef === orderRef) : null
    if (target) document.getElementById(`cake-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [openId, orderRef, board.orders])

  const href = (over: { view?: string; at?: string | null }) => {
    const p = new URLSearchParams()
    const v = over.view ?? view
    const a = over.at === undefined ? at : over.at
    if (v === "past") p.set("view", "past")
    if (a) p.set("at", a)
    const s = p.toString()
    return `/kitchen/pastry/cakes${s ? `?${s}` : ""}`
  }

  const chipStyle = (on: boolean) =>
    on
      ? { background: "var(--tk-charcoal)", color: "white", borderColor: "var(--tk-charcoal)" }
      : { background: "white", color: "var(--tk-charcoal)", borderColor: "var(--tk-line)" }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {[null, ...CAKE_VENUES].map((v) => (
          <Link key={v ?? "all"} href={href({ at: v })} className="inline-flex min-h-[44px] items-center rounded-full border px-4 text-[15px] font-semibold" style={chipStyle(at === v)}>
            {v ? CAKE_VENUE_LABEL[v] : "All venues"}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-[var(--tk-line)]" />
        <Link href={href({ view: "upcoming" })} className="inline-flex min-h-[44px] items-center rounded-full border px-4 text-[15px] font-semibold" style={chipStyle(view === "upcoming")}>
          Coming up
        </Link>
        <Link href={href({ view: "past" })} className="inline-flex min-h-[44px] items-center rounded-full border px-4 text-[15px] font-semibold" style={chipStyle(view === "past")}>
          Past
        </Link>
      </div>

      {view === "upcoming" ? (
        adding ? (
          <section className="rounded-[18px] border border-[var(--tk-charcoal)] bg-white p-5">
            <h2 className="tk-display mb-4 text-[24px] leading-none text-[var(--tk-charcoal)]" style={{ fontWeight: 600 }}>
              Add a cake order
            </h2>
            <OrderForm initial={emptyDraft(at)} products={board.products} today={board.today} onDone={() => setAdding(false)} />
          </section>
        ) : (
          <KitchenButton size="lg" onClick={() => setAdding(true)}>
            <Plus className="h-5 w-5" /> Add a cake order
          </KitchenButton>
        )
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-8 text-center text-[17px] text-[var(--tk-ink-soft)]">
          <CakeSlice className="mx-auto mb-2 h-8 w-8 text-[var(--tk-ink-mute)]" strokeWidth={1.5} />
          {view === "past" ? "No pickups in the last 60 days." : "Nothing coming up. Website orders show here by themselves."}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-3">
            <h2
              className="tk-display px-1 text-[26px] leading-none"
              style={{ fontWeight: 600, color: g.tone === "alert" ? "var(--tk-warn)" : "var(--tk-charcoal)" }}
            >
              {g.title}
              <span className="ml-2 text-[16px] font-normal text-[var(--tk-ink-mute)]">{g.orders.length}</span>
            </h2>
            {g.orders.map((o) => (
              <OrderCard
                key={o.id}
                o={o}
                siblingsNew={o.orderRef ? (newByOrder.get(o.orderRef) ?? 0) : 0}
                products={board.products}
                today={board.today}
                highlight={o.id === openId || (!!orderRef && o.orderRef === orderRef)}
              />
            ))}
          </section>
        ))
      )}

      <p className="px-1 text-[13px] leading-snug text-[var(--tk-ink-mute)]">
        Website orders come in on their own within about 10 minutes. Short notice means fewer than {MIN_NOTICE_DAYS} days between ordering and pickup.
      </p>

      <Alerts pushKey={board.pushKey} devices={board.pushDevices} />
    </div>
  )
}
