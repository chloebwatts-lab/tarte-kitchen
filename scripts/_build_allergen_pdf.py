#!/usr/bin/env python3
"""Build a staff allergen matrix PDF (landscape, per venue) from the query JSON."""
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak,
)

DATA = json.load(open("/tmp/allergen-matrix.json"))
OVERRIDES = json.load(open("scripts/allergen-matrix-overrides.json"))
REVIEW = {k: set(v) for k, v in OVERRIDES["reviewCells"].items()}
EXTRA_OTHER = OVERRIDES["extraOtherNotes"]
OUT = "/Users/chris/C/tarte-kitchen/Allergen-Matrix-2026-07-15.pdf"
DATE = "15 July 2026"

# FSANZ standard allergen columns, fixed order, with short display headers.
ALLERGENS = [
    ("MILK", "Milk"), ("EGG", "Egg"), ("FISH", "Fish"),
    ("CRUSTACEAN", "Crust."), ("SHELLFISH", "Shell."), ("MOLLUSC", "Moll."),
    ("PEANUT", "Peanut"), ("TREE_NUT", "Tree nut"), ("SOY", "Soy"),
    ("WHEAT", "Wheat"), ("GLUTEN", "Gluten"), ("SESAME", "Sesame"),
    ("LUPIN", "Lupin"), ("SULPHITE", "Sulph."),
]
CAT_ORDER = ["BREAKFAST", "LUNCH", "SIDES", "PASTRY", "DRINKS", "OTHER"]
CAT_LABEL = {
    "BREAKFAST": "Breakfast", "LUNCH": "Lunch", "SIDES": "Sides",
    "PASTRY": "Pastry & Bakery", "DRINKS": "Drinks", "OTHER": "Other",
    "DESSERT": "Dessert", "KIDS": "Kids", "SPECIAL": "Specials",
}

VENUES = [
    ("Tarte Bakery — Burleigh", {"BURLEIGH", "BOTH"}),
    ("Tarte Beach House — Currumbin (incl. Tea Garden & The Hideout)",
     {"BEACH_HOUSE", "TEA_GARDEN", "BOTH"}),
]

styles = getSampleStyleSheet()
h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=18, spaceAfter=2)
sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9,
                     textColor=colors.HexColor("#555555"))
cat = ParagraphStyle("cat", parent=styles["Heading2"], fontSize=12,
                     spaceBefore=8, spaceAfter=4,
                     textColor=colors.HexColor("#7a3b2e"))
cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=8, leading=9)
note = ParagraphStyle("note", parent=styles["Normal"], fontSize=8, leading=10,
                      textColor=colors.HexColor("#333333"))
banner = ParagraphStyle("banner", parent=styles["Normal"], fontSize=8.5,
                        leading=11, textColor=colors.HexColor("#7a3b2e"))


def is_gap(d):
    return d["componentCount"] == 0 or (
        d["componentCount"] > 0 and not d["allergens"])


def venue_section(title, codes):
    elems = [Paragraph(title, h1),
             Paragraph(f"Allergen reference for kitchen & FOH staff · generated {DATE}", sub),
             Spacer(1, 6)]
    dishes = [d for d in DATA if d["venue"] in codes and d["isActive"]]
    by_cat = {}
    for d in dishes:
        by_cat.setdefault(d["menuCategory"], []).append(d)

    header = ["Dish"] + [lbl for _, lbl in ALLERGENS] + ["Other (not top-14)"]
    col_w = [56 * mm] + [(200 / len(ALLERGENS)) * mm] * len(ALLERGENS) + [31 * mm]

    cats = [c for c in CAT_ORDER if c in by_cat] + \
           [c for c in by_cat if c not in CAT_ORDER]
    for c in cats:
        rows = [header]
        items = sorted(by_cat[c], key=lambda x: x["name"].lower())
        for d in items:
            name = d["name"]
            present = set(d["allergens"])
            review = REVIEW.get(name, set())
            other = list(d.get("other", [])) + EXTRA_OTHER.get(name, [])
            row = [Paragraph(name, cell)] + [
                ("✓" if code in present else ("?" if code in review else ""))
                for code, _ in ALLERGENS]
            row.append(Paragraph(", ".join(other), cell))
            rows.append(row)

        t = Table(rows, colWidths=col_w, repeatRows=1)
        ts = TableStyle([
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.5),
            ("FONT", (1, 1), (-1, -1), "Helvetica-Bold", 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7a3b2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TEXTCOLOR", (1, 1), (-1, -1), colors.HexColor("#7a3b2e")),
            # strong horizontal row dividers (easy to read across), light verticals
            ("LINEBELOW", (0, 0), (-1, -1), 0.7, colors.HexColor("#8a8a8a")),
            ("LINEAFTER", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")),
            ("LINEBELOW", (0, 0), (-1, 0), 1.2, colors.HexColor("#5a2b20")),
            ("BOX", (0, 0), (-1, -1), 0.9, colors.HexColor("#7a3b2e")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.white, colors.HexColor("#f2e9e5")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (0, -1), 5),
        ])
        t.setStyle(ts)
        elems.append(Paragraph(f"{CAT_LABEL.get(c, c.title())}  ({len(items)})", cat))
        elems.append(t)
    return elems


def caveat():
    txt = (
        "<b>HOW TO USE THIS SHEET.</b> A ✓ means the dish contains that allergen "
        "based on its current recorded recipe. A blank means none recorded — it is "
        "<b>not</b> a guarantee of ‘free from’. Allergens are rolled up automatically "
        "from each ingredient through every sub-recipe, but ingredient declarations are not all "
        "independently verified yet. <b>Always check the live recipe and speak to the chef on "
        "duty before confirming an allergy to a customer.</b> Cross-contact (shared fryers, "
        "grills, prep surfaces, flour dust) is NOT captured here — assume risk of traces. "
        "A blank row means no allergen in the recipe (e.g. plain bacon, fresh juice). "
        "A <b>?</b> means the cell is under kitchen review — <b>treat the allergen as PRESENT "
        "until the label/recipe check confirms otherwise.</b> The ‘Other’ column lists common "
        "non-top-14 intolerances (garlic, onion, chilli/capsicum, pepper, seeds, barley) rolled up "
        "from the recorded recipe — same caveats apply."
    )
    return Paragraph(txt, banner)


def legend():
    full = ("Crust. = Crustacean · Shell. = Shellfish · Moll. = Mollusc · "
            "Sulph. = Sulphites · ? = under kitchen review, treat as present. "
            "Handwritten review of the 24 Jun print applied 15 Jul 2026.")
    return Paragraph(full, sub)


doc = SimpleDocTemplate(
    OUT, pagesize=landscape(A4),
    leftMargin=10 * mm, rightMargin=10 * mm,
    topMargin=10 * mm, bottomMargin=10 * mm,
    title="Tarte Allergen Matrix", author="Tarte Kitchen")

story = []
for i, (title, codes) in enumerate(VENUES):
    if i:
        story.append(PageBreak())
    story.append(caveat())
    story.append(Spacer(1, 6))
    story += venue_section(title, codes)
    story.append(Spacer(1, 8))
    story.append(legend())

doc.build(story)
print("wrote", OUT)
