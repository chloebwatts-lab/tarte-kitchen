"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { compressImage } from "@/components/checklist-photo-upload"
import { addThankYouPhoto, removeThankYouPhoto, type ThankYouPhotoRow } from "@/lib/actions/thank-you"

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

/** Oliver's pool of staff photos for the FOH "Thank you :)" page. */
export function GmThankYouPhotos({
  venue,
  venueLabel,
  initial,
}: {
  venue: string
  venueLabel: string
  initial: ThankYouPhotoRow[]
}) {
  const [photos, setPhotos] = useState(initial)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState("")
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return <p className="rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[16px] text-[var(--tk-warn)]">Photo uploads are not set up on this server. Tell Chloe.</p>
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError("")
    const list = Array.from(files)
    setUploading(list.length)
    let failed = 0
    // One at a time: a camera roll pick of 20 photos should not flood the wifi.
    for (const file of list) {
      try {
        const form = new FormData()
        form.append("file", await compressImage(file))
        form.append("upload_preset", UPLOAD_PRESET!)
        form.append("folder", "tarte-kitchen/thank-you")
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: form })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        const r = await addThankYouPhoto({ venue, url: data.secure_url, publicId: data.public_id })
        if (!r.ok) throw new Error(r.error)
        setPhotos((prev) => [r.photo, ...prev])
      } catch {
        failed++
      } finally {
        setUploading((n) => Math.max(0, n - 1))
      }
    }
    if (failed) setError(failed === 1 ? "One photo did not upload. Try it again." : `${failed} photos did not upload. Try them again.`)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function remove(id: string) {
    setConfirmId(null)
    const before = photos
    setPhotos((prev) => prev.filter((p) => p.id !== id))
    try {
      await removeThankYouPhoto(id)
    } catch {
      setPhotos(before)
      setError("That did not remove. Check the wifi and try again.")
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[17px] font-bold text-[var(--tk-ink)]">{venueLabel}: {photos.length} photo{photos.length === 1 ? "" : "s"}</div>
            <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
              {photos.length === 0 ? "No photos of its own yet, so it uses the other venues' photos." : "Live now on the FOH daily checklists."}
            </div>
          </div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <KitchenButton variant="primary" size="lg" disabled={uploading > 0} onClick={() => inputRef.current?.click()}>
            {uploading > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            {uploading > 0 ? `Uploading, ${uploading} to go` : "Add photos"}
          </KitchenButton>
        </div>
        {error ? <p className="mt-3 rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[15px] font-medium text-[var(--tk-warn)]" role="alert">{error}</p> : null}
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="relative overflow-hidden rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-card)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="Staff photo" className="aspect-square w-full object-cover" />
              {confirmId === p.id ? (
                <div className="absolute inset-x-2 bottom-2 flex gap-2">
                  <button type="button" onClick={() => remove(p.id)} className="flex-1 rounded-[10px] bg-[var(--tk-warn)] px-3 py-2 text-[14px] font-semibold text-white">Remove</button>
                  <button type="button" onClick={() => setConfirmId(null)} className="flex-1 rounded-[10px] bg-white px-3 py-2 text-[14px] font-semibold text-[var(--tk-ink)]">Keep</button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setConfirmId(p.id)}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
