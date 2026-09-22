/**
 * One look for every email Tarte Kitchen sends to a person.
 *
 * The colours are the kitchen app's own (src/app/kitchen/kitchen.css): sage,
 * charcoal and gold on warm off-white, serif headings. Every report, digest
 * and alert composes its body from the small parts below so they all read
 * the same way on a phone: a title, the headline numbers as tiles, then
 * short cards, each with a heading and a list or a few rows.
 *
 * Email-safe by construction: inline styles only, tables for layout, 600px
 * wide, system fonts, no images. Text is escaped at the edge: every helper
 * takes plain text unless its name ends in Html.
 */

export const BRAND = {
  bg: "#f6f5f2",
  card: "#ffffff",
  line: "#e8e6e0",
  ink: "#3c3e3f",
  inkSoft: "#6a6c6d",
  inkMute: "#9ea0a0",
  sage: "#b0c6c1",
  sageSoft: "#e3ebe8",
  sageDeep: "#5f7f6f",
  charcoal: "#3c3e3f",
  charcoalSoft: "#ededec",
  gold: "#dfc566",
  goldSoft: "#f6ecc7",
  goldDeep: "#7a6420",
  done: "#5f7f6f",
  doneSoft: "#e0ebe5",
  warn: "#c06a3b",
  warnSoft: "#f5e2d6",
  red: "#b42318",
  redSoft: "#f5e2d6",
  redDeep: "#8c3f24",
} as const

export const FONT_DISPLAY = "Georgia,'Times New Roman',Times,serif"
export const FONT_BODY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export const APP_URL = "https://kitchen.tarte.com.au"

export type Tone = "done" | "warn" | "red" | "gold" | "neutral" | "sage"

export function toneColours(tone: Tone): { ink: string; bg: string; dot: string } {
  switch (tone) {
    case "done":
      return { ink: BRAND.done, bg: BRAND.doneSoft, dot: BRAND.done }
    case "warn":
      return { ink: BRAND.warn, bg: BRAND.warnSoft, dot: BRAND.warn }
    case "red":
      return { ink: BRAND.redDeep, bg: BRAND.redSoft, dot: BRAND.red }
    case "gold":
      return { ink: BRAND.goldDeep, bg: BRAND.goldSoft, dot: BRAND.gold }
    case "sage":
      return { ink: BRAND.sageDeep, bg: BRAND.sageSoft, dot: BRAND.sage }
    default:
      return { ink: BRAND.inkSoft, bg: BRAND.charcoalSoft, dot: BRAND.inkMute }
  }
}

export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Escape, then keep the author's line breaks. */
export function escLines(s: string): string {
  return esc(s).replace(/\n/g, "<br>")
}

// ─── Page ──────────────────────────────────────────────────────────

export interface ShellParams {
  /** Small uppercase line above the title, e.g. "GM weekly report". */
  kicker: string
  title: string
  /** One line under the title: the week, the day, the venue. */
  subtitle?: string
  /** Hidden preview text shown by mail apps next to the subject. */
  preheader?: string
  /** Already-rendered blocks, in order. Use section(), tiles(), callout(). */
  sections: string[]
  /** Footer line under the cards. Defaults to a plain sign-off. */
  footer?: string
}

