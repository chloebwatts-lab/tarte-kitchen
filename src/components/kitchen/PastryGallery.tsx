"use client"

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, ImageOff, Loader2, Plus, Trash2, X } from "lucide-react"
import {
  addGalleryProduct,
  deletePastryProductPhoto,
  removeGalleryProduct,
  savePastryProductNote,
  savePastryProductPhoto,
  type GalleryProduct,
} from "@/lib/actions/pastry-section"
import { MAX_NOTE_LENGTH, MAX_PRODUCT_NAME_LENGTH } from "@/lib/pastry/section"
import { photoUploadsReady, uploadPastryPhoto } from "@/lib/pastry/upload-photo"

/** Cloudinary resize on the fly, so the grid doesn't pull full-size photos. */
function sized(url: string, width: number): string {
  return url.replace("/image/upload/", `/image/upload/c_fill,w_${width},h_${width},q_auto,f_auto/`)
}

/**
 * Every pastry product with its "this is how it should look" photos.
 * Names go in first; photos get added over time, so a card with no photo
 * is normal and says so.
 */
export function PastryGallery({ products }: { products: GalleryProduct[] }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)

  const open = products.find((p) => p.id === openId) ?? null
  const withPhoto = products.filter((p) => p.photos.length > 0).length

  async function add() {
    if (!name.trim() || adding) return
    setError("")
    setAdding(true)
    try {
      const res = await addGalleryProduct(name)
      if (res.error) setError(res.error)
      else {
        setName("")
        start(() => router.refresh())
      }
    } catch {
      setError("That didn't save, try again")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="rounded-[18px] border border-[var(--tk-line)] bg-white px-4 py-3.5"
      >
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError("")
            }}
            maxLength={MAX_PRODUCT_NAME_LENGTH}
            placeholder="Add a product name"
            aria-label="Add a product name"
            className="min-h-[46px] min-w-0 flex-1 rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3.5 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
          />
          <button
            type="submit"
            disabled={!name.trim() || adding}
            className="flex min-h-[46px] shrink-0 items-center gap-1.5 rounded-[12px] bg-[var(--tk-charcoal)] px-4 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
        {error && <div className="mt-2 text-[14px] font-semibold text-[var(--tk-warn)]">{error}</div>}
      </form>

      <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
        {products.length} products · {withPhoto} with a photo
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenId(p.id)}
            className="overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white text-left transition active:scale-[0.99]"
          >
            <div className="relative aspect-square w-full bg-[var(--tk-charcoal-soft)]">
              {p.photos[0] ? (
                <img src={sized(p.photos[0].url, 480)} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--tk-ink-mute)]">
                  <Camera className="h-7 w-7" strokeWidth={1.6} />
                  <span className="text-[13px]">No photo yet</span>
                </div>
              )}
              {p.photos.length > 1 && (
                <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">
                  {p.photos.length} photos
                </span>
              )}
            </div>
            <div className="px-3.5 py-3">
              <div className="text-[16px] font-semibold leading-tight text-[var(--tk-charcoal)]">{p.name}</div>
              {p.note && <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--tk-ink-soft)]">{p.note}</div>}
            </div>
          </button>
        ))}
      </div>

      {open && (
        <ProductSheet
          key={open.id}
          product={open}
          onClose={() => setOpenId(null)}
          onChanged={() => start(() => router.refresh())}
        />
      )}
    </div>
  )
}

function ProductSheet({
  product,
  onClose,
  onChanged,
}: {
  product: GalleryProduct
  onClose: () => void
  onChanged: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [note, setNote] = useState(product.note ?? "")
  const [noteSaved, setNoteSaved] = useState(false)
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError("")
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const up = await uploadPastryPhoto(file, product.id)
        await savePastryProductPhoto({ productId: product.id, ...up })
      }
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function saveNote() {
    if (note.trim() === (product.note ?? "")) return
    await savePastryProductNote(product.id, note)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 3000)
    onChanged()
  }

  async function deletePhoto(id: string) {
    setConfirmPhoto(null)
    await deletePastryProductPhoto(id)
    onChanged()
  }

  async function removeProduct() {
    await removeGalleryProduct(product.id)
    onChanged()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={product.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-t-[22px] bg-[var(--tk-bg)] sm:rounded-[22px]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--tk-line)] bg-white px-5 py-3.5">
          <h2 className="tk-display text-[24px] leading-tight text-[var(--tk-charcoal)]" style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
            {product.name}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {product.photos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[16px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-10 text-center text-[var(--tk-ink-soft)]">
              <ImageOff className="h-7 w-7" strokeWidth={1.6} />
              <div className="text-[15px]">No reference photo yet. Add one when the next batch looks right.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {product.photos.map((ph) => (
                <div key={ph.id} className="overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white">
                  <img src={ph.url.replace("/image/upload/", "/image/upload/w_1400,q_auto,f_auto/")} alt={product.name} className="w-full" />
                  <div className="flex justify-end px-3 py-2">
                    {confirmPhoto === ph.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => deletePhoto(ph.id)}
                          className="min-h-[40px] rounded-full px-3 text-[13px] font-semibold text-white"
                          style={{ background: "var(--tk-warn)" }}
                        >
                          Delete photo
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPhoto(null)}
                          className="min-h-[40px] rounded-full border border-[var(--tk-line)] px-3 text-[13px] font-semibold text-[var(--tk-ink-soft)]"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmPhoto(ph.id)}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[var(--tk-ink-mute)]"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {photoUploadsReady ? (
            <div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--tk-charcoal)] px-5 text-[16px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {uploading ? "Uploading..." : product.photos.length ? "Add another photo" : "Add a photo"}
              </button>
              {error && <div className="mt-2 text-[14px] font-semibold text-[var(--tk-warn)]">{error}</div>}
            </div>
          ) : (
            <div className="rounded-[14px] border border-dashed border-[var(--tk-line)] bg-white p-4 text-center text-[14px] text-[var(--tk-ink-soft)]">
              Photo uploads are not set up on this device.
            </div>
          )}

          <label className="block">
            <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
              How it should look
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              maxLength={MAX_NOTE_LENGTH}
              rows={2}
              placeholder="Glaze to the edge, 12 raspberries, dusted just before it goes out..."
              className="mt-1.5 w-full rounded-[12px] border border-[var(--tk-line)] bg-white px-3.5 py-3 text-[16px] leading-snug text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
            />
            <span className="text-[13px] text-[var(--tk-ink-mute)]">{noteSaved ? "Saved." : "Saves when you tap away."}</span>
          </label>

          {!product.inRotation && (
            <div className="flex justify-end">
              {confirmRemove ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={removeProduct}
                    className="min-h-[40px] rounded-full px-3 text-[13px] font-semibold text-white"
                    style={{ background: "var(--tk-warn)" }}
                  >
                    Take {product.name} off the list
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="min-h-[40px] rounded-full border border-[var(--tk-line)] px-3 text-[13px] font-semibold text-[var(--tk-ink-soft)]"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="min-h-[40px] px-3 text-[13px] font-semibold text-[var(--tk-ink-mute)]"
                >
                  Take this product off the list
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
