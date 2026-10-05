const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

export const photoUploadsReady = !!CLOUD_NAME && !!UPLOAD_PRESET

/** Same downscale as checklist evidence photos: a phone photo doesn't
 *  need 12MP to show how a tarte should look. */
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

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
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY))
      return blob && blob.size < file.size ? blob : file
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return file
  }
}

/** Browser-side upload of one product photo to Cloudinary. */
export async function uploadPastryPhoto(file: File, productId: string): Promise<{ url: string; publicId: string }> {
  const form = new FormData()
  form.append("file", await compressImage(file))
  form.append("upload_preset", UPLOAD_PRESET!)
  form.append("folder", `tarte-kitchen/pastry-products/${productId}`)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: form })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const data = await res.json()
  return { url: data.secure_url, publicId: data.public_id }
}
