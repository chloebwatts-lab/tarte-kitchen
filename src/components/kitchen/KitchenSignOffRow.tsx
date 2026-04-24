"use client"

import { Camera, Check } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Final sign-off row — mandatory photo step on every cleaning checklist.
 * Brand-locked: sage background, white text.
 *
 * This is a visual wrapper. The actual photo upload UI (file picker,
 * thumbnails, delete) is rendered inside `children` — pass the existing
 * ChecklistPhotoUpload here so the server-action contract is preserved.
 */
export function KitchenSignOffRow({
  title = "Sign-off photo of the finished station",
  hint = "Every cleaning checklist ends with a photo for the manager. Frame the whole area.",
  satisfied = false,
  children,
}: {
  title?: string
  hint?: string
  satisfied?: boolean
  children: ReactNode
}) {
  return (
    <div
      className="rounded-[18px] p-6"
      style={{ background: "var(--tk-sage)", color: "#ffffff" }}
    >
      <div className="flex items-center gap-5">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px]"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          {satisfied ? (
            <Check className="h-8 w-8" strokeWidth={2.6} />
          ) : (
            <Camera className="h-8 w-8" strokeWidth={1.8} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="tk-caps"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            Final sign-off
          </div>
          <div
            className="mt-1 text-[19px] font-semibold leading-snug"
            style={{ letterSpacing: "-0.01em" }}
          >
            {title}
          </div>
          <p
            className="mt-1 text-[14px] leading-snug"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {hint}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-[14px] bg-white/95 p-4 text-[var(--tk-ink)]">
        {children}
      </div>
    </div>
  )
}
