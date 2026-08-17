export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { STAFF_SESSION_DAYS } from "@/lib/staff-auth"
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
        Sign in once on this device. It stays signed in for{" "}
        {STAFF_SESSION_DAYS} days.
      </p>

      <form
        action={submitStaffLogin}
        className="mt-8 w-full max-w-[380px] rounded-[24px] bg-white p-6"
      >
        <input type="hidden" name="next" value={next} />

        <label className="block">
          <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
            Username
          </span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="mt-1.5 w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
          />
        </label>

        <label className="mt-4 block">
          <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
            Password
          </span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1.5 w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
          />
        </label>

        {failed && (
          <p
            className="mt-4 rounded-[14px] px-4 py-3 text-[14px] font-medium"
            style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
          >
            That username and password didn&apos;t match. Try again.
          </p>
        )}

        <button
          type="submit"
          className="mt-5 w-full rounded-full px-6 py-3.5 text-[17px] font-semibold text-white"
          style={{ background: "var(--tk-charcoal)" }}
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
