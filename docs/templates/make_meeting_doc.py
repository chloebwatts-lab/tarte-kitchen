#!/usr/bin/env python3
"""Constructive meeting doc for Jose sit-down, A4."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

W, H = A4
MARGIN = 16 * mm
INK = colors.HexColor("#1a1a1a")
ACCENT = colors.HexColor("#7a5c3e")
RULE = colors.HexColor("#9a9a9a")
LIGHT = colors.HexColor("#efece6")

title_s = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=INK, spaceAfter=3)
sub_s = ParagraphStyle("s", fontName="Helvetica", fontSize=9.5, textColor=colors.HexColor("#555555"), spaceAfter=6)
h_s = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=11, textColor=ACCENT, spaceBefore=9, spaceAfter=3)
b_s = ParagraphStyle("b", fontName="Helvetica", fontSize=9.8, leading=13.5, textColor=INK, spaceAfter=4)
bl_s = ParagraphStyle("bl", parent=b_s, leftIndent=11, bulletIndent=2, spaceAfter=2.5)
cell_h = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=9, textColor=INK)
cell_n = ParagraphStyle("cn", fontName="Helvetica", fontSize=9, leading=12, textColor=INK)

usable = W - 2 * MARGIN
doc = BaseDocTemplate("Kitchen-Reset-Jose-Candy-Chloe.pdf", pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(MARGIN, MARGIN, usable, H - 2 * MARGIN)])])
s = []

s.append(Paragraph("Kitchen reset: Jose + Chloe", title_s))
s.append(Paragraph("One page. We each keep a copy. We review it together in 2 weeks.", sub_s))
bar = Table([[""]], colWidths=[usable], rowHeights=[1.6])
bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
s.append(bar)

s.append(Paragraph("Where we agree", h_s))
s.append(Paragraph("Jose, you are a talented chef and you care about Tarte and about my family. Four years together proves that. Neither of us is the enemy here. The way we work together is the problem, so that is what we are fixing.", b_s))

s.append(Paragraph("What I own", h_s))
for t in [
    "Equipment: I did not know the oven was still broken. From today every fault goes on a fault sheet, I book the fix, and you chase me if nothing happens in 7 days. Chasing me is never annoying.",
    "Tea Garden: the prep load on your team is real. I am buying the transport trolley you found. TG will own its own ordering quantities so the waste stops landing on you.",
    "Tools: the app was a prototype. I will get iPads for both kitchens and a photo upload so paper sheets go straight in. You will not have to work off your phone.",
    "Pay: the extra $5 is done. The next $3 comes when the new rhythm holds. That is the deal and I will keep my side.",
]:
    s.append(Paragraph(t, bl_s, bulletText="•"))

s.append(Paragraph("What I need owned back", h_s))
for t in [
    "Communication in writing. When things get hard you go quiet, and that is when I need you loudest. Decisions go in the group chat. Messages get replies the same day, next morning at the latest.",
    "Plans on paper, not just in conversation. You have great ideas but they stay verbal. Use the new sheets: every issue comes with your solution next to it. I turn your rough notes into polished documents, that is my job, not yours.",
    "One system, together. No more your system and my system running side by side. Paper sheets are fine, they get photographed in. We build it as one kitchen.",
    "Rosters posted 3 weeks ahead, staffed to revenue. When sales drop, hours drop. That maths protects everyone's job, including yours.",
    "Follow-through. When we agree something in a meeting it goes on the action tracker with a name and a date, and we open the next meeting by reading it.",
]:
    s.append(Paragraph(t, bl_s, bulletText="•"))

s.append(Paragraph("Roles from today", h_s))
roles = Table([
    [Paragraph("Jose", cell_h), Paragraph("Head Chef. Owns menu, food cost, prep system, kitchen policies, and communicating all of it. The team hears direction from Jose first.", cell_n)],
    [Paragraph("Chloe", cell_h), Paragraph("Owns targets, money, maintenance bookings and the tools. Stays out of daily kitchen calls once the rhythm above is holding.", cell_n)],
], colWidths=[usable * 0.14, usable * 0.86])
roles.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.6, RULE),
    ("BACKGROUND", (0, 0), (0, -1), LIGHT),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
s.append(roles)

s.append(Paragraph("The weekly rhythm", h_s))
for t in [
    "Friday: Jose sends the Weekly Update sheet (10 minutes, photo, send). Every week, even quiet ones.",
    "Issues go on the Issue + Solution sheet as they happen, not saved up for a blow-up.",
    "Faults go on the Equipment Fault Report the day they appear.",
    "Everything promised, by any of us, goes on the Said + Done sheet with a firm date. Chloe tracks the same list digitally.",
    "We sit down every 2 weeks, 30 minutes, action tracker and Said + Done first.",
]:
    s.append(Paragraph(t, bl_s, bulletText="•"))

s.append(Spacer(1, 4 * mm))
sign = Table([[Paragraph("Jose", cell_h), "", Paragraph("Chloe", cell_h), ""]],
             colWidths=[14 * mm, usable / 2 - 22 * mm, 16 * mm, usable / 2 - 22 * mm],
             rowHeights=[10 * mm])
sign.setStyle(TableStyle([
    ("LINEBELOW", (1, 0), (1, 0), 0.7, RULE),
    ("LINEBELOW", (3, 0), (3, 0), 0.7, RULE),
    ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
]))
s.append(sign)

doc.build(s)
print("meeting doc done")
