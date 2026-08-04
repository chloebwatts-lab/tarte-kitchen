import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, Phone, ShoppingBasket, Wheat, Wrench } from "lucide-react"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export const metadata: Metadata = { title: "Ordering & supplies" }

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
  {
    name: "Big W",
    items: ["Front door mats", "Wine glasses"],
  },
  {
    name: "IKEA",
    items: ["Tables and chairs"],
  },
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
  {
    name: "Plasdene",
    items: ["Tarte water jars", "Retail jars", "Lids"],
  },
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
  {
    name: "Spotlight",
    items: ["Cutlery"],
  },
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
  /** tel: target, digits only with country code */
  tel: string
}

const CONTACTS: Contact[] = [
  { name: "Bread supply", phone: "0450 767 277", tel: "+61450767277" },
  {
    name: "Provedores",
    detail: "Mitch",
    phone: "0414 980 062",
    tel: "+61414980062",
  },
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
  {
    name: "Pest control",
    detail: "Brian",
    phone: "0488 996 337",
    tel: "+61488996337",
  },
]

export default function OrderingPage() {
  return (
    <div className="space-y-8">
      <KitchenBreadcrumb
        crumbs={[{ label: "Venues", href: "/kitchen" }, { label: "Ordering & supplies" }]}
      />

      <div>
        <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
          Staff reference
        </div>
        <h1
          className="tk-display leading-[1.05] text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}
        >
          Ordering &amp; supplies
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-[var(--tk-ink-soft)]">
          Where we buy what, and who to call. For broken equipment use{" "}
          <Link href="/kitchen/fix" className="font-semibold underline">
            Something broken?
          </Link>{" "}
          instead, it knows warranties and the right tech per machine.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--tk-charcoal)]">
          <ShoppingBasket className="h-5 w-5 text-[var(--tk-sage)]" strokeWidth={1.8} />
          Where to buy
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {STORES.map((s) => (
            <div
              key={s.name}
              className="rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-4"
            >
              <div
                className="text-[17px] font-semibold text-[var(--tk-charcoal)]"
                style={{ letterSpacing: "-0.01em" }}
              >
                {s.name}
              </div>
              {s.note && (
                <p className="mt-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
                  {s.note}
                </p>
              )}
              <ul className="mt-2 space-y-1">
                {s.items.map((it) => (
                  <li
                    key={it}
                    className="flex gap-2 text-[14px] leading-snug text-[var(--tk-ink-soft)]"
                  >
                    <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--tk-sage)]" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--tk-charcoal)]">
          <Phone className="h-5 w-5 text-[var(--tk-sage)]" strokeWidth={1.8} />
          Who to call
        </h2>
        <div className="space-y-2.5">
          {CONTACTS.map((c) => (
            <a
              key={c.name}
              href={`tel:${c.tel}`}
              className="group flex items-center gap-4 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
                  {c.name}
                </div>
                {c.detail && (
                  <div className="mt-0.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
                    {c.detail}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--tk-charcoal)]">
                {c.phone}
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tk-sage-soft)] text-[var(--tk-sage)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
                <Phone className="h-[16px] w-[16px]" />
              </div>
            </a>
          ))}
          <Link
            href="/kitchen/fix"
            className="group flex items-center gap-4 rounded-[16px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
                Plumbers, electricians and equipment techs
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
                Live in Something broken? so the right person (and warranty) is
                suggested per machine.
              </div>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
              <ArrowRight className="h-[16px] w-[16px]" />
            </div>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--tk-charcoal)]">
          <Wheat className="h-5 w-5 text-[var(--tk-sage)]" strokeWidth={1.8} />
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
            Our sourdough is <span className="font-semibold text-[var(--tk-charcoal)]">vegan</span>.
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2 text-[13px] text-[var(--tk-ink-mute)]">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
        <p>
          Something to add or a number that changed? Tell Chloe and it gets
          updated here for everyone.
        </p>
      </div>
    </div>
  )
}
