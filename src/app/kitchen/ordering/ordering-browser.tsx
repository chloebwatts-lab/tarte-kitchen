"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowRight, Phone, Search, ShoppingBasket, Wheat, X } from "lucide-react"

// Content source: G's "Tarte ordering" doc, added 2026-08-05. Keep this
// page free of passwords or logins — the staff area is public.

interface Store {
  name: string
  note?: string
  items: string[]
}

const STORES: Store[] = [
  {
    name: "Kmart",
    items: [
      "A4 paper (A4 premium digital paper, 160gsm)",
      "Fly wiz",
      "Batteries",
      "Pens / sharpies",
      "Panadol",
      "Light globes",
      "Iced latte / juice glasses",
      "Washing gloves (cheaper here)",
    ],
  },
  { name: "Big W", items: ["Front door mats", "Wine glasses"] },
  { name: "IKEA", items: ["Tables and chairs"] },
  {
    name: "Bunnings",
    items: [
      "White dirty-dishes buckets",
      "Mop sticks",
      "Large squeegee",
      "Large handled floor scrubbers",
      "Locks",
      "Paint: Domino for outside walls",
      "Paint: Natural White for all inside",
    ],
  },
  { name: "Plasdene", items: ["Tarte water jars", "Retail jars", "Lids"] },
  {
    name: "Commercial Kitchen Company",
    note: "Also our main equipment supplier. Call 1300 252 000 to check warranties on anything they supplied.",
    items: ["Tea pots", "Grill cleaner", "Kitchen pans etc."],
  },
  {
    name: "Mediterranean Markets",
    note: "All crockery.",
    items: [
      "Mugs",
      "Large and small cups",
      "Pastry plates",
      "Saucers",
      "Health bowls",
      "Milk jugs",
      "Piccolo cups",
    ],
  },
  {
    name: "Nisbets or AGC",
    note: "Check which is cheaper before ordering.",
    items: [
      "Kitchen plates: Olympia white, small FW813, large FW814",
      "Large salad bowls",
      "Chopping boards",
      "Bins",
      "Graters",
      "Tongs",
    ],
  },
  { name: "Spotlight", items: ["Cutlery"] },
  {
    name: "Ink Station (printer toner)",
    note: "Search HL-L3240CDW at inkstation.com.au. Usually 2 sets at a time, roughly $380.",
    items: ["Brother HL-L3240CDW toner sets"],
  },
]

interface Contact {
  name: string
  detail?: string
  phone: string
  tel: string
}

const CONTACTS: Contact[] = [
  { name: "Bread supply", phone: "0450 767 277", tel: "+61450767277" },
  { name: "Provedores", detail: "Mitch", phone: "0414 980 062", tel: "+61414980062" },
  {
    name: "Bid Food",
    detail: "Office. David 0438 640 259, Judi 0424 625 256.",
    phone: "5593 4443",
    tel: "+61755934443",
  },
  {
    name: "Grease traps (JJs)",
    detail: "Emptied every 12 weeks.",
    phone: "(07) 5539 4226",
    tel: "+61755394226",
  },
  { name: "Pest control", detail: "Brian", phone: "0488 996 337", tel: "+61488996337" },
]

const BREAD_KEYWORDS =
  "bread gluten free gf soy egg allergen allergy vegan sourdough ingredients starches maize rice soy protein egg white thickeners"

const QUICK_SEARCHES = ["Paint", "Toner", "Plates", "Crockery", "Gloves", "Pest"]

