export const dynamic = "force-dynamic"

import Link from "next/link"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { submitPinReminder } from "../actions"

export default async function PinReminderPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sent = (await searchParams).sent === "1"
  const field =
    "mt-1.5 w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <KitchenLogo onDark />
      <h1 className="tk-display mt-8 text-center leading-none text-white" style={{ fontSize: "clamp(34px, 7vw, 52px)", fontWeight: 600, letterSpacing: "-0.035em" }}>
        Forgot your PIN?
      </h1>
      <p className="mt-3 max-w-sm text-center text-[16px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
        We email it to the address Tarte already has for you. Nowhere else.
      </p>

      <div className="mt-8 w-full max-w-[380px] rounded-[24px] bg-white p-6">
        {sent ? (
          <div className="text-[16px] leading-snug text-[var(--tk-charcoal)]">
            <strong>Check your email.</strong>
            <p className="mt-2 text-[var(--tk-ink-soft)]">
              If that last name and email match what we have on file, your PIN is on its way. It can take a minute. Nothing arrived? The email you gave is not the one on your record, so ask your manager.
            </p>
          </div>
        ) : (
          <form action={submitPinReminder}>
            <label className="block">
              <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>Last name</span>
              <input name="lastName" autoCapitalize="words" autoCorrect="off" spellCheck={false} required className={field} />
            </label>
            <label className="mt-4 block">
              <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>Your email (the one Deputy has)</span>
              <input name="email" type="email" autoCapitalize="none" autoCorrect="off" required className={field} />
            </label>
            <button type="submit" className="mt-5 w-full rounded-full px-6 py-3.5 text-[17px] font-semibold text-white" style={{ background: "var(--tk-charcoal)" }}>
              Email me my PIN
            </button>
          </form>
        )}
        <Link href="/staff-login" className="mt-4 block text-center text-[14px] text-[var(--tk-ink-soft)] underline">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
