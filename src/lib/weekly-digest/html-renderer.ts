/**
 * HTML email renderer for the Friday weekly digest.
 *
 * Pure rendering — no Anthropic calls in here. Takes the aggregator
 * snapshot plus Claude's narrative bits and produces a self-contained
 * HTML string + matching plain-text fallback.
 *
 * Email-safe constraints:
 *   - Inline styles only (most clients strip <style>)
 *   - Tables for layout (Outlook + Gmail-mobile still struggle with flex)
 *   - 600px max content width
 *   - System fonts, no web fonts
 *   - No emoji — colour + typography express status
 */

import type { WeeklyDigestSnapshot } from "./aggregator"

export interface DigestNarrative {
  /// 1-2 sentence headline, lead-with-action.
  headline: string
  /// Short prose under each section header (1-2 sentences). Keys must
  /// match the section ids below.
  sectionNotes: {
    sales?: string
    wages?: string
    cogs?: string
    wastage?: string
    prices?: string
    topSellers?: string
    reviews?: string
  }
  /// 3-6 concrete action bullets, ranked by impact.
  actionItems: string[]
}

// ─── Design tokens ─────────────────────────────────────────────────
const C = {
  bg: "#f5f3ef", // Tarte stone background
  card: "#ffffff",
  border: "#e7e2db",
  borderSoft: "#f1ede6",
  ink: "#1f1d1b",
  inkSoft: "#5a544c",
  inkMute: "#928a80",
  accent: "#3f6b46", // muted forest
  accentSoft: "#e8efe9",
  red: "#9a2a2a",
  redSoft: "#fbeaea",
  amber: "#8a5a14",
  amberSoft: "#fbf1de",
  green: "#2f6037",
  greenSoft: "#e6efe6",
}

function fmtMoney(n: number | null | undefined, opts?: { signed?: boolean }) {
  if (n == null || Number.isNaN(n)) return "—"
  const sign = opts?.signed && n > 0 ? "+" : ""
  return `${sign}$${Math.round(n).toLocaleString("en-AU")}`
}