function norm(s: string) {
  return s.toLowerCase().normalize("NFKD")
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = norm(text).indexOf(norm(q))
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[4px] bg-[var(--tk-gold-soft)] px-0.5 text-inherit">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function OrderingBrowser() {
  const [query, setQuery] = useState("")
  const q = query.trim()

  const { stores, contacts, showBread, total } = useMemo(() => {
    if (!q) {
      return {
        stores: STORES.map((s) => ({ ...s, matched: s.items })),
        contacts: CONTACTS,
        showBread: true,
        total: 0,
      }
    }
    const nq = norm(q)
    const stores = STORES.map((s) => {
      const storeHit = norm(s.name).includes(nq) || (s.note && norm(s.note).includes(nq))
      const matched = storeHit ? s.items : s.items.filter((it) => norm(it).includes(nq))
      return { ...s, matched }
    }).filter((s) => s.matched.length > 0)
    const contacts = CONTACTS.filter(
      (c) =>
        norm(c.name).includes(nq) ||
        (c.detail && norm(c.detail).includes(nq)) ||
        c.phone.replace(/\s/g, "").includes(nq.replace(/\s/g, ""))
    )
    const showBread = norm(BREAD_KEYWORDS).includes(nq)
    const total =
      stores.reduce((n, s) => n + s.matched.length, 0) + contacts.length + (showBread ? 1 : 0)
    return { stores, contacts, showBread, total }
  }, [q])

  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="sticky top-3 z-10">
        <div className="flex items-center gap-3 rounded-full border border-[var(--tk-line)] bg-white py-1.5 pl-5 pr-2 shadow-[0_6px_24px_rgba(60,62,63,0.08)]">
          <Search className="h-5 w-5 shrink-0 text-[var(--tk-ink-mute)]" strokeWidth={2} />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What are you looking for? Try squeegee, toner, plates…"
            className="h-12 w-full bg-transparent text-[17px] text-[var(--tk-charcoal)] outline-none placeholder:text-[var(--tk-ink-mute)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition hover:bg-[var(--tk-charcoal)] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!q && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 px-2">
            {QUICK_SEARCHES.map((s) => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                className="rounded-full border border-[var(--tk-line)] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[var(--tk-ink-soft)] transition hover:border-[var(--tk-sage)] hover:text-[var(--tk-charcoal)] active:scale-[0.97]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {q && (
          <div className="mt-2.5 px-2 text-[13px] font-semibold text-[var(--tk-ink-soft)]">
            {total === 0 ? "No matches" : `${total} match${total === 1 ? "" : "es"}`} for
            &ldquo;{q}&rdquo;
          </div>
        )}
      </div>

      {q && total === 0 && (
        <div className="rounded-[20px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center">
          <p className="text-[15px] font-semibold text-[var(--tk-charcoal)]">
            Nothing found for &ldquo;{q}&rdquo;.
          </p>
          <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">
            Try a different word (e.g. &ldquo;glasses&rdquo; instead of
            &ldquo;cups&rdquo;), or tell Chloe so it gets added here.
          </p>
        </div>
      )}

      {stores.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--tk-charcoal)]">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[10px]"
              style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
            >
              <ShoppingBasket className="h-5 w-5" strokeWidth={1.8} />
            </span>
            Where to buy
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {stores.map((s) => (
              <div
                key={s.name}
                className="rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="text-[17px] font-semibold text-[var(--tk-charcoal)]"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    <Highlight text={s.name} q={q} />
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--tk-bg)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[var(--tk-ink-soft)]">
                    {s.matched.length} item{s.matched.length === 1 ? "" : "s"}
                  </span>
                </div>
                {s.note && (
                  <p className="mt-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
                    <Highlight text={s.note} q={q} />
                  </p>
                )}
                <ul className="mt-2.5 space-y-1.5">
                  {s.matched.map((it) => (
                    <li
                      key={it}
                      className="flex gap-2 text-[14px] leading-snug text-[var(--tk-ink-soft)]"
                    >
                      <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--tk-sage)]" />
                      <span>
                        <Highlight text={it} q={q} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {contacts.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--tk-charcoal)]">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[10px]"
              style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
            >
              <Phone className="h-5 w-5" strokeWidth={1.8} />
            </span>
            Who to call
          </h2>
          <div className="space-y-2.5">
            {contacts.map((c) => (
              <a
                key={c.name}
                href={`tel:${c.tel}`}
                className="group flex min-h-[72px] items-center gap-4 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
                    <Highlight text={c.name} q={q} />
                  </div>
                  {c.detail && (
                    <div className="mt-0.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
                      <Highlight text={c.detail} q={q} />
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--tk-charcoal)]">
                  {c.phone}
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-sage-soft)] text-[var(--tk-sage)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
                  <Phone className="h-[16px] w-[16px]" />
                </div>
              </a>
            ))}
            {!q && (
              <Link
                href="/kitchen/fix"
                className="group flex items-center gap-4 rounded-[16px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
                    Plumbers, electricians and equipment techs
                  </div>
                  <div className="mt-0.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
                    Live in Something broken? so the right person (and warranty)
                    is suggested per machine.
                  </div>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
                  <ArrowRight className="h-[16px] w-[16px]" />
                </div>
              </Link>
            )}
          </div>
        </section>
      )}

      {showBread && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--tk-charcoal)]">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[10px]"
              style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
            >
              <Wheat className="h-5 w-5" strokeWidth={1.8} />
            </span>
            Bread facts
          </h2>
          <div className="rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-4">
            <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
              Gluten free bread contains SOY and EGG
            </div>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--tk-ink-soft)]">
              Full ingredients: Starches (Maize, Rice), Modified Starch (1403),
              Soy Protein, Rice Flour, Egg White, Sugar, Soy Flour, Thickeners
              (464, 412), Iodised Salt, Dextrose.
            </p>
            <div className="mt-3 border-t border-[var(--tk-line)] pt-3 text-[14px] text-[var(--tk-ink-soft)]">
              Our sourdough is{" "}
              <span className="font-semibold text-[var(--tk-charcoal)]">vegan</span>.
            </div>
          </div>
        </section>
      )}

      {!q && (
        <p className="px-1 text-[13px] text-[var(--tk-ink-mute)]">
          Something to add or a number that changed? Tell Chloe and it gets
          updated here for everyone.
        </p>
      )}
    </div>
  )
}
