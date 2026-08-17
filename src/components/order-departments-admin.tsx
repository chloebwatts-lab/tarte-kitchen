"use client"

import { useMemo, useState, useTransition } from "react"
import type { OrderDept, Venue } from "@/generated/prisma/client"
import {
  setDeptOwner,
  setItemDept,
  type DeptAssignmentRow,
} from "@/lib/actions/dept-orders"
import { DEPT_BLURB, DEPT_LABEL, ORDER_DEPTS } from "@/lib/departments"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"

type Owner = {
  venue: Venue
  dept: OrderDept
  ownerName: string | null
  active: boolean
}

/**
 * Who heads each department at each venue, and which department orders
 * each supplier-form item. Items left on "auto" follow the category rules
 * in src/lib/departments.ts, so a new item on a supplier form still lands
 * on somebody's order page.
 */
export function OrderDepartmentsAdmin({
  owners: initialOwners,
  items: initialItems,
}: {
  owners: Owner[]
  items: DeptAssignmentRow[]
}) {
  const [owners, setOwners] = useState(initialOwners)
  const [items, setItems] = useState(initialItems)
  const [query, setQuery] = useState("")
  const [deptFilter, setDeptFilter] = useState<OrderDept | "ALL">("ALL")
  const [pending, startTransition] = useTransition()

  function ownerFor(venue: Venue, dept: OrderDept) {
    return owners.find((o) => o.venue === venue && o.dept === dept)
  }

  function saveOwner(venue: Venue, dept: OrderDept, patch: Partial<Owner>) {
    setOwners((prev) => {
      const hit = prev.find((o) => o.venue === venue && o.dept === dept)
      if (hit)
        return prev.map((o) =>
          o.venue === venue && o.dept === dept ? { ...o, ...patch } : o
        )
      return [
        ...prev,
        { venue, dept, ownerName: null, active: true, ...patch },
      ]
    })
    const next = { ...ownerFor(venue, dept), ...patch }
    startTransition(() => {
      void setDeptOwner({
        venue,
        dept,
        ownerName: next.ownerName ?? null,
        active: next.active ?? true,
      })
    })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (deptFilter !== "ALL" && it.resolvedDept !== deptFilter) return false
      if (!q) return true
      return (
        it.name.toLowerCase().includes(q) ||
        it.supplierName.toLowerCase().includes(q) ||
        (it.category ?? "").toLowerCase().includes(q)
      )
    })
  }, [items, query, deptFilter])

  const counts = useMemo(() => {
    const m = new Map<OrderDept, number>()
    for (const it of items) m.set(it.resolvedDept, (m.get(it.resolvedDept) ?? 0) + 1)
    return m
  }, [items])

  function assign(id: string, dept: OrderDept | null) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              dept,
              resolvedDept: dept ?? it.resolvedDept,
            }
          : it
      )
    )
    startTransition(() => {
      void setItemDept({ approvedItemId: id, dept })
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ordering Departments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each department fills its own order page in staff tools, the head
          approves it at close, and every approved line is regrouped by
          supplier into one order each. Set who heads each department, and
          move any item that&apos;s landed on the wrong form.
        </p>
      </div>

      {/* Heads per venue */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Department heads
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Department</th>
                {SINGLE_VENUES.map((v) => (
                  <th key={v} className="px-4 py-2.5 text-left font-medium">
                    {VENUE_SHORT_LABEL[v]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORDER_DEPTS.map((dept) => (
                <tr key={dept} className="border-t">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">{DEPT_LABEL[dept]}</div>
                    <div className="mt-0.5 max-w-[280px] text-xs text-muted-foreground">
                      {DEPT_BLURB[dept]}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {counts.get(dept) ?? 0} items
                    </div>
                  </td>
                  {SINGLE_VENUES.map((venue) => {
                    const o = ownerFor(venue, dept)
                    return (
                      <td key={venue} className="px-4 py-3 align-top">
                        <input
                          defaultValue={o?.ownerName ?? ""}
                          placeholder="Name"
                          onBlur={(e) =>
                            saveOwner(venue, dept, {
                              ownerName: e.target.value.trim() || null,
                            })
                          }
                          className="w-full rounded-md border px-2.5 py-1.5 text-sm"
                        />
                        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={o?.active !== false}
                            onChange={(e) =>
                              saveOwner(venue, dept, { active: e.target.checked })
                            }
                          />
                          Runs here
                        </label>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Untick &ldquo;runs here&rdquo; for a department a venue doesn&apos;t
          have. Hidden departments don&apos;t appear on that venue&apos;s staff
          page and don&apos;t hold up the end-of-day send.
        </p>
      </div>

      {/* Item assignment */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Who orders what
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items, suppliers, categories"
            className="min-w-[240px] flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <select
            value={deptFilter}
            onChange={(e) =>
              setDeptFilter(e.target.value as OrderDept | "ALL")
            }
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="ALL">All departments ({items.length})</option>
            {ORDER_DEPTS.map((d) => (
              <option key={d} value={d}>
                {DEPT_LABEL[d]} ({counts.get(d) ?? 0})
              </option>
            ))}
          </select>
          {pending && (
            <span className="text-xs text-muted-foreground">saving…</span>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Item</th>
                <th className="px-4 py-2.5 text-left font-medium">Supplier</th>
                <th className="px-4 py-2.5 text-left font-medium">Category</th>
                <th className="px-4 py-2.5 text-left font-medium">Department</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-2.5">
                    {it.name}
                    {it.packSize ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {it.packSize}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {it.supplierName}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {it.category ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={it.dept ?? "AUTO"}
                      onChange={(e) =>
                        assign(
                          it.id,
                          e.target.value === "AUTO"
                            ? null
                            : (e.target.value as OrderDept)
                        )
                      }
                      className="rounded-md border px-2 py-1 text-sm"
                    >
                      <option value="AUTO">
                        Auto ({DEPT_LABEL[it.resolvedDept]})
                      </option>
                      {ORDER_DEPTS.map((d) => (
                        <option key={d} value={d}>
                          {DEPT_LABEL[d]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Nothing matches that.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