export function shell(p: ShellParams): string {
  const preheader = p.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${BRAND.bg};opacity:0;">${esc(p.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : ""
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(p.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
<tr><td align="center" style="padding:20px 12px 32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
  <tr><td style="padding:0 4px 14px 4px;">
    <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.sageDeep};font-weight:700;">Tarte Kitchen &middot; ${esc(p.kicker)}</div>
    <div style="margin-top:6px;font-family:${FONT_DISPLAY};font-size:28px;line-height:1.15;color:${BRAND.charcoal};font-weight:600;letter-spacing:-0.01em;">${esc(p.title)}</div>
    ${p.subtitle ? `<div style="margin-top:6px;font-family:${FONT_BODY};font-size:15px;line-height:1.4;color:${BRAND.inkSoft};">${esc(p.subtitle)}</div>` : ""}
  </td></tr>
  ${p.sections.map((s) => `<tr><td style="padding:0 0 12px 0;">${s}</td></tr>`).join("\n")}
  <tr><td style="padding:10px 4px 0 4px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${BRAND.inkMute};">
    ${p.footer ?? `Sent by Tarte Kitchen. <a href="${APP_URL}" style="color:${BRAND.sageDeep};">kitchen.tarte.com.au</a>`}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// ─── Blocks ────────────────────────────────────────────────────────

/** A white card with an optional heading. Body is already-rendered HTML. */
export function section(title: string | null, bodyHtml: string, opts?: { tone?: Tone; note?: string }): string {
  const t = opts?.tone ? toneColours(opts.tone) : null
  const border = t ? `border-left:4px solid ${t.dot};` : ""
  const head = title
    ? `<div style="font-family:${FONT_DISPLAY};font-size:18px;line-height:1.2;color:${BRAND.charcoal};font-weight:600;padding:0 0 ${opts?.note ? 2 : 10}px 0;">${esc(title)}</div>`
    : ""
  const note = opts?.note
    ? `<div style="font-family:${FONT_BODY};font-size:13px;line-height:1.4;color:${BRAND.inkSoft};padding:0 0 10px 0;">${esc(opts.note)}</div>`
    : ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:14px;${border}">
  <tr><td style="padding:16px 18px;">${head}${note}${bodyHtml}</td></tr>
</table>`
}

export interface Tile {
  label: string
  value: string
  sub?: string
  tone?: Tone
}

/** Headline numbers, two to a row so they stay readable on a phone. */
export function tiles(list: Tile[]): string {
  if (!list.length) return ""
  const rows: Tile[][] = []
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2))
  const cell = (t: Tile | undefined, last: boolean) => {
    if (!t) return `<td width="50%" style="padding:0;"></td>`
    const c = toneColours(t.tone ?? "neutral")
    const valueColour = t.tone && t.tone !== "neutral" ? c.ink : BRAND.charcoal
    return `<td width="50%" valign="top" style="padding:0 ${last ? 0 : 6}px 0 ${last ? 6 : 0}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:14px;">
        <tr><td style="padding:14px 16px;">
          <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.inkMute};font-weight:700;">${esc(t.label)}</div>
          <div style="margin-top:4px;font-family:${FONT_DISPLAY};font-size:26px;line-height:1.1;color:${valueColour};font-weight:600;">${esc(t.value)}</div>
          ${t.sub ? `<div style="margin-top:4px;font-family:${FONT_BODY};font-size:12px;line-height:1.35;color:${BRAND.inkSoft};">${esc(t.sub)}</div>` : ""}
        </td></tr>
      </table>
    </td>`
  }
  return rows
    .map(
      (r, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${i ? "margin-top:12px;" : ""}">
  <tr>${cell(r[0], false)}${cell(r[1], true)}</tr>
</table>`
    )
    .join("\n")
}

export interface ListItem {
  text: string
  /** Muted second line: the reason, the reading, who and when. */
  detail?: string
  /** Colours the marker. done = sage tick, warn = rust cross, gold = attention, neutral = dot. */
  tone?: Tone
  /** Small pill on the right, e.g. "3 days left". */
  tag?: string
  tagTone?: Tone
}

/** A checklist-style list: coloured marker, text, muted detail. */
export function list(items: ListItem[]): string {
  if (!items.length) return ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${items
  .map((it, i) => {
    const tone = it.tone ?? "neutral"
    const c = toneColours(tone)
    const mark = tone === "done" ? "&#10003;" : tone === "warn" || tone === "red" ? "&#10005;" : "&#8226;"
    const tag = it.tag ? pill(it.tag, it.tagTone ?? tone) : ""
    return `  <tr>
    <td width="26" valign="top" style="padding:${i ? 8 : 0}px 0 0 0;">
      <div style="width:20px;height:20px;line-height:20px;border-radius:10px;background:${c.bg};color:${c.ink};font-family:${FONT_BODY};font-size:12px;font-weight:700;text-align:center;">${mark}</div>
    </td>
    <td valign="top" style="padding:${i ? 8 : 0}px 0 0 8px;font-family:${FONT_BODY};font-size:15px;line-height:1.4;color:${BRAND.ink};">
      ${esc(it.text)}${it.detail ? `<div style="font-size:13px;line-height:1.4;color:${BRAND.inkSoft};margin-top:1px;">${escLines(it.detail)}</div>` : ""}
    </td>
    ${tag ? `<td valign="top" align="right" style="padding:${i ? 8 : 0}px 0 0 8px;white-space:nowrap;">${tag}</td>` : ""}
  </tr>`
  })
  .join("\n")}
</table>`
}

export interface Row {
  label: string
  value: string
  tone?: Tone
}

/**
 * Label on the left, value on the right, for readings and small facts.
 * When any value runs long (a sentence rather than a number) every row
 * stacks the label above the value instead, so nothing is squeezed.
 */
export function rows(items: Row[], opts?: { stacked?: boolean }): string {
  if (!items.length) return ""
  const stacked = opts?.stacked ?? items.some((r) => r.value.length > 28 || r.value.includes("\n"))
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${items
  .map((r, i) => {
    const colour = r.tone && r.tone !== "neutral" ? toneColours(r.tone).ink : BRAND.charcoal
    const top = i ? `border-top:1px solid ${BRAND.line};` : ""
    if (stacked) {
      return `  <tr>
    <td valign="top" style="padding:${i ? 9 : 0}px 0 9px 0;${top}">
      <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.inkMute};font-weight:700;">${esc(r.label)}</div>
      <div style="margin-top:3px;font-family:${FONT_BODY};font-size:15px;line-height:1.45;color:${colour};">${escLines(r.value)}</div>
    </td>
  </tr>`
    }
    return `  <tr>
    <td valign="top" style="padding:8px 8px 8px 0;${top}font-family:${FONT_BODY};font-size:14px;line-height:1.4;color:${BRAND.inkSoft};white-space:nowrap;">${esc(r.label)}</td>
    <td valign="top" align="right" style="padding:8px 0;${top}font-family:${FONT_BODY};font-size:14px;line-height:1.4;color:${colour};font-weight:600;">${escLines(r.value)}</td>
  </tr>`
  })
  .join("\n")}
</table>`
}

