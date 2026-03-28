"use client"

import { useState, useTransition, useCallback } from "react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Store,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Download,
  Search,
  CircleAlert,
  TriangleAlert,
  Calendar,
  Sandwich,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type WasteStats,
  type WasteInsight,
  getWasteEntries,
  exportWasteCsv,
} from "@/lib/actions/wastage"

// ============================================================
// TYPES
// ============================================================

interface WasteEntryRow {
  id: string
  date: string
  venue: string
  itemName: string
  quantity: number
  unit: string
  estimatedCost: number
  reason: string
  notes: string | null
  recordedBy: string | null
}

interface EntriesResult {
  entries: WasteEntryRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface Props {
  stats: WasteStats
  insights: WasteInsight[]
  initialEntries: EntriesResult
}

// ============================================================
// CONSTANTS
// ============================================================

const REASON_LABELS: Record<string, string> = {
  OVERPRODUCTION: "Overproduction",
  SPOILAGE: "Spoilage",
  EXPIRED: "Expired",
  DROPPED: "Dropped",
  STAFF_MEAL: "Staff Meal",
  CUSTOMER_RETURN: "Customer Return",
  QUALITY_ISSUE: "Quality Issue",
  OTHER: "Other",
}

const PIE_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
]

const INSIGHT_ICONS: Record<string, typeof CircleAlert> = {
  "circle-alert": CircleAlert,
  "triangle-alert": TriangleAlert,
  "calendar": Calendar,
  "trending-up": TrendingUp,
  "sandwich": Sandwich,
}

const ALERT_STYLES = {
  green: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
}

// ============================================================
// COMPONENT
// ============================================================

