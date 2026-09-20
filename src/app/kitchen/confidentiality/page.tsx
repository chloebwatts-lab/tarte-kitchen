export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { DeedReader } from "@/components/kitchen/DeedReader"
import {
  DEED_EXECUTION,
  DEED_INTRO,
  DEED_SECTIONS,
  DEED_TITLE,
  DEED_VERSION,
  TARTE_ENTITIES,
} from "@/lib/confidentiality/deed"
import { getPerson } from "@/lib/person-session"

export default async function ConfidentialityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const next = typeof sp.next === "string" ? sp.next : "/staffaccess"
  const person = await getPerson()
  if (!person) redirect(`/staff-login?next=${encodeURIComponent("/kitchen/confidentiality")}`)
  if (person.deed === DEED_VERSION) redirect(next)

  return (
    <div className="mx-auto max-w-[760px] space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <KitchenLogo />
        <span className="text-[13px] text-[var(--tk-ink-soft)]">Signed in as {person.name}</span>
      </div>

      <div>
        <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>Before you start, once only</div>
        <h1 className="tk-display mt-1 text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05 }}>
          {DEED_TITLE}
        </h1>
        <p className="mt-2 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Everything in this app is how Tarte works: recipes, portions, prices, numbers. Read this, then sign at the bottom. It takes about three minutes and you get a copy by email.
        </p>
      </div>

      <DeedReader next={next} failed={sp.error === "1"}>
        <div className="space-y-5 rounded-[20px] border border-[var(--tk-line)] bg-white p-5 text-[16px] leading-relaxed text-[var(--tk-charcoal)] sm:p-7">
          <p className="font-semibold">Given by {person.name}.</p>
          {DEED_INTRO.map((p) => <p key={p}>{p}</p>)}
          <ul className="list-disc space-y-1 pl-5 text-[15px] text-[var(--tk-ink-soft)]">
            {TARTE_ENTITIES.map((e) => <li key={e}>{e}</li>)}
          </ul>
          {DEED_SECTIONS.map((s) => (
            <section key={s.heading} className="space-y-2">
              <h2 className="pt-2 text-[18px] font-semibold">{s.heading}</h2>
              {s.paragraphs.map((p) => <p key={p}>{p}</p>)}
              {s.bullets && (
                <ul className="list-disc space-y-1.5 pl-5">
                  {s.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
              {s.after?.map((p) => <p key={p}>{p}</p>)}
            </section>
          ))}
          <p className="border-t border-[var(--tk-line)] pt-4 font-medium">{DEED_EXECUTION}</p>
          <p className="text-[12px] text-[var(--tk-ink-mute)]">Version {DEED_VERSION}</p>
        </div>
      </DeedReader>
    </div>
  )
}
