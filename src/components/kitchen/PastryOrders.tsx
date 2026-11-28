"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  addManualOrder,
  getScanConnection,
  markPickedUp,
  resolveFlag,
  saveChangeNote,
  setOutcome,
  type ManualOrderInput,
  type PastryBoard,
} from "@/lib/actions/pastry-orders"
import { saveCakePush } from "@/lib/actions/cake-orders"
import {
  CHANNELS,
  PAYMENTS,
  PASTRY_VENUES,
  STATE_LABEL,
  actionTone,
  addDays,
  byVenue,
  cakeLabel,
  cakeStrips,
  cardTag,
  countCards,
  dayHeading,
  groupCards,
  inNext7,
  isCake,
  longDay,
  niceTime,
  plain,
  searchCards,
  showCards,
  toMake,
  todayLine,
  unseenEntries,
  type PastryCard,
  type PastryLogEntry,
  type ShowKey,
  type VenueFilter,
} from "@/lib/pastry-orders/shared"

/**
 * Pastry Orders (Shawna, 28 Nov 2026): her Claude tracker rebuilt inside
 * Staff tools so staff can open it with their own sign in. Same look and
 * the same features; the name on every action is the person signed in and
 * manager-only steps are checked on the server (no shared PIN).
 */

const SEEN_KEY = "tk_pastry_orders_seen"
const VENUE_KEY = "tk_pastry_orders_venue"

