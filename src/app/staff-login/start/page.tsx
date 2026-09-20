export const dynamic = "force-dynamic"

import Link from "next/link"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { submitSetupRequest } from "../actions"

export default async function SetupStartPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const sent = sp.sent === "1"
  const expired = sp.expired === "1"
  const field =
    "mt-1.5 w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <KitchenLogo onDark />
      <h1 className="tk-display mt-8 text-center leading-none text-white" style={{ fontSize: "clamp(34px, 7vw, 52px)", fontWeight: 600, letterSpacing: "-0.035em" }}>
        Set up your sign in
      </h1>
      <p className="mt-3 max-w-sm text-center text-[16px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
        New here, or forgot your PIN? We email a link to the address Tarte
        already has for you. Sign the deed, then your PIN is emailed to you.
      </p>

      <div className="mt-8 w-full max-w-[380px] rounded-[24px] bg-white p-6">
        {sent ? (
          <div className="text-[16px] leading-snug text-[var(--tk-charcoal)]">
            <strong>Check your email.</strong>
            <p className="mt-2 text-[var(--tk-ink-soft)]">
              If that last name and email match what we have on file, a setup link is on its way. Open it on your phone. It works for an hour. Nothing arrived? The email you gave is not the one on your record, so ask your manager.
            </p>
          </div>
        ) : (
          <form action={submitSetupRequest}>
            {expired && (
              <p className="mb-4 rounded-[14px] px-4 py-3 text-[14px] font-medium" style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}>
                That link has run out. Ask for a new one below.
              </p>
            )}
            <label className="block">
              <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>Last name</span>
              <input name="lastName" autoCapitalize="words" autoCorrect="off" spellCheck={false} required className={field} />
            </label>
            <label className="mt-4 block">
              <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>Your email (the one Deputy has)</span>
              <input name="email" type="email" autoCapitalize="none" autoCorrect="off" required className={field} />
            </label>
            <button type="submit" className="mt-5 w-full rounded-full px-6 py-3.5 text-[17px] font-semibold text-white" style={{ background: "var(--tk-charcoal)" }}>
              Email me my link
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
