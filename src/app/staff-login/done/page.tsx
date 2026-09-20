export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { DEED_VERSION } from "@/lib/confidentiality/deed"
import { callerIp } from "@/lib/login-guard"
import { getPerson } from "@/lib/person-session"
import { remindPin } from "@/lib/shifts-staff"

/** End of the setup link: deed is signed, so the PIN goes to their email. */
export default async function SetupDonePage() {
  const person = await getPerson()
  if (!person) redirect("/staff-login")
  if (person.deed !== DEED_VERSION) redirect(`/kitchen/confidentiality?next=${encodeURIComponent("/staff-login/done")}`)
  const canEmail = !!person.email && !!person.last
  if (canEmail) await remindPin(person.last!, person.email!, await callerIp(), true)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <KitchenLogo onDark />
      <h1 className="tk-display mt-8 text-center leading-none text-white" style={{ fontSize: "clamp(34px, 7vw, 52px)", fontWeight: 600, letterSpacing: "-0.035em" }}>
        All done, {person.name.split(" ")[0]}
      </h1>
      <div className="mt-8 w-full max-w-[400px] rounded-[24px] bg-white p-6 text-[16px] leading-snug text-[var(--tk-charcoal)]">
        <strong>Your deed is signed.</strong>
        <p className="mt-2 text-[var(--tk-ink-soft)]">
          {canEmail
            ? `Your PIN has been emailed to ${person.email}. From now on, sign in on any Tarte iPad or your phone with your last name and that PIN.`
            : "Ask your manager for your PIN. From now on, sign in with your last name and that PIN."}
        </p>
        <Link href="/staffaccess" className="mt-5 block w-full rounded-full px-6 py-3.5 text-center text-[17px] font-semibold text-white" style={{ background: "var(--tk-charcoal)" }}>
          Open Staff tools
        </Link>
      </div>
    </div>
  )
}
