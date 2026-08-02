#!/usr/bin/env python3
"""Build printable laminate-friendly order forms from order-forms.json.

Reads the `active` flag per item directly from the JSON — no separate
REMOVE list to maintain. Add an `active: false` to any item in the JSON
to drop it from the printed forms; everything stays in sync.

Outputs `order-easy-{supplier}.html` files in the repo root.
"""
import json, html, re
from collections import defaultdict
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[1]
JSON_PATH = REPO / 'scripts' / 'order-forms.json'

with open(JSON_PATH) as f:
    forms = json.load(f)

SUPPLIER_COLOURS = {
    'Bidfood': '#c8102e',
    'Fermex': '#1f7a4d',
    'The Provedores': '#1e3a8a',
    'Gold Coast Premium Foods': '#8b5cf6',
    'Cheese Time': '#9333ea',
    'Fino': '#d97706',
}

CATEGORY_ORDER = [
    'Dairy', 'Meat', 'Pastry/Baking', 'Nuts', 'Pantry', 'Spices',
    'Oils', 'Frozen', 'Beverages', 'Cleaning', 'Packaging', 'Other',
]

def clean_name(name):
    name = re.sub(r'\s*\[NEEDS RE-QUOTE\]\s*', '', name).strip()
    name = re.sub(r'\s*\(Fermex\)\s*$', '', name).strip()
    name = re.sub(r'\s*\(Provedores\)\s*$', '', name).strip()
    return name

def render_form(sf):
    sup = sf['supplier']
    accent = SUPPLIER_COLOURS.get(sup, '#444')
    delivery_days = sf.get('deliveryDays', [])
    cutoff = sf.get('cutoff', '')
    delivery_text = f"Delivers {' / '.join(delivery_days)}" if delivery_days else ''
    if cutoff: delivery_text += f' · Cutoff {cutoff}'
    contact = sf.get('contact', '')
    email = sf.get('email', '')
    phone = sf.get('phone', '')
    contact_parts = [p for p in (contact, email, phone) if p]
    contact_line = ' · '.join(contact_parts)
    if contact_line:
        delivery_text = (delivery_text + ' · ' + contact_line) if delivery_text else contact_line

    rebate_note = ''
    if sf.get('rebatePct', 0) > 0:
        rebate_note = (
            f"Prices shown gross — Tarte gets a {sf['rebatePct']}% rebate "
            f"so the real cost is ~{sf['rebatePct']}% lower."
        )

    # Filter to active items only
    items = [it for it in sf['items'] if it.get('active', True)]
    cats = defaultdict(list)
    for it in items:
        cats[it.get('category') or 'Other'].append(it)
    for c in cats:
        cats[c].sort(key=lambda x: x['name'].lower())

    rows_html = []
    for cat in CATEGORY_ORDER:
        if cat not in cats: continue
        items_in = cats[cat]
        rows_html.append(f'    <tr class="cat-row"><td colspan="4">{html.escape(cat)}</td></tr>')
        for it in items_in:
            name = clean_name(it['name'])
            pack = it.get('packSize') or ''
            price = f"${it['packPrice']:.2f}" if it.get('packPrice') is not None else ''
            rows_html.append(
                f'    <tr><td class="item">{html.escape(name)}'
                f'<span class="price">{html.escape(price)}</span></td>'
                f'<td class="pack">{html.escape(pack)}</td>'
                f'<td class="qty"></td><td class="tick"></td></tr>'
            )

    total_items = len(items)
    rebate_html = f'<div class="rebate">{html.escape(rebate_note)}</div>' if rebate_note else ''
    html_out = f'''<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(sup)}</title>
<style>@page{{size:A4;margin:12mm}}*{{box-sizing:border-box}}body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111;margin:0;padding:12mm;max-width:210mm}}
header{{border-bottom:4px solid {accent};padding-bottom:.5em;margin-bottom:.8em;display:flex;justify-content:space-between;align-items:flex-end}}
h1{{margin:0;font-size:1.9em;color:{accent}}}.delivery{{font-size:.9em;color:#555;margin-top:.3em}}.meta{{text-align:right;font-size:.85em;color:#333}}.meta div{{margin-top:.3em}}
.rebate{{background:#fff8e1;border:1px dashed #d4a017;padding:.4em .8em;border-radius:4px;margin-bottom:.7em;font-size:.82em;color:#555}}
table{{width:100%;border-collapse:collapse}}thead th{{background:{accent};color:#fff;padding:.55em .7em;text-align:left;font-size:.85em;text-transform:uppercase}}
tbody td{{padding:.65em .7em;border-bottom:1px solid #ddd;font-size:1em}}tr.cat-row td{{background:#e8e8e8;font-weight:700;font-size:.85em;text-transform:uppercase;padding:.4em .7em;border-top:2px solid #999}}
td.item{{width:50%;line-height:1.3}}td.item .price{{display:block;font-size:.72em;color:#888;font-weight:400}}td.pack{{width:18%;color:#555;font-size:.9em}}
td.qty{{width:22%;border-left:2px dashed #bbb;height:2em}}td.tick{{width:10%;border-left:2px dashed #bbb}}thead th:nth-child(3),thead th:nth-child(4){{text-align:center}}
footer{{margin-top:1.5em;padding-top:.7em;border-top:1px solid #ddd;font-size:.8em;color:#666;display:flex;justify-content:space-between}}
@media print{{body{{padding:0}}tr{{page-break-inside:avoid}}tr.cat-row{{page-break-after:avoid}}}}</style></head>
<body><header><div><h1>{html.escape(sup)}</h1><div class="delivery">{html.escape(delivery_text)}</div></div>
<div class="meta"><div><strong>Date</strong>: ___________________</div><div><strong>Venue</strong>: Burleigh ☐ Beach House ☐ Tea Garden ☐</div><div><strong>Ordered by</strong>: ___________________</div></div></header>
{rebate_html}<table><thead><tr><th>Item</th><th>Pack</th><th>Qty</th><th>✓</th></tr></thead><tbody>
{chr(10).join(rows_html)}
</tbody></table><footer><div>{html.escape(sup)} · {total_items} items · {len(cats)} categories · 2026-06-08</div><div>Submit by: ___________________</div></footer></body></html>'''

    slug = sup.lower().replace(' ', '-').replace('the-', '')
    out_path = REPO / f'order-easy-{slug}.html'
    out_path.write_text(html_out)
    return total_items, slug

# Clean older outputs
for old in REPO.glob('order-easy-*.html'):
    old.unlink()

for sf in forms['forms']:
    # Skip suppliers with zero active items
    if not any(it.get('active', True) for it in sf['items']):
        print(f'  skipped: {sf["supplier"]} (no active items)')
        continue
    n, slug = render_form(sf)
    print(f'  {sf["supplier"]:25s} {n:3d} items → order-easy-{slug}.html')