/** A soft coloured box with a left bar. Plain text in, line breaks kept. */
export function callout(text: string, tone: Tone = "sage", opts?: { label?: string }): string {
  const c = toneColours(tone)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.bg};border-radius:10px;border-left:4px solid ${c.dot};">
  <tr><td style="padding:12px 14px;">
    ${opts?.label ? `<div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${c.ink};font-weight:700;margin-bottom:4px;">${esc(opts.label)}</div>` : ""}
    <div style="font-family:${FONT_BODY};font-size:15px;line-height:1.5;color:${BRAND.ink};">${escLines(text)}</div>
  </td></tr>
</table>`
}

export function pill(text: string, tone: Tone = "neutral"): string {
  const c = toneColours(tone)
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:${c.bg};color:${c.ink};font-family:${FONT_BODY};font-size:11px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;">${esc(text)}</span>`
}

export function button(label: string, href: string, opts?: { secondary?: boolean }): string {
  const bg = opts?.secondary ? BRAND.card : BRAND.charcoal
  const ink = opts?.secondary ? BRAND.charcoal : "#ffffff"
  const border = opts?.secondary ? `border:1px solid ${BRAND.line};` : ""
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 2px 0;">
  <tr><td style="background:${bg};border-radius:999px;${border}">
    <a href="${esc(href)}" style="display:inline-block;padding:10px 20px;font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${ink};text-decoration:none;">${esc(label)}</a>
  </td></tr>
</table>`
}

export function para(text: string, opts?: { muted?: boolean }): string {
  return `<div style="font-family:${FONT_BODY};font-size:${opts?.muted ? 13 : 15}px;line-height:1.5;color:${opts?.muted ? BRAND.inkSoft : BRAND.ink};margin:0 0 8px 0;">${escLines(text)}</div>`
}

/** Subheading inside a card, for grouping (a venue, a checklist). */
export function subhead(text: string, tag?: string, tagTone?: Tone): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 6px 0;">
  <tr>
    <td style="font-family:${FONT_BODY};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.sageDeep};font-weight:700;">${esc(text)}</td>
    ${tag ? `<td align="right">${pill(tag, tagTone ?? "neutral")}</td>` : ""}
  </tr>
</table>`
}

export interface TableColumn {
  header: string
  align?: "left" | "right"
}

/** A small data table. Cells are plain text; a cell may carry a tone. */
export function table(columns: TableColumn[], body: (string | { text: string; tone?: Tone; strong?: boolean })[][]): string {
  const th = columns
    .map(
      (c) =>
        `<th align="${c.align ?? "left"}" style="padding:6px 8px;font-family:${FONT_BODY};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.inkMute};font-weight:700;border-bottom:1px solid ${BRAND.line};">${esc(c.header)}</th>`
    )
    .join("")
  const tr = body
    .map(
      (r) =>
        `<tr>${r
          .map((cell, i) => {
            const c = typeof cell === "string" ? { text: cell } : cell
            const colour = c.tone && c.tone !== "neutral" ? toneColours(c.tone).ink : BRAND.ink
            return `<td align="${columns[i]?.align ?? "left"}" valign="top" style="padding:8px;font-family:${FONT_BODY};font-size:14px;line-height:1.35;color:${colour};font-weight:${c.strong ? 600 : 400};border-bottom:1px solid ${BRAND.line};">${escLines(c.text)}</td>`
          })
          .join("")}</tr>`
    )
    .join("\n")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <thead><tr>${th}</tr></thead>
  <tbody>${tr}</tbody>
</table>`
}

/** Two-up mini stat inside a card: "18 of 20" style, left aligned. */
export function bigNumber(value: string, label: string, tone?: Tone): string {
  const colour = tone && tone !== "neutral" ? toneColours(tone).ink : BRAND.charcoal
  return `<div style="font-family:${FONT_DISPLAY};font-size:34px;line-height:1.05;color:${colour};font-weight:600;">${esc(value)}</div>
<div style="margin-top:4px;font-family:${FONT_BODY};font-size:13px;line-height:1.4;color:${BRAND.inkSoft};">${esc(label)}</div>`
}

/** Progress bar, 0 to 1. */
export function progress(fraction: number, tone: Tone = "done"): string {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)))
  const c = toneColours(tone)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
  <tr><td style="background:${BRAND.charcoalSoft};border-radius:999px;height:8px;line-height:8px;font-size:0;">
    <div style="width:${pct}%;height:8px;border-radius:999px;background:${c.dot};"></div>
  </td></tr>
</table>`
}
