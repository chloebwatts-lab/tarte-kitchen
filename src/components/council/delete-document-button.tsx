"use client"

import { useTransition } from "react"
import { Trash2 } from "lucide-react"
import { deleteCouncilDocument } from "@/lib/actions/council-documents"

export function DeleteDocumentButton({
  id,
  title,
}: {
  id: string
  title: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
        const fd = new FormData()
        fd.set("id", id)
        startTransition(async () => {
          await deleteCouncilDocument(fd)
        })
      }}
      className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </button>
  )
}
