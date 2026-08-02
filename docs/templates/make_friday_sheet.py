#!/usr/bin/env python3
"""Single combined weekly sheet for Jose: everything on one A4 page."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

W, H = A4
MARGIN = 13 * mm
INK = colors.HexColor("#1a1a1a")
RULE = colors.HexColor("#9a9a9a")
LIGHT = colors.HexColor("#efece6")
ACCENT = colors.HexColor("#7a5c3e")

title_s = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=INK, spaceAfter=3)
sub_s = ParagraphStyle("s", fontName="Helvetica", fontSize=9.5, textColor=colors.HexColor("#555555"), spaceAfter=6)
cell_h = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=8.5, textColor=INK)
cell_n = ParagraphStyle("cn", fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#444444"))
foot_s = ParagraphStyle("f", fontName="Helvetica-Oblique", fontSize=8.5, textColor=colors.HexColor("#666666"), spaceBefore=5)

usable = W - 2 * MARGIN
doc = BaseDocTemplate("Jose-Friday-Sheet.pdf", pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(MARGIN, MARGIN, usable, H - 2 * MARGIN)])])
s = []

s.append(Paragraph("TARTE KITCHEN  |  The Friday Sheet", title_s))
s.append(Paragraph("One page. Once a week. 10 minutes. Photo it and send it to Chloe by Friday close. This replaces every other form except the Equipment Fault Report.", sub_s))
bar = Table([[""]], colWidths=[usable], rowHeights=[1.6])
bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
s.append(bar)
s.append(Spacer(1, 4 * mm))

def field_line(label, width, lab_w=30 * mm):
    return Table([[Paragraph(label, cell_h), ""]],
                 colWidths=[lab_w, width - lab_w], rowHeights=[8 * mm],
                 style=TableStyle([
                     ("LINEBELOW", (1, 0), (1, 0), 0.7, RULE),
                     ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                     ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                     ("LEFTPADDING", (0, 0), (0, 0), 0),
                 ]))

s.append(Table([[field_line("Name:", usable * 0.48), field_line("Week ending:", usable * 0.48)]],
               colWidths=[usable * 0.5, usable * 0.5],
               style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
s.append(Spacer(1, 2.4 * mm))

ticks = Table([
    [Paragraph("1. Quick ticks", cell_h),
     Paragraph("Roster posted 3 weeks ahead?  Y / N", cell_n),
     Paragraph("Portions weighed all week?  Y / N", cell_n),
     Paragraph("App checklists done?  Y / N", cell_n)],
], colWidths=[usable * 0.16, usable * 0.30, usable * 0.29, usable * 0.25], rowHeights=[10 * mm])
ticks.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.6, RULE),
    ("INNERGRID", (0, 0), (-1, -1), 0.6, RULE),
    ("BACKGROUND", (0, 0), (0, -1), LIGHT),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 4),
]))
s.append(ticks)
s.append(Spacer(1, 2.4 * mm))

def box(label, height, hint=""):
    lab = Paragraph(label, cell_h) if not hint else Paragraph(
        f"{label} <font name='Helvetica' color='#777777' size='7.5'>{hint}</font>", cell_h)
    t = Table([[lab], [""]], colWidths=[usable], rowHeights=[6.5 * mm, height])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t

s.append(box("2. What went well this week", 13 * mm))
s.append(Spacer(1, 2.4 * mm))

prob_head = [Paragraph(h, cell_h) for h in
             ["3. Problem this week", "My fix (or my best idea)", "What I need + from who", "By when"]]
prob = Table([prob_head] + [["", "", "", ""] for _ in range(3)],
             colWidths=[usable * 0.32, usable * 0.32, usable * 0.24, usable * 0.12],
             rowHeights=[7 * mm] + [15 * mm] * 3)
prob.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.6, RULE),
    ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
    ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 4),
]))
s.append(prob)
s.append(Spacer(1, 2.4 * mm))

s.append(box("4. Equipment: anything broken or getting worse", 11.5 * mm, "(if urgent, also do a Fault Report the same day)"))
s.append(Spacer(1, 2.4 * mm))

prom_head = [Paragraph(h, cell_h) for h in
             ["5. My promises in play (new dish, system, write-up)", "Due date", "On track? If not: new date + why"]]
prom = Table([prom_head] + [["", "", ""] for _ in range(3)],
             colWidths=[usable * 0.46, usable * 0.14, usable * 0.40],
             rowHeights=[7 * mm] + [11.5 * mm] * 3)
prom.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.6, RULE),
    ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
    ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 4),
]))
s.append(prom)
s.append(Spacer(1, 2.4 * mm))

s.append(box("6. Staff + roster next 2 weeks", 11.5 * mm, "(gaps, leave, training)"))
s.append(Spacer(1, 2.4 * mm))
s.append(box("7. What I need from Chloe", 11.5 * mm))
s.append(Spacer(1, 2.4 * mm))

mood = Table([[Paragraph("8. How was your week, honestly?", cell_h),
               Paragraph("1   2   3   4   5", cell_n),
               Paragraph("Anything wearing you down? Say it here, not in silence:", cell_n)]],
             colWidths=[usable * 0.28, usable * 0.14, usable * 0.58], rowHeights=[12 * mm])
mood.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.6, RULE),
    ("INNERGRID", (0, 0), (-1, -1), 0.6, RULE),
    ("BACKGROUND", (0, 0), (0, -1), LIGHT),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 4),
]))
s.append(mood)
s.append(Paragraph("No blank sheet, no silent week. A rough honest page beats a perfect missing one.", foot_s))

doc.build(s)
print("friday sheet done")