function fmtMoneyFine(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—"
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number | null | undefined, opts?: { signed?: boolean; decimals?: number }) {
  if (n == null || Number.isNaN(n)) return "—"
  const d = opts?.decimals ?? 1
  const sign = opts?.signed && n > 0 ? "+" : ""
  return `${sign}${n.toFixed(d)}%`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function statusTone(status: "ok" | "amber" | "red" | "no-target"): {
  bg: string
  ink: string
  label: string
} {
  switch (status) {
    case "ok":
      return { bg: C.greenSoft, ink: C.green, label: "On target" }
    case "amber":
      return { bg: C.amberSoft, ink: C.amber, label: "Close" }
    case "red":
      return { bg: C.redSoft, ink: C.red, label: "Off target" }
    default:
      return { bg: "#f4f1ec", ink: C.inkMute, label: "No target" }
  }
}

// ─── Section renderers ─────────────────────────────────────────────

function header(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  const range = `${formatDateRange(snapshot.weekStart, snapshot.weekEnd)}`
  return `
    <tr>
      <td style="padding:28px 28px 18px 28px;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Tarte Kitchen · Weekly digest</div>
        <div style="margin-top:6px;font-size:24px;line-height:1.2;color:${C.ink};font-weight:600;font-family:Georgia,'Times New Roman',serif;">${escapeHtml(range)}</div>
        <div style="margin-top:14px;padding:14px 16px;background:${C.accentSoft};border-left:3px solid ${C.accent};border-radius:4px;color:${C.ink};font-size:15px;line-height:1.5;">${escapeHtml(narrative.headline)}</div>
      </td>
    </tr>`
}

function snapshotTiles(snapshot: WeeklyDigestSnapshot) {
  const sales = snapshot.sales
  const tiles = [
    {
      label: "Sales (ex GST)",
      value: fmtMoney(sales.totalThisWeek),
      sub: sales.wowChangePct != null ? `${fmtPct(sales.wowChangePct, { signed: true })} vs last week` : "no comparison",
      tone: sales.wowChangePct != null && sales.wowChangePct < -5 ? "red" : sales.wowChangePct != null && sales.wowChangePct > 0 ? "green" : "neutral",
    },
    {
      label: "Labour total",
      value: fmtMoney(snapshot.labour.perVenue.reduce((s, v) => s + (v.grossWages || 0), 0)),
      sub: avgLabourPct(snapshot) != null ? `${fmtPct(avgLabourPct(snapshot))} avg` : "—",
      tone: "neutral",
    },
    {
      label: "COGS avg",
      value: avgCogsPct(snapshot) != null ? fmtPct(avgCogsPct(snapshot)) : "—",
      sub: snapshot.cogs.weekStartWed ? `wk ${snapshot.cogs.weekStartWed.slice(5)}` : "no data",
      tone: "neutral",
    },
    {
      label: "Wastage",
      value: fmtMoney(snapshot.wastage.totalDollarsThisWeek),
      sub:
        snapshot.wastage.wowChangePct != null
          ? `${fmtPct(snapshot.wastage.wowChangePct, { signed: true })} vs last`
          : "no comparison",
      tone:
        snapshot.wastage.wowChangePct != null && snapshot.wastage.wowChangePct > 10
          ? "red"
          : snapshot.wastage.wowChangePct != null && snapshot.wastage.wowChangePct < -10
            ? "green"
            : "neutral",
    },
    {
      label: "Reviews",
      value: String(snapshot.reviews.totalCount),
      sub:
        snapshot.reviews.averageRating != null
          ? `${snapshot.reviews.averageRating.toFixed(1)}★ avg`
          : "no new reviews",
      tone: "neutral",
    },
  ]

  const toneStyle = (t: string) =>
    t === "green"
      ? `color:${C.green};`
      : t === "red"
        ? `color:${C.red};`
        : `color:${C.inkSoft};`

  return `
    <tr>
      <td style="padding:0 18px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:10px 0;">
          <tr>
            ${tiles
              .map(
                (t) => `
                <td style="background:${C.card};border:1px solid ${C.border};border-radius:8px;padding:14px 12px;vertical-align:top;width:20%;">
                  <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">${escapeHtml(t.label)}</div>
                  <div style="margin-top:6px;font-size:18px;color:${C.ink};font-weight:600;">${escapeHtml(t.value)}</div>
                  <div style="margin-top:4px;font-size:11px;${toneStyle(t.tone)}">${escapeHtml(t.sub)}</div>
                </td>`
              )
              .join("")}
          </tr>
        </table>
      </td>
    </tr>
    <tr><td style="height:18px;"></td></tr>`
}

function sectionHeader(title: string, subtitle?: string) {
  return `
    <div style="padding:0 28px;margin-top:8px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${C.ink};font-weight:600;letter-spacing:-0.01em;">${escapeHtml(title)}</div>
      ${subtitle ? `<div style="margin-top:4px;font-size:13px;color:${C.inkSoft};line-height:1.5;">${escapeHtml(subtitle)}</div>` : ""}
    </div>`
}

function salesSection(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  const rows = snapshot.sales.perVenue
    .map((v) => {
      const wow = v.wowPct
      const wowColor = wow == null ? C.inkMute : wow < -5 ? C.red : wow > 0 ? C.green : C.inkSoft
      const wowBg = wow == null ? "transparent" : wow < -5 ? C.redSoft : wow > 0 ? C.greenSoft : "transparent"
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};font-size:14px;color:${C.ink};">${escapeHtml(v.venue)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};font-size:14px;color:${C.ink};text-align:right;font-variant-numeric:tabular-nums;">${fmtMoney(v.thisWeek)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};font-size:14px;color:${C.inkSoft};text-align:right;font-variant-numeric:tabular-nums;">${fmtMoney(v.lastWeek)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};text-align:right;">
            <span style="display:inline-block;padding:2px 8px;background:${wowBg};color:${wowColor};border-radius:4px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;">${wow == null ? "—" : fmtPct(wow, { signed: true })}</span>
          </td>
        </tr>`
    })
    .join("")

  return `
    ${sectionHeader("Sales movement", narrative.sectionNotes.sales)}
    <div style="padding:14px 18px 4px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${C.card};border:1px solid ${C.border};border-radius:8px;border-collapse:collapse;overflow:hidden;">
        <thead>
          <tr style="background:${C.borderSoft};">
            <th style="padding:9px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Venue</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">This week</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Last week</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">WoW</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

function wagesSection(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  if (snapshot.labour.perVenue.every((v) => v.departmentGroups.length === 0)) {
    return `${sectionHeader("Wages vs target", narrative.sectionNotes.wages)}
      <div style="padding:8px 28px 0;color:${C.inkMute};font-size:13px;">No labour data uploaded for this week.</div>`
  }

  const venueBlocks = snapshot.labour.perVenue
    .filter((v) => v.departmentGroups.length > 0)
    .map((v) => {
      const groupRows = v.departmentGroups
        .map((g) => {
          const tone = statusTone(g.status)
          const targetCell = g.target
            ? `${g.target.min.toFixed(2)}–${g.target.max.toFixed(2)}%`
            : "—"
          return `
            <tr>
              <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.ink};">${escapeHtml(g.label)}</td>
              <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.ink};text-align:right;font-variant-numeric:tabular-nums;">${fmtMoney(g.dollars)}</td>
              <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.ink};text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${g.pct != null ? fmtPct(g.pct, { decimals: 2 }) : "—"}</td>
              <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:12px;color:${C.inkSoft};text-align:right;">${escapeHtml(targetCell)}</td>
              <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};text-align:right;">
                <span style="display:inline-block;padding:2px 8px;background:${tone.bg};color:${tone.ink};border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0.02em;">${escapeHtml(tone.label)}</span>
              </td>
            </tr>`
        })
        .join("")
      const overall =
        v.overallPct != null
          ? `Overall ${fmtPct(v.overallPct, { decimals: 2 })} · ${fmtMoney(v.grossWages)} wages on ${fmtMoney(v.revenueExGst ?? 0)} revenue`
          : "—"
      return `
        <div style="margin:0 18px 12px;">
          <div style="background:${C.card};border:1px solid ${C.border};border-radius:8px;overflow:hidden;">
            <div style="padding:10px 14px;background:${C.borderSoft};">
              <span style="font-size:13px;font-weight:600;color:${C.ink};">${escapeHtml(v.venue)}</span>
              <span style="margin-left:8px;font-size:12px;color:${C.inkSoft};">${escapeHtml(overall)}</span>
            </div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
              ${groupRows}
            </table>
          </div>
        </div>`
    })
    .join("")

  return `
    ${sectionHeader("Wages vs target", narrative.sectionNotes.wages)}
    <div style="height:14px;"></div>
    ${venueBlocks}`
}

function cogsSection(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  const rows = snapshot.cogs.perVenue
    .map((v) => {
      const delta = v.delta
      const tone = delta == null ? "—" : delta > 1 ? "red" : delta > 0 ? "amber" : "green"
      const toneColor = tone === "red" ? C.red : tone === "amber" ? C.amber : tone === "green" ? C.green : C.inkMute
      const toneBg = tone === "red" ? C.redSoft : tone === "amber" ? C.amberSoft : tone === "green" ? C.greenSoft : "transparent"
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};font-size:14px;color:${C.ink};">${escapeHtml(v.venue)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};font-size:14px;color:${C.ink};text-align:right;font-variant-numeric:tabular-nums;">${v.cogsPct != null ? fmtPct(v.cogsPct, { decimals: 2 }) : "—"}</td>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.inkSoft};text-align:right;font-variant-numeric:tabular-nums;">${v.targetPct != null ? fmtPct(v.targetPct, { decimals: 2 }) : "—"}</td>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};text-align:right;">
            ${delta == null ? `<span style="color:${C.inkMute};">—</span>` : `<span style="display:inline-block;padding:2px 8px;background:${toneBg};color:${toneColor};border-radius:4px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;">${fmtPct(delta, { signed: true, decimals: 2 })}</span>`}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid ${C.borderSoft};font-size:12px;color:${C.inkSoft};text-align:right;">${v.biggestCategory ? `${escapeHtml(v.biggestCategory.name)} ${fmtMoney(v.biggestCategory.dollars)}` : "—"}</td>
        </tr>`
    })
    .join("")

  return `
    ${sectionHeader("COGS", narrative.sectionNotes.cogs)}
    <div style="padding:14px 18px 4px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${C.card};border:1px solid ${C.border};border-radius:8px;border-collapse:collapse;overflow:hidden;">
        <thead>
          <tr style="background:${C.borderSoft};">
            <th style="padding:9px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Venue</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">COGS %</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Target</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">vs target</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Biggest category</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

function wastageSection(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  const topItemRows = snapshot.wastage.topItems
    .slice(0, 8)
    .map(
      (w) => `
        <tr>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.ink};">${escapeHtml(w.name)}</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:12px;color:${C.inkSoft};">${escapeHtml(w.venue)}</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.ink};text-align:right;font-variant-numeric:tabular-nums;">${fmtMoneyFine(w.totalDollars)}</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.inkSoft};text-align:right;font-variant-numeric:tabular-nums;">${w.occurrences}×</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:12px;color:${C.inkMute};">${w.reason ? escapeHtml(w.reason.replace(/_/g, " ").toLowerCase()) : "—"}</td>
        </tr>`
    )
    .join("")

  const offenders =
    snapshot.wastage.recurringOffenders.length > 0
      ? `<div style="margin:12px 18px 0;padding:12px 14px;background:${C.amberSoft};border-radius:6px;border:1px solid ${C.amber}33;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.amber};font-weight:600;">Recurring offenders</div>
          <div style="margin-top:6px;font-size:13px;color:${C.ink};line-height:1.5;">
            ${snapshot.wastage.recurringOffenders.map((o) => `<strong>${escapeHtml(o.name)}</strong> — ${o.daysSeen} days · ${o.venues.map(escapeHtml).join(", ")}`).join("<br/>")}
          </div>
        </div>`
      : ""

  return `
    ${sectionHeader("Wastage", narrative.sectionNotes.wastage)}
    <div style="padding:14px 18px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${C.card};border:1px solid ${C.border};border-radius:8px;border-collapse:collapse;overflow:hidden;">
        <thead>
          <tr style="background:${C.borderSoft};">
            <th style="padding:9px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Item</th>
            <th style="padding:9px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Venue</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Total $</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Count</th>
            <th style="padding:9px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Reason</th>
          </tr>
        </thead>
        <tbody>${topItemRows || `<tr><td colspan="5" style="padding:14px;color:${C.inkMute};font-size:13px;">No wastage logged this week.</td></tr>`}</tbody>
      </table>
    </div>
    ${offenders}`
}

function priceSpikesSection(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  if (snapshot.priceSpikes.count === 0) {
    return `${sectionHeader("Supplier price changes", narrative.sectionNotes.prices)}
      <div style="padding:8px 28px 0;color:${C.inkMute};font-size:13px;">No invoice-driven price changes registered this week.</div>`
  }
  const rows = snapshot.priceSpikes.items
    .map((p) => {
      const tone = Math.abs(p.changePct) >= 15 ? "red" : Math.abs(p.changePct) >= 8 ? "amber" : "neutral"
      const toneColor = tone === "red" ? C.red : tone === "amber" ? C.amber : C.inkSoft
      const toneBg = tone === "red" ? C.redSoft : tone === "amber" ? C.amberSoft : "transparent"
      return `
        <tr>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.ink};">${escapeHtml(p.ingredient)}</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:12px;color:${C.inkSoft};">${escapeHtml(p.supplier ?? "—")}</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.inkSoft};text-align:right;font-variant-numeric:tabular-nums;">${fmtMoneyFine(p.oldPrice)}</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};font-size:13px;color:${C.ink};text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${fmtMoneyFine(p.newPrice)}</td>
          <td style="padding:8px 14px;border-bottom:1px solid ${C.borderSoft};text-align:right;">
            <span style="display:inline-block;padding:2px 8px;background:${toneBg};color:${toneColor};border-radius:4px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;">${fmtPct(p.changePct, { signed: true })}</span>
          </td>
        </tr>`
    })
    .join("")
  return `
    ${sectionHeader("Supplier price changes", narrative.sectionNotes.prices)}
    <div style="padding:14px 18px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${C.card};border:1px solid ${C.border};border-radius:8px;border-collapse:collapse;overflow:hidden;">
        <thead>
          <tr style="background:${C.borderSoft};">
            <th style="padding:9px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Ingredient</th>
            <th style="padding:9px 14px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Supplier</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Was</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Now</th>
            <th style="padding:9px 14px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">Change</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

function topSellersSection(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  const blocks = snapshot.topSellers.perVenue
    .filter((v) => v.byQuantity.length > 0)
    .map((v) => {
      const list = v.byQuantity
        .slice(0, 6)
        .map(
          (s, i) => `
            <tr>
              <td style="padding:6px 14px;font-size:13px;color:${C.inkMute};width:24px;text-align:right;font-variant-numeric:tabular-nums;">${i + 1}</td>
              <td style="padding:6px 14px;font-size:13px;color:${C.ink};">${escapeHtml(s.name)}</td>
              <td style="padding:6px 14px;font-size:13px;color:${C.inkSoft};text-align:right;font-variant-numeric:tabular-nums;">${s.qty}</td>
              <td style="padding:6px 14px;font-size:13px;color:${C.inkSoft};text-align:right;font-variant-numeric:tabular-nums;">${fmtMoney(s.revenue)}</td>
            </tr>`
        )
        .join("")
      const risers = v.risers.length > 0
        ? `<div style="padding:6px 14px 10px;font-size:12px;color:${C.green};">↑ new in top 10: ${v.risers.map(escapeHtml).join(", ")}</div>`
        : ""
      return `
        <div style="margin:0 18px 12px;">
          <div style="background:${C.card};border:1px solid ${C.border};border-radius:8px;overflow:hidden;">
            <div style="padding:10px 14px;background:${C.borderSoft};font-size:13px;font-weight:600;color:${C.ink};">${escapeHtml(v.venue)}</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
              ${list}
            </table>
            ${risers}
          </div>
        </div>`
    })
    .join("")
  if (!blocks)
    return `${sectionHeader("Top sellers", narrative.sectionNotes.topSellers)}
      <div style="padding:8px 28px 0;color:${C.inkMute};font-size:13px;">No POS sales data synced for this week.</div>`
  return `
    ${sectionHeader("Top sellers", narrative.sectionNotes.topSellers)}
    <div style="height:14px;"></div>
    ${blocks}`
}

function reviewsSection(snapshot: WeeklyDigestSnapshot, narrative: DigestNarrative) {
  const venueTiles = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:10px 0;">
      <tr>
        ${snapshot.reviews.perVenue
          .map(
            (v) => `
            <td style="background:${C.card};border:1px solid ${C.border};border-radius:8px;padding:12px;vertical-align:top;width:33.33%;">
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.inkMute};font-weight:600;">${escapeHtml(v.venue)}</div>
              <div style="margin-top:6px;font-size:18px;color:${C.ink};font-weight:600;">${v.aggregateRating != null ? v.aggregateRating.toFixed(1) + "★" : "—"}</div>
              <div style="font-size:11px;color:${C.inkMute};">${v.aggregateTotalRatings != null ? v.aggregateTotalRatings.toLocaleString() + " ratings" : ""}</div>
              <div style="margin-top:8px;font-size:12px;color:${C.inkSoft};">${v.count > 0 ? v.count + " new · " + (v.averageThisWeek?.toFixed(1) ?? "—") + "★ this wk" : "no new reviews"}</div>
            </td>`
          )
          .join("")}
      </tr>
    </table>`

  const negatives =
    snapshot.reviews.overallNegatives.length > 0
      ? `<div style="margin:12px 18px 0;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.red};font-weight:600;padding:0 0 6px;">Needs attention</div>
          ${snapshot.reviews.overallNegatives
            .map(
              (r) => `
              <div style="margin-bottom:10px;padding:12px 14px;background:${C.redSoft};border-radius:6px;border-left:3px solid ${C.red};">
                <div style="font-size:12px;color:${C.inkSoft};">${escapeHtml(r.venue)} · ${r.rating}★ · ${escapeHtml(r.author ?? "Anonymous")}</div>
                ${r.summary ? `<div style="margin-top:4px;font-size:13px;font-weight:600;color:${C.ink};">${escapeHtml(r.summary)}</div>` : ""}
                ${r.text ? `<div style="margin-top:4px;font-size:13px;color:${C.ink};line-height:1.5;font-style:italic;">“${escapeHtml(r.text)}”</div>` : ""}
              </div>`
            )
            .join("")}
        </div>`
      : ""

  return `
    ${sectionHeader("Google reviews", narrative.sectionNotes.reviews)}
    <div style="padding:14px 18px 0;">
      ${venueTiles}
    </div>
    ${negatives}`
}

function actionList(narrative: DigestNarrative) {
  if (!narrative.actionItems.length) return ""
  return `
    <div style="margin:24px 18px 0;padding:16px 18px;background:${C.accentSoft};border-radius:8px;border:1px solid ${C.accent}33;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.accent};font-weight:700;">This week's actions</div>
      <ol style="margin:10px 0 0 18px;padding:0;color:${C.ink};font-size:14px;line-height:1.6;">
        ${narrative.actionItems.map((a) => `<li style="margin-bottom:4px;">${escapeHtml(a)}</li>`).join("")}
      </ol>
    </div>`
}

function footer(snapshot: WeeklyDigestSnapshot) {
  const labourRange =
    snapshot.labourWeekStart && snapshot.labourWeekEnd
      ? `Labour & COGS reflect Wed ${snapshot.labourWeekStart} → Tue ${snapshot.labourWeekEnd}.`
      : "Labour & COGS not yet uploaded for this week."
  return `
    <tr>
      <td style="padding:24px 28px 28px;border-top:1px solid ${C.border};">
        <div style="font-size:11px;color:${C.inkMute};line-height:1.6;">
          Generated for Chloe — Tarte Kitchen owner inbox only.<br/>
          Sales · wastage · reviews cover ${escapeHtml(formatDateRange(snapshot.weekStart, snapshot.weekEnd))}. ${escapeHtml(labourRange)}<br/>
          <a href="https://kitchen.tarte.com.au/dashboard" style="color:${C.accent};text-decoration:none;">Open dashboard</a>
        </div>
      </td>
    </tr>`
}

// ─── Top-level assembly ────────────────────────────────────────────

export function renderDigestHtml(
  snapshot: WeeklyDigestSnapshot,
  narrative: DigestNarrative
): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Tarte weekly digest</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink};">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${C.bg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:${C.bg};border-radius:12px;">
        ${header(snapshot, narrative)}
        ${snapshotTiles(snapshot)}
        <tr><td>${salesSection(snapshot, narrative)}</td></tr>
        <tr><td style="padding-top:18px;">${wagesSection(snapshot, narrative)}</td></tr>
        <tr><td style="padding-top:18px;">${cogsSection(snapshot, narrative)}</td></tr>
        <tr><td style="padding-top:18px;">${wastageSection(snapshot, narrative)}</td></tr>
        <tr><td style="padding-top:18px;">${priceSpikesSection(snapshot, narrative)}</td></tr>
        <tr><td style="padding-top:18px;">${topSellersSection(snapshot, narrative)}</td></tr>
        <tr><td style="padding-top:18px;">${reviewsSection(snapshot, narrative)}</td></tr>
        <tr><td>${actionList(narrative)}</td></tr>
        ${footer(snapshot)}
      </table>
    </td>
  </tr>
</table>
</body></html>`
}

// ─── Plain-text fallback ───────────────────────────────────────────

export function renderDigestText(
  snapshot: WeeklyDigestSnapshot,
  narrative: DigestNarrative
): string {
  const lines: string[] = []
  lines.push(`TARTE KITCHEN — WEEKLY DIGEST`)
  lines.push(formatDateRange(snapshot.weekStart, snapshot.weekEnd))
  lines.push(``)
  lines.push(narrative.headline)
  lines.push(``)
  lines.push(`SALES`)
  for (const v of snapshot.sales.perVenue) {
    lines.push(
      `  ${v.venue.padEnd(14)} ${fmtMoney(v.thisWeek).padStart(10)}   (${v.wowPct != null ? fmtPct(v.wowPct, { signed: true }) : "—"})`
    )
  }
  lines.push(``)
  lines.push(`WAGES vs TARGET`)
  for (const v of snapshot.labour.perVenue) {
    if (!v.departmentGroups.length) continue
    lines.push(`  ${v.venue} — overall ${v.overallPct != null ? fmtPct(v.overallPct) : "—"}`)
    for (const g of v.departmentGroups) {
      const target = g.target ? `${g.target.min}-${g.target.max}%` : "no target"
      lines.push(
        `    ${g.label.padEnd(22)} ${fmtMoney(g.dollars).padStart(8)}  ${g.pct != null ? fmtPct(g.pct).padStart(6) : "—".padStart(6)}  (${target}) ${g.status}`
      )
    }
  }
  lines.push(``)
  lines.push(`COGS`)
  for (const v of snapshot.cogs.perVenue) {
    lines.push(
      `  ${v.venue.padEnd(14)} ${v.cogsPct != null ? fmtPct(v.cogsPct) : "—"}   target ${v.targetPct != null ? fmtPct(v.targetPct) : "—"}`
    )
  }
  lines.push(``)
  lines.push(
    `WASTAGE  ${fmtMoney(snapshot.wastage.totalDollarsThisWeek)} this week (${snapshot.wastage.wowChangePct != null ? fmtPct(snapshot.wastage.wowChangePct, { signed: true }) : "no comparison"})`
  )
  for (const w of snapshot.wastage.topItems.slice(0, 6)) {
    lines.push(`  ${w.name} — ${fmtMoneyFine(w.totalDollars)} (${w.occurrences}× · ${w.venue})`)
  }
  if (snapshot.priceSpikes.count > 0) {
    lines.push(``)
    lines.push(`SUPPLIER PRICE CHANGES`)
    for (const p of snapshot.priceSpikes.items.slice(0, 5)) {
      lines.push(
        `  ${p.ingredient} (${p.supplier ?? "—"}): ${fmtMoneyFine(p.oldPrice)} → ${fmtMoneyFine(p.newPrice)} (${fmtPct(p.changePct, { signed: true })})`
      )
    }
  }
  lines.push(``)
  lines.push(`REVIEWS`)
  for (const v of snapshot.reviews.perVenue) {
    lines.push(
      `  ${v.venue.padEnd(14)} ${v.aggregateRating != null ? v.aggregateRating.toFixed(1) + "★" : "—"}  ${v.count} new`
    )
  }
  if (narrative.actionItems.length > 0) {
    lines.push(``)
    lines.push(`ACTIONS`)
    narrative.actionItems.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`))
  }
  lines.push(``)
  lines.push(`Open dashboard: https://kitchen.tarte.com.au/dashboard`)
  return lines.join("\n")
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  const sameMonth = s.getMonth() === e.getMonth()
  const sameYear = s.getFullYear() === e.getFullYear()
  const monthFmt: Intl.DateTimeFormatOptions = { month: "long" }
  const sMonth = s.toLocaleDateString("en-AU", monthFmt)
  const eMonth = e.toLocaleDateString("en-AU", monthFmt)
  if (sameMonth && sameYear) {
    return `${s.getDate()}–${e.getDate()} ${sMonth} ${e.getFullYear()}`
  }
  return `${s.getDate()} ${sMonth} – ${e.getDate()} ${eMonth} ${e.getFullYear()}`
}

function avgLabourPct(snapshot: WeeklyDigestSnapshot): number | null {
  const vals = snapshot.labour.perVenue
    .map((v) => v.overallPct)
    .filter((x): x is number => x != null)
  if (!vals.length) return null
  return vals.reduce((s, n) => s + n, 0) / vals.length
}

function avgCogsPct(snapshot: WeeklyDigestSnapshot): number | null {
  const vals = snapshot.cogs.perVenue
    .map((v) => v.cogsPct)
    .filter((x): x is number => x != null)
  if (!vals.length) return null
  return vals.reduce((s, n) => s + n, 0) / vals.length
}