const CSS = `
.po{--po-bg:#B4C5C1;--po-card:#FBFBF9;--po-ink:#3B3B3B;--po-mute:#6E6E6A;--po-green:#3F6B4F;--po-amber:#B45309;--po-red:#B42318;--po-gold:#C9962E;--po-goldfill:#FBF4E4;--po-goldink:#9A6B12;--po-line:#D5DAD7;
  background:var(--po-bg);color:var(--po-ink);margin:-20px -24px;padding:20px 16px 48px;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.35}
@media(min-width:768px){.po{margin:-32px -40px;padding:28px 24px 64px}}
.po *{box-sizing:border-box}
.po-wrap{max-width:860px;margin:0 auto}
.po-serif{font-family:Georgia,'Times New Roman',serif;font-weight:700}
.po-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.po-mark{display:flex;align-items:center;gap:14px;color:#fff;text-decoration:none}
.po-mark b{font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:700;line-height:1}
.po-mark span{border-left:1px solid rgba(255,255,255,.6);padding-left:14px;font-size:14px;font-weight:700;letter-spacing:.22em}
.po-circle{position:relative;width:46px;height:46px;border-radius:50%;background:#fff;border:0;display:inline-flex;align-items:center;justify-content:center;font-size:20px;color:var(--po-ink);cursor:pointer}
.po-badge{position:absolute;top:-6px;right:-6px;min-width:22px;height:22px;border-radius:11px;background:var(--po-amber);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 6px}
.po-title{font-size:32px;color:#fff;text-align:center;margin:22px 0 10px}
@media(min-width:768px){.po-title{font-size:40px}}
.po-today{color:#fff;text-align:center;margin-bottom:10px}
.po-strip{background:var(--po-goldfill);border-left:6px solid var(--po-gold);border-radius:12px;padding:9px 14px;margin-bottom:8px;font-size:14px}
.po-strip b{color:var(--po-goldink)}
.po-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:12px 0 8px}
@media(min-width:640px){.po-tiles{grid-template-columns:repeat(4,1fr)}}
.po-tile{background:var(--po-card);border-radius:18px;padding:12px 8px;text-align:center;border:0;cursor:pointer;color:var(--po-ink);box-shadow:0 1px 2px rgba(0,0,0,.04)}
.po-tile strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.1}
.po-tile small{font-size:12px;color:var(--po-mute)}
.po-tile.amber strong{color:var(--po-amber)}
.po-checked{color:#fff;font-size:12px;margin:0 0 14px}
.po-card{background:var(--po-card);border-radius:22px;box-shadow:0 1px 2px rgba(0,0,0,.04);padding:18px 16px;margin-bottom:14px}
@media(min-width:768px){.po-card{border-radius:28px;padding:20px 22px}}
.po-card.cake{border-left:6px solid var(--po-gold)}
.po-card.dead{opacity:.55}
.po-caps{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--po-mute)}
.po-caps.gold{color:var(--po-goldink)}
.po-cakerow{display:flex;gap:12px;background:var(--po-goldfill);border-radius:14px;padding:10px 12px;margin-top:8px}
.po-cakerow .t{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:16px;min-width:62px}
.po-cakerow h4{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:17px;margin:0 0 3px}
.po-cakerow em{display:block;font-family:Georgia,'Times New Roman',serif;font-size:13.5px;margin-top:4px}
.po-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:600;color:#fff;white-space:nowrap}
.po-pill.Burleigh{background:#6F7F52}.po-pill.Currumbin{background:#4F6F86}
.po-status{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:600;border:1px solid currentColor;background:#fff;white-space:nowrap}
.po-status.confirmed,.po-status.pickedup{color:var(--po-green)}
.po-status.attention{color:var(--po-amber)}
.po-status.cancelled,.po-status.refunded,.po-status.notcollected{color:var(--po-red)}
.po-status.cakeb{color:var(--po-goldink);background:var(--po-goldfill);border-color:var(--po-gold)}
.po-tag{display:inline-block;background:var(--po-amber);color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em;border-radius:6px;padding:2px 6px}
.po-input,.po-select{width:100%;background:#fff;border:1px solid var(--po-line);border-radius:10px;padding:10px 12px;font-size:16px;color:var(--po-ink);font-family:inherit}
.po-select{border-radius:14px;font-weight:600;padding:12px}
.po-label{display:block;font-size:12.5px;font-weight:700;margin:0 0 4px}
.po-filters{display:grid;grid-template-columns:1.6fr 1fr;gap:10px;margin:12px 0}
.po-make{display:grid;grid-template-columns:1fr;gap:18px}
@media(min-width:560px){.po-make{grid-template-columns:1fr 1fr}}
.po-make li{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #ECEDE9;font-family:Georgia,'Times New Roman',serif}
.po-make li:last-child{border-bottom:0}
.po-make li b{min-width:30px;text-align:right}
.po-make ul{list-style:none;margin:6px 0 0;padding:0}
.po-order{display:grid;grid-template-columns:1fr;gap:6px}
@media(min-width:560px){.po-order{grid-template-columns:86px 1fr;gap:0 14px}}
.po-time{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:22px}
.po-name{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:20px}
.po-toprow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.po-ordno{font-size:12px;color:var(--po-mute)}
.po-lines{list-style:none;margin:8px 0 0;padding:0;font-family:Georgia,'Times New Roman',serif}
.po-lines li{display:flex;gap:10px;padding:2px 0}
.po-lines b{white-space:nowrap}
.po-flag{background:#F1E9DC;border-left:3px solid var(--po-amber);border-radius:6px;padding:8px 10px;margin-top:8px;font-family:Georgia,'Times New Roman',serif;font-size:14px}
.po-note{font-size:12.5px;color:var(--po-mute);margin-top:6px;font-family:Georgia,'Times New Roman',serif;word-break:break-word}
.po-note.red{color:var(--po-red)}.po-note.green{color:var(--po-green)}
.po-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:12px}
.po-btn{border:0;border-radius:18px;padding:10px 16px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--po-ink);color:#fff}
.po-btn.amber{background:var(--po-amber)}.po-btn.gold{background:var(--po-gold)}
.po-btn.light{background:#fff;color:var(--po-ink);border:1px solid var(--po-line)}
.po-btn:disabled{opacity:.5}
.po-link{background:none;border:0;padding:0;font:inherit;font-size:14px;text-decoration:underline;color:var(--po-ink);cursor:pointer}
.po-dayhead{color:#fff;font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:20px;margin:18px 4px 8px}
.po-dayhead small{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-weight:500;font-size:13px;margin-left:8px}
.po-over{position:fixed;inset:0;background:rgba(40,44,44,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}
.po-sheet{background:var(--po-card);border-radius:22px;padding:20px 18px;width:100%;max-width:620px;margin:24px 0}
.po-sheet h3{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:24px;margin:0 0 12px}
.po-menu{position:absolute;right:0;top:54px;background:#fff;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px;min-width:230px;z-index:40}
.po-menu button{display:block;width:100%;text-align:left;background:none;border:0;padding:12px 14px;font-size:16px;border-radius:10px;cursor:pointer;color:var(--po-ink);font-family:inherit}
.po-menu button:hover{background:#F1F3F1}
.po-banner{position:fixed;left:12px;right:12px;bottom:14px;z-index:70;background:var(--po-ink);color:#fff;border-radius:16px;padding:12px 14px;display:flex;gap:12px;align-items:center;justify-content:space-between;max-width:620px;margin:0 auto}
.po-logrow{padding:10px 0;border-bottom:1px solid #ECEDE9}
.po-tone-green{color:var(--po-green)}.po-tone-amber{color:var(--po-amber)}.po-tone-red{color:var(--po-red)}.po-tone-ink{color:var(--po-ink)}
.po-chip{display:inline-block;background:#EEF1EF;border-radius:999px;padding:2px 9px;font-size:12.5px;margin:2px 4px 0 0}
.po-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.po-err{color:var(--po-red);font-size:14px;margin-top:8px}
.po-pre{background:#fff;border:1px solid var(--po-line);border-radius:10px;padding:10px;font-size:12.5px;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Menlo,monospace;max-height:320px;overflow:auto}
@media print{
  .po{background:#fff!important;margin:0;padding:0}
  .po-noprint,.tk-root>*:not(.mx-auto),.po-actions,.po-banner{display:none!important}
  .po-title,.po-dayhead,.po-today{color:#000!important}
  .po-card{box-shadow:none;border:1px solid #ccc;break-inside:avoid}
}
`

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const b64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : "")

