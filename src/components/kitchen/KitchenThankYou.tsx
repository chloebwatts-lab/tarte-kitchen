"use client"

import Link from "next/link"

/**
 * Full screen "Thank you :)" shown once an FOH daily clean is fully complete
 * (Oliver, 12 Nov 2026). One of the staff photos from the GM desk, picked at
 * random, so the team knows they are appreciated.
 */
export function KitchenThankYou({
  photoUrl,
  name,
  backHref,
  onClose,
}: {
  photoUrl: string
  name: string
  backHref: string
  onClose: () => void
}) {
  const first = name.trim().split(/\s+/)[0]
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Thank you"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-[var(--tk-bg)] px-5 py-8"
    >
      <div className="flex w-full max-w-[640px] flex-col items-center gap-6 text-center">
        <h1
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: "clamp(44px, 9vw, 72px)", fontWeight: 700, letterSpacing: "-0.03em" }}
        >
          Thank you{first ? `, ${first}` : ""} :)
        </h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt="The Tarte team"
          className="max-h-[58vh] w-auto max-w-full rounded-[22px] object-contain shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        />
        <div className="flex w-full max-w-[420px] flex-col gap-2.5">
          <Link
            href={backHref}
            className="block w-full rounded-[14px] bg-[var(--tk-charcoal)] px-4 py-4 text-center text-[16px] font-semibold text-white"
          >
            Back to checklists
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[14px] px-4 py-3 text-[14px] font-semibold text-[var(--tk-ink-soft)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
