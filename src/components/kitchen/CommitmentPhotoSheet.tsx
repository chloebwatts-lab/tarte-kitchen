"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2, X } from "lucide-react"
import {
  deleteCommitmentPhoto,
  saveCommitmentPhoto,
  type CommitmentPhotoRow,
} from "@/lib/actions/commitments"
import { PHOTO_KINDS, photoKindLabel } from "@/lib/commitments/shared"

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

/** Same downscale trick as checklist evidence photos: a paper sheet
 *  doesn't need 12MP to be readable. */
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

async function compressImage(file: File): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error("decode failed"))
        el.src = url
      })
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext("2d")
      if (!ctx) return file
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      )
      return blob && blob.size < file.size ? blob : file
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return file
  }
}

export function CommitmentPhotoSheet({
  weekStart,
  photos,
}: {
  weekStart: string
  photos: CommitmentPhotoRow[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [kind, setKind] = useState<string>("weekly-update")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return (
      <div className="rounded-[16px] border border-dashed border-[var(--tk-line)] bg-white p-6 text-center text-[14px] text-[var(--tk-ink-soft)]">
        Photo uploads not configured. Add Cloudinary env vars to enable.
      </div>
    )
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file)
        const form = new FormData()
        form.append("file", compressed)
        form.append("upload_preset", UPLOAD_PRESET!)
        form.append("folder", `tarte-kitchen/commitments/${weekStart}`)

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: "POST", body: form }
        )
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
        const data = await res.json()

        await saveCommitmentPhoto({
          weekStart,
          kind,
          url: data.secure_url,
          publicId: data.public_id,
        })
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      {/* Kind selector */}
      <div>
        <div className="tk-caps mb-2 px-1" style={{ color: "var(--tk-ink-mute)" }}>
          What kind of sheet is it?
        </div>
        <div className="flex flex-wrap gap-2">
          {PHOTO_KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className="rounded-full px-4 py-2.5 text-[14px] font-semibold transition active:scale-95"
              style={
                kind === k.value
                  ? { background: "var(--tk-charcoal)", color: "white" }
                  : {
                      background: "white",
                      color: "var(--tk-ink-soft)",
                      border: "1px solid var(--tk-line)",
                    }
              }
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Big camera button, iPad-first */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex min-h-[88px] w-full items-center justify-center gap-4 rounded-[16px] text-[19px] font-semibold text-white transition active:scale-[0.995] disabled:opacity-60"
          style={{ background: "var(--tk-sage)" }}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Camera className="h-6 w-6" strokeWidth={1.8} /> Take photo of the
              sheet
            </>
          )}
        </button>
        {error && (
          <p className="mt-2 px-1 text-[13px] font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>

      {/* This week's photos */}
      {photos.length > 0 && (
        <div>
          <div className="tk-caps mb-2 px-1" style={{ color: "var(--tk-ink-mute)" }}>
            Filed this week
          </div>
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative w-32">
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={photoKindLabel(p.kind)}
                    className="h-32 w-32 rounded-[12px] border border-[var(--tk-line)] object-cover"
                  />
                </a>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await deleteCommitmentPhoto({ photoId: p.id })
                      router.refresh()
                    })
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white active:bg-black/80"
                  aria-label="Delete photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="mt-1 truncate text-[12px] text-[var(--tk-ink-soft)]">
                  {photoKindLabel(p.kind)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