const stamp = (iso: string) => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }).format(new Date(t))
}

type Panel = null | "menu" | "bell" | "add" | "log" | "full" | "scan" | "alerts"
type Ask = null | { key: string; kind: "notcollected" | "cancelled" | "refunded" | "changed" | "resolve" | "more" }

export function PastryOrders({ board, initialQuery }: { board: PastryBoard; initialQuery: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [show, setShow] = useState<ShowKey>("today")
  const [venue, setVenue] = useState<VenueFilter>("Both")
  const [q, setQ] = useState(initialQuery)
  const [panel, setPanel] = useState<Panel>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [seenAt, setSeenAt] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(0)
  const [arrived, setArrived] = useState<PastryLogEntry[]>([])
  const known = useRef<Set<string> | null>(null)

  // Device memory: when this person last looked at the bell, and their venue.
  useEffect(() => {
    try {
      const s = Number(localStorage.getItem(SEEN_KEY))
      setSeenAt(s > 0 ? s : null)
      const v = localStorage.getItem(VENUE_KEY)
      if (v === "Burleigh" || v === "Currumbin") setVenue(v)
    } catch {}
    setNowMs(Date.now())
    const t = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(t)
  }, [router])

  // Entries that arrive while the page is open raise the dark banner.
  useEffect(() => {
    const ids = new Set(board.log.map((e) => e.id))
    if (known.current) {
      const fresh = board.log.filter((e) => !known.current!.has(e.id) && e.by !== board.me.name)
      if (fresh.length) setArrived((a) => [...fresh, ...a].slice(0, 5))
    }
    known.current = ids
  }, [board.log, board.me.name])

  const today = board.today
  const allCards = useMemo(() => groupCards(board.lines), [board.lines])
  const cards = useMemo(() => byVenue(allCards, venue), [allCards, venue])
  const counts = useMemo(() => countCards(cards, today), [cards, today])
  const unseen = useMemo(() => (nowMs ? unseenEntries(board.log, seenAt, nowMs) : []), [board.log, seenAt, nowMs])
  const strips = useMemo(() => cakeStrips(cards, today), [cards, today])
  const weekCakes = useMemo(() => cards.filter((c) => c.cake && !c.dead && inNext7(c.date, today)), [cards, today])

  const searching = q.trim().length > 0
  const listed = searching ? searchCards(cards, q) : showCards(cards, show, today)
  const multiDay = searching || !(show === "today" || show === "tomorrow" || show.startsWith("day:"))
  const makeDay = show === "today" ? today : show === "tomorrow" ? addDays(today, 1) : show.startsWith("day:") ? show.slice(4) : null
  const makeCards = show === "next7" ? showCards(cards, "next7", today) : makeDay !== null ? cards.filter((c) => c.date === makeDay) : null
  const makeCols = makeCards ? toMake(makeCards, venue) : null

  function pickVenue(v: VenueFilter) {
    setVenue(v)
    try {
      localStorage.setItem(VENUE_KEY, v)
    } catch {}
  }

  function markSeen() {
    const t = Date.now()
    setSeenAt(t)
    setNowMs(t)
    try {
      localStorage.setItem(SEEN_KEY, String(t))
    } catch {}
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("")
    start(async () => {
      const r = await fn()
      if (!r.ok) {
        setError(r.error)
        return
      }
      setAsk(null)
      setNote("")
      router.refresh()
    })
  }

  function openAsk(a: Ask) {
    setError("")
    setNote("")
    setAsk(a)
  }

  function card(c: PastryCard) {
    const tag = cardTag(c.order, unseen)
    const mine = ask?.key === c.key ? ask : null
    const first = c.lines[0]
    const outcome = c.lines.find((l) => l.staffStatus)
    const picked = c.lines.find((l) => l.pickedUp)
    return (
      <div key={c.key} className={`po-card${c.cake ? " cake" : ""}${c.dead ? " dead" : ""}`}>
        <div className="po-order">
          <div className="po-time">{niceTime(c.time) || "No time"}</div>
          <div>
            <div className="po-toprow">
              {tag && <span className="po-tag">{tag}</span>}
              <span className="po-name">{c.customer || "No name"}</span>
              {c.venue && <span className={`po-pill ${c.venue}`}>{c.venue}</span>}
              {c.cake && <span className="po-status cakeb">Celebration cake</span>}
              <span className={`po-status ${c.state}`}>{STATE_LABEL[c.state]}</span>
              <span className="po-ordno">#{c.order}</span>
            </div>
            <ul className="po-lines">
              {c.lines.map((l) => (
                <li key={l.id}>
                  <b>{l.qty} ×</b>
                  <span>{plain(l.item, 300)}</span>
                </li>
              ))}
            </ul>
            {c.flags.map((f) => (
              <div key={f} className="po-flag">
                {f}
              </div>
            ))}
            {c.resolved && c.flags.length === 0 && (
              <div className="po-note green">
                Flag resolved by {c.resolved.by}
                {c.resolved.at ? `, ${stamp(c.resolved.at)}` : ""}: {plain(c.resolved.note)}
              </div>
            )}
            {c.changeNote && <div className="po-note">Changed: {plain(c.changeNote)}</div>}
            {c.notes.map((n) => (
              <div key={n} className="po-note">
                {n}
              </div>
            ))}
            {c.contact && <div className="po-note">{c.contact}</div>}
            <div className="po-note">{c.sourceLine}</div>
            {picked && c.state === "pickedup" && (
              <div className="po-note green">
                Picked up, ticked by {picked.pickedUpBy}
                {picked.pickedUpAt ? `, ${stamp(picked.pickedUpAt)}` : ""}
              </div>
            )}
            {outcome && (
              <div className="po-note red">
                {STATE_LABEL[outcome.staffStatus as "cancelled" | "refunded" | "notcollected"]} by {outcome.staffStatusBy}
                {outcome.staffStatusAt ? `, ${stamp(outcome.staffStatusAt)}` : ""}
                {outcome.staffStatusNote ? `: ${plain(outcome.staffStatusNote)}` : ""}
              </div>
            )}

            <div className="po-actions">
              {c.state === "pickedup" ? (
                <button className="po-link" disabled={pending} onClick={() => run(() => markPickedUp(c.order, c.date, true))}>
                  Undo pickup
                </button>
              ) : outcome ? (
                (outcome.staffStatus === "notcollected" || board.me.manager) && (
                  <button className="po-link" disabled={pending} onClick={() => run(() => setOutcome(c.order, c.date, "", "", true))}>
                    Undo {STATE_LABEL[outcome.staffStatus as "cancelled"].toLowerCase()}
                  </button>
                )
              ) : (
                <>
                  <button className="po-btn" disabled={pending} onClick={() => run(() => markPickedUp(c.order, c.date))}>
                    ✓ Picked up
                  </button>
                  {c.flags.length > 0 && board.me.manager && (
                    <button className="po-btn amber" disabled={pending} onClick={() => openAsk({ key: c.key, kind: "resolve" })}>
                      Resolve flag
                    </button>
                  )}
                  <button className="po-link" onClick={() => openAsk(mine?.kind === "more" ? null : { key: c.key, kind: "more" })}>
                    More options
                  </button>
                </>
              )}
              {c.resolved && c.flags.length === 0 && board.me.manager && (
                <button className="po-link" disabled={pending} onClick={() => run(() => resolveFlag(c.order, c.date, "", true))}>
                  Undo flag resolve
                </button>
              )}
              {c.changeNote && !outcome && c.state !== "pickedup" && (
                <button className="po-link" onClick={() => openAsk({ key: c.key, kind: "changed" })}>
                  Edit again
                </button>
              )}
            </div>

            {mine?.kind === "more" && (
              <div className="po-actions">
                <button className="po-btn light" onClick={() => openAsk({ key: c.key, kind: "notcollected" })}>
                  Not collected
                </button>
                <button className="po-btn light" onClick={() => openAsk({ key: c.key, kind: "changed" })}>
                  Changed / swapped
                </button>
                {board.me.manager ? (
                  <>
                    <button className="po-btn light" onClick={() => openAsk({ key: c.key, kind: "cancelled" })}>
                      Cancelled
                    </button>
                    <button className="po-btn light" onClick={() => openAsk({ key: c.key, kind: "refunded" })}>
                      Refunded
                    </button>
                  </>
                ) : (
                  <span className="po-note">Cancel and refund: ask a manager or supervisor.</span>
                )}
              </div>
            )}
            {mine && mine.kind !== "more" && (
              <div style={{ marginTop: 10 }}>
                <label className="po-label">
                  {mine.kind === "changed" ? "What changed?" : mine.kind === "resolve" ? "What was done?" : mine.kind === "notcollected" ? "Note (what happened)" : "Note"}
                </label>
                <input className="po-input" value={note} onChange={(e) => setNote(e.target.value)} autoFocus maxLength={400} />
                <div className="po-note">Saved as {board.me.name}.</div>
                <div className="po-actions">
                  <button
                    className="po-btn"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        mine.kind === "changed"
                          ? saveChangeNote(c.order, c.date, note)
                          : mine.kind === "resolve"
                            ? resolveFlag(c.order, c.date, note)
                            : setOutcome(c.order, c.date, mine.kind, note)
                      )
                    }
                  >
                    {mine.kind === "changed" ? "Save change" : mine.kind === "resolve" ? "Resolve flag" : `Mark ${STATE_LABEL[mine.kind as "cancelled"].toLowerCase()}`}
                  </button>
                  <button className="po-link" onClick={() => setAsk(null)}>
                    Close
                  </button>
                </div>
              </div>
            )}
            {ask?.key === c.key && error && <div className="po-err">{error}</div>}
            {first.source === "Manual" && first.updatedAt && <div className="po-note">Added {stamp(first.updatedAt)}</div>}
          </div>
        </div>
      </div>
    )
  }

  const days = [...new Set(listed.map((c) => c.date))]
  const pickDays = counts.days.filter((d) => d.day)

  return (
    <div className="po">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="po-wrap">
        <div className="po-head po-noprint" style={{ position: "relative" }}>
          <Link href="/kitchen/pastry" className="po-mark" replace>
            <b>Tarte.</b>
            <span>KITCHEN</span>
          </Link>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="po-circle" aria-label="Updates" onClick={() => setPanel(panel === "bell" ? null : "bell")}>
              🔔{unseen.length > 0 && <span className="po-badge">{unseen.length}</span>}
            </button>
            <button className="po-circle" aria-label="Menu" onClick={() => setPanel(panel === "menu" ? null : "menu")}>
              ☰
            </button>
          </div>
          {panel === "menu" && (
            <div className="po-menu">
              <button onClick={() => setPanel("add")}>Add an order</button>
              <button onClick={() => setPanel("log")}>Activity log</button>
              <button onClick={() => setPanel("full")}>Full order list</button>
              <button
                onClick={() => {
                  setPanel(null)
                  setTimeout(() => window.print(), 150)
                }}
              >
                Print this view
              </button>
              <button onClick={() => setPanel("alerts")}>Phone alerts</button>
              {board.me.owner && <button onClick={() => setPanel("scan")}>Scan connection</button>}
            </div>
          )}
        </div>

        <h1 className="po-serif po-title">Pastry Orders</h1>
        <div className="po-today">{todayLine(cards, today)}</div>
        {strips.map((s) => (
          <div key={`${s.when}${s.key}`} className="po-strip">
            <b>{s.when}:</b> {s.text}
          </div>
        ))}

        <div className="po-tiles po-noprint">
          <button className="po-tile" onClick={() => (setQ(""), setShow("today"))}>
            <strong>{counts.today}</strong>
            <small>Pickups today</small>
          </button>
          <button className="po-tile" onClick={() => (setQ(""), setShow("tomorrow"))}>
            <strong>{counts.tomorrow}</strong>
            <small>Pickups tomorrow</small>
          </button>
          <button className="po-tile" onClick={() => (setQ(""), setShow("cakes"))}>
            <strong>{counts.cakes}</strong>
            <small>Celebration cakes</small>
          </button>
          <button className="po-tile amber" onClick={() => (setQ(""), setShow("attention"))}>
            <strong>{counts.attention}</strong>
            <small>Need attention</small>
          </button>
        </div>
        <p className="po-checked po-noprint">{board.scanLabel ? `Inbox last checked ${board.scanLabel}` : "Inbox scan has not reported here yet"}</p>

        <div className="po-card cake po-noprint">
          <div className="po-caps gold">Celebration cakes</div>
          <div className="po-serif" style={{ fontSize: 24, margin: "2px 0 6px" }}>
            Cakes this week
          </div>
          {weekCakes.length === 0 && <div className="po-note">No celebration cakes in the next 7 days.</div>}
          {[...new Set(weekCakes.map((c) => c.date))].map((day) => (
            <div key={day} style={{ marginTop: 10 }}>
              <div className="po-caps gold">{dayHeading(day, today)}</div>
              {weekCakes
                .filter((c) => c.date === day)
                .map((c) => {
                  const what = c.lines
                    .filter((l) => isCake(l.item))
                    .map((l) => cakeLabel(plain(l.item, 200)))
                    .join(", ")
                  return (
                    <div key={c.key} className="po-cakerow">
                      <div className="t">{niceTime(c.time) || "No time"}</div>
                      <div>
                        <h4>{what.charAt(0).toUpperCase() + what.slice(1)}</h4>
                        <div style={{ fontSize: 13.5 }}>
                          {c.customer} #{c.order} {c.venue && <span className={`po-pill ${c.venue}`}>{c.venue}</span>}
                        </div>
                        {c.notes.map((n) => (
                          <em key={n}>{n}</em>
                        ))}
                        {c.flags.map((f) => (
                          <div key={f} style={{ color: "var(--po-amber)", fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>
                            Needs attention: {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            <button className="po-btn gold" onClick={() => (setQ(""), setShow("cakes"))}>
              See all upcoming cakes ({counts.cakes})
            </button>
          </div>
        </div>

        <input className="po-input po-noprint" style={{ borderRadius: 14 }} placeholder="Search name, order # or item" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="po-filters po-noprint">
          <div>
            <label className="po-label">Show</label>
            <select className="po-select" value={show} onChange={(e) => (setQ(""), setShow(e.target.value as ShowKey))}>
              <option value="today">Today ({counts.today})</option>
              <option value="tomorrow">Tomorrow ({counts.tomorrow})</option>
              <option value="next7">Next 7 days ({counts.next7})</option>
              <option value="cakes">Celebration cakes ({counts.cakes})</option>
              <option value="attention">Needs attention ({counts.attention})</option>
              <option value="all">All upcoming ({counts.all})</option>
              <optgroup label="Pick a day">
                {pickDays.map((d) => (
                  <option key={d.day} value={`day:${d.day}`}>
                    {longDay(d.day)} ({d.count})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="po-label">Venue</label>
            <select className="po-select" value={venue} onChange={(e) => pickVenue(e.target.value as VenueFilter)}>
              <option value="Both">Both</option>
              {PASTRY_VENUES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {!searching && show === "cakes" && (
          <div className="po-card">
            <div className="po-serif" style={{ fontSize: 22, marginBottom: 6 }}>
              Cakes booked
            </div>
            <div className="po-make">
              {(venue === "Both" ? [...PASTRY_VENUES] : [venue]).map((v) => (
                <div key={v}>
                  <div className="po-caps">
                    {v} ({listed.filter((c) => c.venue === v && !c.dead).length} cakes)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!searching && makeCols && (
          <div className="po-card">
            <div className="po-serif" style={{ fontSize: 22, marginBottom: 8 }}>
              To make {makeDay ? `for ${longDay(makeDay)}` : "in the next 7 days"}
            </div>
            <div className="po-make">
              {makeCols.map((col) => (
                <div key={col.venue}>
                  <div className="po-caps">
                    {col.venue} ({col.total} {col.total === 1 ? "item" : "items"})
                  </div>
                  <ul>
                    {col.items.map((i) => (
                      <li key={i.item}>
                        <b>{i.qty}</b>
                        <span>{i.item}</span>
                      </li>
                    ))}
                    {col.items.length === 0 && <li style={{ color: "var(--po-mute)" }}>Nothing to make</li>}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {listed.length === 0 && (
          <div className="po-card" style={{ textAlign: "center", color: "var(--po-mute)" }}>
            {searching ? "No open order matches that search." : "No orders here."}
          </div>
        )}
        {days.map((day) => {
          const here = listed.filter((c) => c.date === day)
          return (
            <div key={day || "none"}>
              {multiDay && (
                <div className="po-dayhead">
                  {day ? longDay(day) : "No date yet"}
                  <small>
                    {here.length} {here.length === 1 ? "order" : "orders"}
                  </small>
                </div>
              )}
              {here.map((c) => card(c))}
            </div>
          )
        })}
        {error && !ask && <div className="po-card po-err">{error}</div>}
      </div>

      {panel === "bell" && (
        <Sheet title="Updates" onClose={() => setPanel(null)}>
          {unseen.length === 0 && <div className="po-note">Nothing new since you last looked.</div>}
          {unseen.map((e) => (
            <LogRow key={e.id} e={e} />
          ))}
          <div className="po-actions">
            <button
              className="po-btn"
              onClick={() => {
                markSeen()
                setPanel(null)
              }}
            >
              Mark all as seen
            </button>
            <button className="po-link" onClick={() => setPanel("log")}>
              Full history
            </button>
          </div>
        </Sheet>
      )}
      {panel === "log" && <LogSheet log={board.log} onClose={() => setPanel(null)} />}
      {panel === "full" && (
        <Sheet title="Full order list" onClose={() => setPanel(null)}>
          <div className="po-note">Every open order, by day. Cancelled and refunded orders are left out.</div>
          {[...new Set(allCards.filter((c) => !c.dead).map((c) => c.date))].map((day) => (
            <div key={day || "none"} style={{ marginTop: 14 }}>
              <div className="po-caps">{day ? longDay(day) : "No date yet"}</div>
              {allCards
                .filter((c) => c.date === day && !c.dead)
                .map((c) => (
                  <div key={c.key} className="po-logrow">
                    <b className="po-serif">
                      {niceTime(c.time) || "No time"} {c.customer}
                    </b>{" "}
                    {c.venue && <span className={`po-pill ${c.venue}`}>{c.venue}</span>} <span className="po-ordno">#{c.order}</span>
                    <div>
                      {c.lines.map((l) => (
                        <span key={l.id} className="po-chip">
                          {l.qty} × {plain(l.item, 120)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </Sheet>
      )}
      {panel === "add" && <AddSheet board={board} venue={venue} onClose={() => setPanel(null)} onSaved={(order) => (setPanel(null), setQ(order), router.refresh())} />}
      {panel === "alerts" && <AlertsSheet board={board} onClose={() => setPanel(null)} />}
      {panel === "scan" && <ScanSheet onClose={() => setPanel(null)} />}

      {arrived.length > 0 && (
        <div className="po-banner po-noprint">
          <div>
            <b>{arrived[0].action}</b>: {arrived[0].customer || `#${arrived[0].order}`}
            {arrived.length > 1 ? ` and ${arrived.length - 1} more` : ""}
            <div style={{ fontSize: 13, opacity: 0.85 }}>{plain(arrived[0].detail, 120)}</div>
          </div>
          <button className="po-btn light" onClick={() => setArrived([])}>
            OK
          </button>
        </div>
      )}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="po-over po-noprint" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="po-sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h3>{title}</h3>
          <button className="po-link" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function LogRow({ e }: { e: PastryLogEntry }) {
  return (
    <div className="po-logrow">
      <b className={`po-tone-${actionTone(e.action)}`}>{e.action}</b> <b>{e.customer}</b> {e.order && <span className="po-ordno">#{e.order}</span>}
      {e.detail && <div style={{ fontSize: 14 }}>{plain(e.detail, 600)}</div>}
      <div className="po-ordno">
        By {e.by || "unknown"}, {stamp(e.at)}
      </div>
    </div>
  )
}

function LogSheet({ log, onClose }: { log: PastryLogEntry[]; onClose: () => void }) {
  const [q, setQ] = useState("")
  const needle = q.trim().toLowerCase()
  const rows = needle ? log.filter((e) => `${e.customer} ${e.order} ${e.action} ${e.detail} ${e.by}`.toLowerCase().includes(needle)) : log
  return (
    <Sheet title="Activity log" onClose={onClose}>
      <input className="po-input" placeholder="Search the log" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="po-note">Newest first. Entries are never edited or deleted.</div>
      {rows.slice(0, 300).map((e) => (
        <LogRow key={e.id} e={e} />
      ))}
      {rows.length === 0 && <div className="po-note">Nothing found.</div>}
    </Sheet>
  )
}

function AddSheet({ board, venue, onClose, onSaved }: { board: PastryBoard; venue: VenueFilter; onClose: () => void; onSaved: (order: string) => void }) {
  const [d, setD] = useState<ManualOrderInput>({
    customer: "",
    contact: "",
    venue: venue === "Both" ? "" : venue,
    channel: "In store",
    date: "",
    time: "",
    items: [{ item: "", qty: 1 }],
    notes: "",
    payment: "",
  })
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const set = (patch: Partial<ManualOrderInput>) => setD((x) => ({ ...x, ...patch }))
  const setItem = (i: number, patch: Partial<{ item: string; qty: number | string }>) => set({ items: d.items.map((it, n) => (n === i ? { ...it, ...patch } : it)) })
  return (
    <Sheet title="Add an order" onClose={onClose}>
      <datalist id="po-items">
        {board.suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <label className="po-label">Customer *</label>
      <input className="po-input" value={d.customer} onChange={(e) => set({ customer: e.target.value })} />
      <label className="po-label" style={{ marginTop: 10 }}>
        Phone or email
      </label>
      <input className="po-input" value={d.contact} onChange={(e) => set({ contact: e.target.value })} />
      <div className="po-grid2" style={{ marginTop: 10 }}>
        <div>
          <label className="po-label">Venue *</label>
          <select className="po-input" value={d.venue} onChange={(e) => set({ venue: e.target.value })}>
            <option value="">Pick one</option>
            {PASTRY_VENUES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="po-label">How it came in</label>
          <select className="po-input" value={d.channel} onChange={(e) => set({ channel: e.target.value })}>
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="po-label">Pickup date *</label>
          <input className="po-input" type="date" min={board.today} value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <label className="po-label">Pickup time</label>
          <input className="po-input" type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} />
        </div>
      </div>
      <label className="po-label" style={{ marginTop: 10 }}>
        Items * (cake items start with &quot;Celebration cake&quot;)
      </label>
      {d.items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, marginBottom: 6 }}>
          <input className="po-input" type="number" min={1} inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} aria-label="Quantity" />
          <input className="po-input" list="po-items" value={it.item} onChange={(e) => setItem(i, { item: e.target.value })} placeholder="Item" />
        </div>
      ))}
      {d.items.length < 6 && (
        <button className="po-link" onClick={() => set({ items: [...d.items, { item: "", qty: 1 }] })}>
          Add another item
        </button>
      )}
      <label className="po-label" style={{ marginTop: 10 }}>
        Cake message, allergies, notes
      </label>
      <textarea className="po-input" rows={3} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      <label className="po-label" style={{ marginTop: 10 }}>
        Payment *
      </label>
      <select className="po-input" value={d.payment} onChange={(e) => set({ payment: e.target.value })}>
        <option value="">Pick one</option>
        {PAYMENTS.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <div className="po-note">Taken by {board.me.name} (your sign in).</div>
      {error && <div className="po-err">{error}</div>}
      <div className="po-actions">
        <button
          className="po-btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("")
              const r = await addManualOrder(d)
              if (!r.ok) setError(r.error)
              else onSaved(r.order ?? "")
            })
          }
        >
          Save order
        </button>
        <button className="po-link" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  )
}

function AlertsSheet({ board, onClose }: { board: PastryBoard; onClose: () => void }) {
  const [msg, setMsg] = useState("")
  const [working, setWorking] = useState(false)
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
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(board.pushKey as string) as BufferSource }))
      const label = /iPad/.test(navigator.userAgent) ? "iPad" : /iPhone/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Computer"
      const r = await saveCakePush({ endpoint: sub.endpoint, p256dh: b64(sub.getKey("p256dh")), auth: b64(sub.getKey("auth")), label })
      setMsg(r.ok ? "Done. A test alert is on its way to this device." : r.error)
    } catch {
      setMsg("That did not work on this device. Tell Shawna.")
    } finally {
      setWorking(false)
    }
  }
  return (
    <Sheet title="Phone alerts" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Turn this on to get an alert on this phone or iPad for a new order, a new flag, cakes due tomorrow (2pm the day before) and the morning prep summary (6:30am).
      </p>
      <div className="po-note">
        {board.pushDevices} {board.pushDevices === 1 ? "device has" : "devices have"} pastry alerts on. The same switch covers cake order alerts.
      </div>
      {board.pushKey ? (
        <div className="po-actions">
          <button className="po-btn" disabled={working} onClick={turnOn}>
            Turn on alerts on this device
          </button>
        </div>
      ) : (
        <div className="po-err">Alerts are not set up on this app yet.</div>
      )}
      {msg && <div className="po-note">{msg}</div>}
    </Sheet>
  )
}

function ScanSheet({ onClose }: { onClose: () => void }) {
  const [conn, setConn] = useState<{ url: string; token: string } | null>(null)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    getScanConnection().then((r) => (r.ok ? setConn({ url: r.url, token: r.token }) : setError(r.error)))
  }, [])
  const wording = conn
    ? `STAFF TOOLS COPY (do this at the end of EVERY run, after the tracker writes and before NOTIFY): send the Staff tools app a copy so staff see the same list. Build one JSON object: {"orders": [every document in collection orders, each with its doc id as "id" and all of its fields], "log": [every log document you wrote this run, each with its doc id as "id" and its fields], "scan": {"label": the same label you set on scan/latest}}. On the first run after this instruction was added, and on every 6pm run, put EVERY document in collection log in "log" instead of only this run's. Save the JSON to a file and send it with a shell command: curl -sS -X POST "${conn.url}" -H "Authorization: Bearer ${conn.token}" -H "Content-Type: application/json" --data-binary @file.json. A reply with "ok": true means it landed. Staff tools never deletes anything, keeps its own staff ticks and manual orders, and adds each log entry once, so sending the full list every run is safe. Never send anything else to that address. If the send fails or the reply is not ok, carry on with the rest of the run and include "Staff tools copy failed" in a push notification to Shawna.`
    : ""
  return (
    <Sheet title="Scan connection" onClose={onClose}>
      <p style={{ marginTop: 0 }}>Owners only. Add this paragraph to the &quot;Pastry orders scan&quot; scheduled task so each run also sends its orders and log here. It holds the key for this screen, so do not share it outside the scan.</p>
      {error && <div className="po-err">{error}</div>}
      {conn && (
        <>
          <div className="po-pre">{wording}</div>
          <div className="po-actions">
            <button
              className="po-btn"
              onClick={() => {
                navigator.clipboard?.writeText(wording).then(() => setCopied(true))
              }}
            >
              {copied ? "Copied" : "Copy the wording"}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
