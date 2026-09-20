export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { IDLE_MINUTES } from "@/lib/person-auth"
import { submitStaffLogin } from "./actions"

export const metadata: Metadata = {
  title: "Staff tools",
  robots: { index: false, follow: false },
}

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const failed = sp.error === "1"
  const locked = sp.error === "locked"
  const down = sp.error === "down"
  const next = typeof sp.next === "string" ? sp.next : "/staffaccess"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <KitchenLogo onDark />

      <h1
        className="tk-display mt-8 text-center leading-none text-white"
        style={{
          fontSize: "clamp(40px, 8vw, 64px)",
          fontWeight: 600,
          letterSpacing: "-0.035em",
        }}
      >
        Staff tools
      </h1>
      <p
        className="mt-3 max-w-sm text-center text-[16px] leading-snug"
        style={{ color: "rgba(255,255,255,0.85)" }}
      >
        Your own sign in, every time. Same last name and PIN you use on Tarte
        Shifts. It signs you out after {IDLE_MINUTES} minutes of nothing.
      </p>

      <form
        action={submitStaffLogin}
        className="mt-8 w-full max-w-[380px] rounded-[24px] bg-white p-6"
      >
        <input type="hidden" name="next" value={next} />

        <label className="block">
          <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
            Last name
          </span>
          <input
            name="lastName"
            autoComplete="off"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. Watts"
            required
            className="mt-1.5 w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
          />
        </label>

        <label className="mt-4 block">
          <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
            Your 4 digit PIN
          </span>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="off"
            required
            className="mt-1.5 w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[22px] tracking-[0.4em] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
          />
        </label>

        {locked && (
          <p
            className="mt-4 rounded-[14px] px-4 py-3 text-[14px] font-medium"
            style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
          >
            Too many wrong tries. Wait 15 minutes, then try again.
          </p>
        )}
        {down && (
          <p
            className="mt-4 rounded-[14px] px-4 py-3 text-[14px] font-medium"
            style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
          >
            Sign in is not reachable right now. Try again in a minute.
          </p>
        )}
        {failed && (
          <p
            className="mt-4 rounded-[14px] px-4 py-3 text-[14px] font-medium"
            style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
          >
            That name and PIN didn&apos;t match. It is the same PIN you clock
            in with. Ask your manager if you have forgotten it.
          </p>
        )}

        <button
          type="submit"
          className="mt-5 w-full rounded-full px-6 py-3.5 text-[17px] font-semibold text-white"
          style={{ background: "var(--tk-charcoal)" }}
        >
          Sign in
        </button>
        <p className="mt-4 text-center text-[12px] leading-snug text-[var(--tk-ink-mute)]">
          Everything in here is confidential to Tarte. Your sign in is
          personal to you and what you open is recorded.
        </p>
      </form>
    </div>
  )
}
