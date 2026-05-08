"use client"

import { useState, useTransition } from "react"
import { Plus, X, Upload } from "lucide-react"
import { CouncilDocumentType, Venue } from "@/generated/prisma"
import { uploadCouncilDocument } from "@/lib/actions/council-documents"

const TYPE_LABEL: Record<CouncilDocumentType, string> = {
  FOOD_BUSINESS_LICENCE: "Food business licence",
  FSS_CERTIFICATE: "FSS certificate",
  FSS_NOTIFICATION: "FSS notification to Council",
  PEST_CONTROL_REPORT: "Pest control report",
  FLOOR_PLAN: "Floor plan",
  TRAINING_RECORD: "Training record",
  CALIBRATION_RECORD: "Probe calibration",
  CLEANING_SCHEDULE: "Cleaning schedule",
  ALLERGEN_TRAINING: "Allergen training",
  HACCP_PLAN: "HACCP / food safety program",
  RECALL_PROCEDURE: "Recall procedure",
  GREASE_TRAP_RECORD: "Grease trap record",
  EAT_SAFE_RATING: "Eat Safe rating",
  SUPPLIER_APPROVAL: "Approved supplier list",
  INCIDENT_LOG: "Incident log",
  OTHER: "Other",
}

export function UploadDocumentDialog({
  venue,
  types,
}: {
  venue: Venue
  types: CouncilDocumentType[]
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await uploadCouncilDocument(formData)
        setOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
              <h3 className="text-base font-semibold text-stone-900">
                Upload document
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              action={handleSubmit}
              className="space-y-3 px-5 py-4 text-sm"
            >
              <input type="hidden" name="venue" value={venue} />

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  Type
                </label>
                <select
                  name="type"
                  required
                  defaultValue={types[0]}
                  className="block w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  Title
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. FSS Certificate – John Smith"
                  className="block w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  name="description"
                  className="block w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    Issued
                  </label>
                  <input
                    type="date"
                    name="issuedOn"
                    className="block w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    Expires
                  </label>
                  <input
                    type="date"
                    name="expiresOn"
                    className="block w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  Uploaded by (optional)
                </label>
                <input
                  type="text"
                  name="uploadedBy"
                  placeholder="Initials or name"
                  className="block w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  File (PDF or photo, max 15 MB)
                </label>
                <input
                  type="file"
                  name="file"
                  required
                  accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
                  className="block w-full text-sm text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-stone-200"
                />
              </div>

              {error && (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {pending ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
