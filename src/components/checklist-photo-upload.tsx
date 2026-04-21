"use client"

import { useState, useRef } from "react"
import { Camera, X, Loader2, ImageIcon } from "lucide-react"
import { saveChecklistPhoto, deleteChecklistPhoto } from "@/lib/actions/checklists"

interface Photo {
  id: string
  url: string
  publicId: string
}

interface Props {
  runId: string
  initialPhotos?: Photo[]
  uploadedBy?: string | null
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

export function ChecklistPhotoUpload({ runId, initialPhotos = [], uploadedBy }: Props) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
        Photo uploads not configured — add Cloudinary env vars to enable.
      </div>
    )
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append("file", file)
        form.append("upload_preset", UPLOAD_PRESET!)
        form.append("folder", `tarte-kitchen/checklists/${runId}`)

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: "POST", body: form }
        )
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
        const data = await res.json()

        await saveChecklistPhoto({
          runId,
          url: data.secure_url,
          publicId: data.public_id,
          uploadedBy: uploadedBy ?? null,
        })

        setPhotos((prev) => [
          ...prev,
          { id: data.public_id, url: data.secure_url, publicId: data.public_id },
        ])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function removePhoto(photo: Photo) {
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    await deleteChecklistPhoto({ photoId: photo.id, runId })
  }

  return (
    <div className="space-y-3">
      {/* Thumbnails */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt="Completion photo"
                className="h-full w-full object-cover"
              />
              <button
                onClick={() => removePhoto(photo)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
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
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : photos.length === 0 ? (
            <Camera className="h-4 w-4" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          {uploading ? "Uploading…" : photos.length === 0 ? "Take photo" : "Add another"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {photos.length === 0 && (
        <p className="text-xs text-amber-600">
          Please take at least one photo before leaving this page.
        </p>
      )}
    </div>
  )
}
