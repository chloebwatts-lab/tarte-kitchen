#!/usr/bin/env python3
"""
Build the "Where to Order" cheat sheet from order-forms.json.
- Active items only (Rule 1)
- Bidfood prices shown EFFECTIVE (post 4% rebate) (Rule 2)
- Sorted A-Z by ingredient; supplier shown with colour dot
Mirrors the Cowork-era artifact so it drops out of the loop.
"""
import json, html, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "scripts" / "order-forms.json").read_text())

SUPPLIER_COLOURS = {
    "Bidfood": "#c0392b",
    "Fermex": "#1f7a4d",
    "The Provedores": "#8e44ad",
    "Cheese Time": "#d4a017",
    "Fino": "#2c3e8f",
    "Gold Coast Premium Foods": "#e67e22",
}

def eff_unit_price(form, it):
    up = it.get("unitPrice")
    if up is None:
        return None
    rebate = form.get("rebatePct", 0) or 0
    return up * (1 - rebate / 100.0)

rows = []
for form in data["forms"]:
    sup = form["supplier"]
    rebate = form.get("rebatePct", 0) or 0
    for it in form["items"]:
        if it.get("active", True) is False:
            continue
        if it.get("packPrice") is None:
            continue
        eff = eff_unit_price(form, it)
        rows.append({
            "name": it["name"],
            "packSize": it.get("packSize") or "",
            "gross": it.get("packPrice"),
            "unit": it.get("unit") or "",
            "eff": eff,
            "supplier": sup,
            "rebate": rebate,
            "notes": it.get("notes") or "",
        })

rows.sort(key=lambda r: r["name"].lower())

# Group A-Z
groups = {}
for r in rows:
    first = r["name"][0].upper()
    if not first.isalpha():
        first = "#"
    groups.setdefault(first, []).append(r)

def fmt_eff(r):
    if r["eff"] is None:
        return ""
    u = r["unit"]
    return f"${r['eff']:.2f}/{u}" if u else f"${r['eff']:.2f}"

parts = []
parts.append('<!doctype html><html><head><meta charset="utf-8"><title>Where to Order — Cheat Sheet</title>')
parts.append('<style>@page{size:A4;margin:12mm}*{box-sizing:border-box}'
             'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111;margin:0;padding:12mm;max-width:210mm}'
             'header{border-bottom:4px solid #333;padding-bottom:.5em;margin-bottom:.6em}'
             'h1{margin:0;font-size:1.7em}.sub{font-size:.85em;color:#555;margin-top:.3em}'
             '.legend{font-size:.8em;color:#444;margin:.5em 0 0;display:flex;flex-wrap:wrap;gap:.8em}'
             '.legend span{display:inline-flex;align-items:center;gap:.3em}'
             '.dot{width:.7em;height:.7em;border-radius:50%;display:inline-block}'
             'h2{font-size:1.1em;margin:1em 0 .2em;color:#333;border-bottom:1px solid #ccc}'
             'table{width:100%;border-collapse:collapse;margin-bottom:.3em}'
             'thead th{background:#333;color:#fff;padding:.35em .5em;text-align:left;font-size:.72em;text-transform:uppercase}'
             'tbody td{padding:.32em .5em;border-bottom:1px solid #eee;font-size:.84em}'
             'td.eff{font-weight:600;white-space:nowrap}td.from{white-space:nowrap}'
             'td.note{font-size:.72em;color:#888}'
             '@media print{tr{page-break-inside:avoid}}</style></head><body>')
parts.append('<header><h1>Where to Order · Cheat Sheet</h1>'
             '<div class="sub">Find the ingredient, see who to order it from. Bidfood prices shown effective (after 4% rebate). · source: order-forms.json, 14 Jun 2026</div>')
parts.append('<div class="legend">')
for s, c in SUPPLIER_COLOURS.items():
    if any(r["supplier"] == s for r in rows):
        parts.append(f'<span><span class="dot" style="background:{c}"></span>{html.escape(s)}</span>')
parts.append('</div></header>')

for letter in sorted(groups.keys()):
    parts.append(f'<h2>{letter}</h2>')
    parts.append('<table><thead><tr><th style="width:42%">Ingredient</th><th style="width:16%">Pack</th>'
                 '<th style="width:13%">Price (gross)</th><th style="width:14%">Unit (eff.)</th><th style="width:15%">Order From</th></tr></thead><tbody>')
    for r in groups[letter]:
        c = SUPPLIER_COLOURS.get(r["supplier"], "#777")
        note = f'<div class="note">{html.escape(r["notes"])}</div>' if r["notes"] else ""
        parts.append(
            f'<tr><td>{html.escape(r["name"])}{note}</td>'
            f'<td>{html.escape(r["packSize"])}</td>'
            f'<td>${r["gross"]:.2f}</td>'
            f'<td class="eff">{fmt_eff(r)}</td>'
            f'<td class="from"><span class="dot" style="background:{c}"></span> {html.escape(r["supplier"])}</td></tr>'
        )
    parts.append('</tbody></table>')

parts.append(f'<footer style="margin-top:1.5em;padding-top:.6em;border-top:1px solid #ccc;font-size:.75em;color:#888">'
             f'Tarte Kitchen · {len(rows)} active items · generated 14 Jun 2026</footer>')
parts.append('</body></html>')

out = ROOT / "where-to-order-cheatsheet.html"
out.write_text("".join(parts))
print(f"Wrote {out} ({len(rows)} active items, {len(groups)} letter groups)")
