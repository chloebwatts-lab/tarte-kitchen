"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Blend,
  Camera,
  Coffee,
  CookingPot,
  Dices,
  Droplets,
  Flame,
  Loader2,
  Microwave,
  Refrigerator,
  Snowflake,
  Wrench,
  X,
} from "lucide-react"
import { CATEGORY_LABEL, type AssetCategory } from "@/lib/maintenance/constants"
import { createMaintenanceAsset } from "@/lib/actions/maintenance"

type Venue = "BURLEIGH" | "BEACH_HOUSE"

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  dishwasher: Droplets,
  refrigeration: Refrigerator,
  freezer: Snowflake,
  "ice-machine": Dices,
  "gas-cooking": Flame,
  fryer: CookingPot,
  oven: Microwave,
  coffee: Coffee,
  "mixer-blender": Blend,
  other: Wrench,
}

/** Same order staff see on the fix page tiles. */
const CATEGORY_ORDER: AssetCategory[] = [
  "dishwasher",
  "gas-cooking",
  "fryer",
  "oven",
  "refrigeration",
  "freezer",
  "ice-machine",
  "coffee",
  "mixer-blender",
  "other",
]

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

/** Same downscale trick as checklist photos: data plates don't need 12MP. */
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

export function NewMachineForm({
  initialVenue,
  locationsByVenue,
}: {
  initialVenue: Venue
  locationsByVenue: Record<Venue, string[]>
}) {
  const router = useRouter()
  const [venue, setVenue] = useState<Venue>(initialVenue)
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [customLocation, setCustomLocation] = useState(false)
  const [category, setCategory] = useState<AssetCategory | null>(null)
  const [manufacturer, setManufacturer] = useState("")
  const [model, setModel] = useState("")
  const [serial, setSerial] = useState("")
  const [addedBy, setAddedBy] = useState("")
  const [photo, setPhoto] = useState<{ url: string; publicId: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const locations = locationsByVenue[venue] ?? []

  async function handlePhoto(files: FileList | null) {
    if (!files || files.length === 0 || !CLOUD_NAME || !UPLOAD_PRESET) return
    setError(null)
    setUploading(true)
    try {
      const compressed = await compressImage(files[0])
      const form = new FormData()
      form.append("file", compressed)
      form.append("upload_preset", UPLOAD_PRESET)
      form.append("folder", "tarte-kitchen/maintenance-assets")
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const data = await res.json()
      setPhoto({ url: data.secure_url, publicId: data.public_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function submit() {
    setError(null)
    setPending(true)
    try {
      const { slug } = await createMaintenanceAsset({
        venue,
        name,
        location,
        category: category ?? "other",
        manufacturer: manufacturer || null,
        model: model || null,
        serial: serial || null,
        photoUrl: photo?.url ?? null,
        photoPublicId: photo?.publicId ?? null,
        addedBy,
      })
      router.push(`/kitchen/fix/label/${slug}?new=1`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong, try again")
      setPending(false)
    }
  }

  const ready = name.trim() && location.trim() && category && addedBy.trim()

  return (
    <div className="space-y-5">
      {/* ── Venue ── */}
      <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
        <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">Which venue?</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              { key: "BURLEIGH", label: "Burleigh" },
              { key: "BEACH_HOUSE", label: "Beach House" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              onClick={() => {
                setVenue(v.key)
                setLocation("")
                setCustomLocation(false)
              }}
              className={`rounded-xl border px-4 py-3 text-[16px] font-bold transition ${
                venue === v.key
                  ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
                  : "border-[var(--tk-line)] text-[var(--tk-ink)] hover:border-[var(--tk-sage)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── What is it ── */}
      <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
        <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">What is it?</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Brand + what it is, e.g. Turbo Air underbench fridge"
          className="mt-4 w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
        />
        <div className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-[var(--tk-ink-mute)]">
          What kind of machine
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
          {CATEGORY_ORDER.map((c) => {
            const Icon = CATEGORY_ICON[c]
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[14px] font-semibold transition ${
                  category === c
                    ? "border-[var(--tk-sage)] bg-[var(--tk-sage-soft)] text-[var(--tk-charcoal)]"
                    : "border-[var(--tk-line)] text-[var(--tk-ink)] hover:border-[var(--tk-sage)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {CATEGORY_LABEL[c]}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Where does it live ── */}
      <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
        <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">Where does it live?</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {locations.map((l) => (
            <button
              key={l}
              onClick={() => {
                setLocation(l)
                setCustomLocation(false)
              }}
              className={`rounded-xl border px-4 py-2.5 text-[15px] font-semibold transition ${
                !customLocation && location === l
                  ? "border-[var(--tk-sage)] bg-[var(--tk-sage-soft)] text-[var(--tk-charcoal)]"
                  : "border-[var(--tk-line)] text-[var(--tk-ink)] hover:border-[var(--tk-sage)]"
              }`}
            >
              {l}
            </button>
          ))}
          <button
            onClick={() => {
              setCustomLocation(true)
              setLocation("")
            }}
            className={`rounded-xl border border-dashed px-4 py-2.5 text-[15px] font-semibold transition ${
              customLocation
                ? "border-[var(--tk-sage)] bg-[var(--tk-sage-soft)] text-[var(--tk-charcoal)]"
                : "border-[var(--tk-line)] text-[var(--tk-ink-soft)] hover:border-[var(--tk-sage)]"
            }`}
          >
            Somewhere else…
          </button>
        </div>
        {customLocation && (
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where exactly? e.g. Outside / back"
            autoFocus
            className="mt-3 w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
          />
        )}
      </div>

      {/* ── Photo + data plate ── */}
      <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
        <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">
          Photo &amp; data plate <span className="font-normal text-[var(--tk-ink-soft)]">(optional but gold)</span>
        </h2>
        <p className="mt-1 text-[14px] leading-snug text-[var(--tk-ink-soft)]">
          A photo of the machine helps everyone find it. The silver data plate
          (brand, model, serial) is what the repair tech asks for first.
        </p>
        <div className="mt-4 flex items-center gap-3">
          {photo ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-[var(--tk-line)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => setPhoto(null)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
          {CLOUD_NAME && UPLOAD_PRESET ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handlePhoto(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[15px] font-semibold text-[var(--tk-ink)] hover:border-[var(--tk-sage)] disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {uploading ? "Uploading…" : photo ? "Retake photo" : "Take photo"}
              </button>
            </>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="Brand, e.g. Hoshizaki"
            className="w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model, e.g. IM-45NE"
            className="w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
          />
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="Serial number"
            className="w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
          />
        </div>
      </div>

      {/* ── Submit ── */}
      <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
        <input
          value={addedBy}
          onChange={(e) => setAddedBy(e.target.value)}
          placeholder="Your name (required)"
          className="w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
        />
        {error && (
          <div className="mt-3 flex items-center gap-2 text-[14px] font-semibold text-[#b3362a]">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}
        <button
          onClick={submit}
          disabled={!ready || pending || uploading}
          className="mt-3 w-full rounded-xl bg-[var(--tk-charcoal)] py-4 text-[17px] font-bold text-white disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add machine & get its QR sticker"}
        </button>
      </div>
    </div>
  )
}