export function WastageDashboard({ stats, insights, initialEntries }: Props) {
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [entries, setEntries] = useState(initialEntries)
  const [searchQuery, setSearchQuery] = useState("")
  const [venueFilter, setVenueFilter] = useState<string>("all")
  const [reasonFilter, setReasonFilter] = useState<string>("all")
  const [sortField, setSortField] = useState<string>("date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [isPending, startTransition] = useTransition()

  const fetchEntries = useCallback(
    (page: number) => {
      startTransition(async () => {
        const result = await getWasteEntries({
          page,
          pageSize: 20,
          venue: venueFilter !== "all" ? (venueFilter as "BURLEIGH" | "CURRUMBIN") : undefined,
          reason: reasonFilter !== "all" ? (reasonFilter as keyof typeof REASON_LABELS) : undefined,
          search: searchQuery || undefined,
        })
        setEntries(result)
      })
    },
    [venueFilter, reasonFilter, searchQuery]
  )

  function handleSearch(query: string) {
    setSearchQuery(query)
    // Debounced fetch on next render via effect
    startTransition(async () => {
      const result = await getWasteEntries({
        page: 1,
        pageSize: 20,
        venue: venueFilter !== "all" ? (venueFilter as "BURLEIGH" | "CURRUMBIN") : undefined,
        reason: reasonFilter !== "all" ? (reasonFilter as keyof typeof REASON_LABELS) : undefined,
        search: query || undefined,
      })
      setEntries(result)
    })
  }

  function handleFilterChange(type: "venue" | "reason", value: string) {
    if (type === "venue") setVenueFilter(value)
    else setReasonFilter(value)

    startTransition(async () => {
      const result = await getWasteEntries({
        page: 1,
        pageSize: 20,
        venue: (type === "venue" ? value : venueFilter) !== "all"
          ? ((type === "venue" ? value : venueFilter) as "BURLEIGH" | "CURRUMBIN")
          : undefined,
        reason: (type === "reason" ? value : reasonFilter) !== "all"
          ? ((type === "reason" ? value : reasonFilter) as keyof typeof REASON_LABELS)
          : undefined,
        search: searchQuery || undefined,
      })
      setEntries(result)
    })
  }

  async function handleExport() {
    const csv = await exportWasteCsv({
      venue: venueFilter !== "all" ? (venueFilter as "BURLEIGH" | "CURRUMBIN") : undefined,
      reason: reasonFilter !== "all" ? (reasonFilter as keyof typeof REASON_LABELS) : undefined,
      search: searchQuery || undefined,
    })
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `waste-report-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Sort entries client-side
  const sortedEntries = [...entries.entries].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case "date": cmp = a.date.localeCompare(b.date); break
      case "venue": cmp = a.venue.localeCompare(b.venue); break
      case "item": cmp = a.itemName.localeCompare(b.itemName); break
      case "cost": cmp = a.estimatedCost - b.estimatedCost; break
      case "reason": cmp = a.reason.localeCompare(b.reason); break
      default: cmp = 0
    }
    return sortDir === "desc" ? -cmp : cmp
  })

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  return (
    <div className="space-y-6">
      {/* AI Suggestions Panel */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <button
              onClick={() => setInsightsOpen(!insightsOpen)}
              className="flex w-full items-center justify-between"
            >
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Insights & Suggestions
                <Badge variant="secondary" className="text-xs">
                  {insights.length}
                </Badge>
              </CardTitle>
              {insightsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {insightsOpen && (
            <CardContent className="space-y-2 pt-0">
              {insights.map((insight, i) => {
                const Icon = INSIGHT_ICONS[insight.icon] ?? AlertTriangle
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span className="flex-1">{insight.message}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ~${insight.estimatedImpact.toFixed(0)} impact
                    </span>
                  </div>
                )
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Waste Cost</p>
                <p className="text-3xl font-bold">${stats.totalWasteCost.toFixed(0)}</p>
                <p className={cn(
                  "mt-1 text-xs font-medium",
                  ALERT_STYLES[stats.alertLevel]?.split(" ").find(c => c.startsWith("text-")) ?? "text-muted-foreground"
                )}>
                  {stats.wastePercentOfRevenue.toFixed(1)}% of revenue
                </p>
              </div>
              <div className={cn(
                "rounded-lg p-3",
                stats.alertLevel === "green" && "bg-green-100",
                stats.alertLevel === "amber" && "bg-amber-100",
                stats.alertLevel === "red" && "bg-red-100",
              )}>
                <DollarSign className={cn(
                  "h-5 w-5",
                  stats.alertLevel === "green" && "text-green-600",
                  stats.alertLevel === "amber" && "text-amber-600",
                  stats.alertLevel === "red" && "text-red-600",
                )} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">By Venue</p>
                {stats.byVenue.map((v) => (
                  <p key={v.venue} className="text-sm">
                    <span className="font-medium">{v.venue}:</span> ${v.cost.toFixed(0)}
                  </p>
                ))}
                {stats.byVenue.length === 0 && (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>
              <div className="rounded-lg bg-muted p-3">
                <Store className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Top Wasted Item</p>
                {stats.topWastedItem ? (
                  <>
                    <p className="text-lg font-semibold truncate max-w-[160px]">
                      {stats.topWastedItem.name}
                    </p>
                    <p className="text-sm text-red-600">
                      ${stats.topWastedItem.cost.toFixed(2)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>
              <div className="rounded-lg bg-muted p-3">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">vs Last Week</p>
                <p className="text-3xl font-bold">
                  {stats.weekOverWeekChange >= 0 ? "+" : ""}
                  {stats.weekOverWeekChange.toFixed(0)}%
                </p>
              </div>
              <div className={cn(
                "rounded-lg p-3",
                stats.weekOverWeekChange > 0 ? "bg-red-100" : "bg-green-100"
              )}>
                {stats.weekOverWeekChange > 0 ? (
                  <TrendingUp className="h-5 w-5 text-red-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-green-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Stacked Bar — Daily waste by venue */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily Waste by Venue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyByVenue}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value: number) => `$${value.toFixed(2)}`}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                  />
                  <Bar dataKey="BURLEIGH" stackId="a" fill="#3b82f6" name="Burleigh" />
                  <Bar dataKey="CURRUMBIN" stackId="a" fill="#06b6d4" name="Currumbin" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Donut — Waste by reason */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Waste by Reason</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.byReason.map((r) => ({
                      name: REASON_LABELS[r.reason] ?? r.reason,
                      value: r.cost,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {stats.byReason.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Line — Waste % trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Waste % of Revenue (Weekly)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, "auto"]}
                  />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
                  <ReferenceLine y={2} stroke="#ef4444" strokeDasharray="5 5" label="Target 2%" />
                  <Line
                    type="monotone"
                    dataKey="wastePercent"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Waste %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Waste Log Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Waste Log</CardTitle>
            <div className="flex gap-2">
              <Link href="/wastage/new">
                <Button size="sm">
                  <Plus className="mr-2 h-3 w-3" />
                  Log Waste
                </Button>
              </Link>
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-3 w-3" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={venueFilter} onValueChange={(v) => handleFilterChange("venue", v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Venue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Venues</SelectItem>
                <SelectItem value="BURLEIGH">Burleigh</SelectItem>
                <SelectItem value="CURRUMBIN">Currumbin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reasonFilter} onValueChange={(v) => handleFilterChange("reason", v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                {Object.entries(REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {[
                    { key: "date", label: "Date" },
                    { key: "venue", label: "Venue" },
                    { key: "item", label: "Item" },
                    { key: "qty", label: "Qty" },
                    { key: "cost", label: "Cost" },
                    { key: "reason", label: "Reason" },
                    { key: "notes", label: "Notes" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      className="cursor-pointer px-3 py-2 font-medium hover:text-foreground"
                      onClick={() => col.key !== "qty" && col.key !== "notes" && toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortField === col.key && (
                          <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No waste entries found.{" "}
                      <Link href="/wastage/new" className="text-primary underline">
                        Log your first entry
                      </Link>
                    </td>
                  </tr>
                )}
                {sortedEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="text-xs">
                        {entry.venue === "BURLEIGH" ? "Burleigh" : "Currumbin"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-medium">{entry.itemName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {entry.quantity} {entry.unit}
                    </td>
                    <td className="px-3 py-2 text-red-600 font-medium">
                      ${entry.estimatedCost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        {REASON_LABELS[entry.reason] ?? entry.reason}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                      {entry.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {entries.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(entries.page - 1) * entries.pageSize + 1}–
                {Math.min(entries.page * entries.pageSize, entries.total)} of{" "}
                {entries.total}
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={entries.page <= 1 || isPending}
                  onClick={() => fetchEntries(entries.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={entries.page >= entries.totalPages || isPending}
                  onClick={() => fetchEntries(entries.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
