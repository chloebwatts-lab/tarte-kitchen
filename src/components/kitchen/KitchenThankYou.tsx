"use client"

import Link from "next/link"

/**
 * Full screen "Thank you :)" shown once an FOH daily clean is fully complete
 * (Oliver, 12 Nov 2026). One of the staff photos from the GM desk, picked at
 * random, so the team knows they are appreciated.
 *
 * Chloe 13 Nov 2026: big words with plenty of room for the photo. On a
 * landscape iPad the words sit beside the photo so a portrait photo fills the
 * screen height; on a phone or portrait iPad they stack, photo underneath.
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
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--tk-bg)]"
    >
      <div className="flex min-h-full items-center justify-center px-5 py-8 md:px-10">
        {/* Phone / portrait: words, photo, buttons stacked (the words column
            is display:contents so `order` interleaves the photo). Landscape
            iPad: words + buttons on the left, photo on the right. */}
        <div className="flex w-full max-w-[1120px] flex-col items-center gap-6 text-center landscape:md:flex-row landscape:md:justify-center landscape:md:gap-12 landscape:md:text-left">
          <div className="contents landscape:md:flex landscape:md:min-w-0 landscape:md:flex-1 landscape:md:flex-col landscape:md:gap-8">
            <h1
              className="tk-display tk-hero-keep order-1 text-balance text-[length:clamp(52px,min(11vw,13vh),112px)] leading-[0.95] text-[var(--tk-charcoal)] landscape:md:text-[length:clamp(56px,min(7.5vw,12vh),104px)]"
              style={{ fontWeight: 700, letterSpacing: "-0.03em" }}
            >
              Thank you{first ? <>, <span className="whitespace-nowrap">{first} :)</span></> : " :)"}
            </h1>
            <div className="order-3 flex w-full max-w-[420px] flex-col gap-2.5">
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt="The Tarte team"
            className="order-2 max-h-[56vh] w-auto max-w-full shrink-0 rounded-[24px] object-contain shadow-[0_14px_44px_rgba(0,0,0,0.14)] landscape:md:max-h-[84vh] landscape:md:max-w-[56vw]"
          />
        </div>
      </div>
    </div>
  )
}
