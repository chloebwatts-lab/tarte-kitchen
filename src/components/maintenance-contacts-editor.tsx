"use client"

import { useState, useTransition } from "react"
import { Pencil, Plus } from "lucide-react"
import { upsertMaintenanceContact, type ContactInput } from "@/lib/actions/maintenance"

interface Row {
  id: string
  name: string
  company: string | null
  phone: string | null
  email: string | null
  specialties: string[]
  notes: string | null
}

const EMPTY: ContactInput = { name: "", company: "", phone: "", email: "", specialties: [], notes: "" }

export function MaintenanceContactsEditor({ contacts }: { contacts: Row[] }) {
  const [editing, setEditing] = useState<ContactInput | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      try {
        await upsertMaintenanceContact({
          ...editing,
          specialties:
            typeof (editing.specialties as unknown) === "string"
              ? String(editing.specialties)
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean)
              : editing.specialties,
        })
        setEditing(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save")
      }
    })
  }

  return (
    <div className="space-y-3">
      {contacts.map((c) => (
        <div key={c.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="min-w-0">
            <div className="font-medium">
              {c.name}
              {c.company && c.company !== c.name ? (
                <span className="ml-2 text-sm text-muted-foreground">{c.company}</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {[c.phone, c.email].filter(Boolean).join(" · ") || "no contact details yet"}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {c.specialties.map((s) => (
                <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {s}
                </span>
              ))}
            </div>
            {c.notes && <p className="mt-2 text-sm text-muted-foreground">{c.notes}</p>}
          </div>
          <button
            onClick={() =>
              setEditing({
                id: c.id,
                name: c.name,
                company: c.company ?? "",
                phone: c.phone ?? "",
                email: c.email ?? "",
                specialties: c.specialties,
                notes: c.notes ?? "",
              })
            }
            className="shrink-0 rounded-md border p-2 hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      ))}

      {!editing && (
        <button
          onClick={() => setEditing(EMPTY)}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Add contact
        </button>
      )}

      {editing && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Name (e.g. Josh — Cooltech)"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Company"
              value={editing.company ?? ""}
              onChange={(e) => setEditing({ ...editing, company: e.target.value })}
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Phone"
              value={editing.phone ?? ""}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Email"
              value={editing.email ?? ""}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
            />
            <input
              className="rounded-md border px-3 py-2 text-sm md:col-span-2"
              placeholder="Specialties, comma-separated (refrigeration, gas, dishwasher, general…)"
              value={
                Array.isArray(editing.specialties)
                  ? editing.specialties.join(", ")
                  : String(editing.specialties ?? "")
              }
              onChange={(e) =>
                setEditing({ ...editing, specialties: e.target.value as unknown as string[] })
              }
            />
            <textarea
              className="rounded-md border px-3 py-2 text-sm md:col-span-2"
              rows={2}
              placeholder="Notes — what they've fixed, pricing, when to use them"
              value={editing.notes ?? ""}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={pending || !editing.name.trim()}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-md px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
