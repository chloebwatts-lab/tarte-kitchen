#!/usr/bin/env python3
"""Tarte kitchen paper templates, A4 printable."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, PageBreak)

W, H = A4
MARGIN = 14 * mm
INK = colors.HexColor("#1a1a1a")
RULE = colors.HexColor("#9a9a9a")
LIGHT = colors.HexColor("#efece6")
ACCENT = colors.HexColor("#7a5c3e")

title_s = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=INK, spaceAfter=3)
sub_s = ParagraphStyle("s", fontName="Helvetica", fontSize=9.5, textColor=colors.HexColor("#555555"), spaceAfter=6)
head_s = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=10.5, textColor=INK, spaceBefore=8, spaceAfter=3)
cell_h = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=8.5, textColor=INK)
cell_n = ParagraphStyle("cn", fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#444444"))
foot_s = ParagraphStyle("f", fontName="Helvetica-Oblique", fontSize=8.5, textColor=colors.HexColor("#666666"), spaceBefore=6)

def field_line(label, width):
    return Table([[Paragraph(label, cell_h), ""]],
                 colWidths=[28 * mm, width - 28 * mm], rowHeights=[9 * mm],
                 style=TableStyle([
                     ("LINEBELOW", (1, 0), (1, 0), 0.7, RULE),
                     ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                     ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                     ("LEFTPADDING", (0, 0), (0, 0), 0),
                 ]))

def grid(headers, widths, n_rows, row_h):
    data = [[Paragraph(h, cell_h) for h in headers]] + [["" for _ in headers] for _ in range(n_rows)]
    t = Table(data, colWidths=widths, rowHeights=[8 * mm] + [row_h] * n_rows)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, RULE),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("VALIGN", (0, 1), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
    ]))
    return t

def header(story, title, subtitle):
    story.append(Paragraph(title, title_s))
    story.append(Paragraph(subtitle, sub_s))
    bar = Table([[""]], colWidths=[W - 2 * MARGIN], rowHeights=[1.6])
    bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
    story.append(bar)
    story.append(Spacer(1, 5 * mm))

usable = W - 2 * MARGIN

doc = BaseDocTemplate("Tarte-Kitchen-Paper-Templates.pdf", pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(MARGIN, MARGIN, usable, H - 2 * MARGIN)])])
story = []

# Page 1: Issue and Solution sheet
header(story, "TARTE KITCHEN  |  Issue + Solution Sheet",
       "One row per issue. No issue without a proposed solution. Photo the finished page and send it to Chloe.")
tophalf = Table([[field_line("Name:", usable * 0.48), field_line("Date:", usable * 0.48)]],
                colWidths=[usable * 0.5, usable * 0.5],
                style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
story.append(tophalf)
story.append(Spacer(1, 4 * mm))
story.append(grid(
    ["Issue (what is happening)", "Impact (time / $ / quality)", "My solution", "What I need + from who", "By when"],
    [usable * 0.26, usable * 0.18, usable * 0.26, usable * 0.20, usable * 0.10],
    6, 33 * mm))
story.append(Paragraph("Rule we agreed: problems come with a solution attached. If you are not sure of the solution, write your best idea and we will build on it together.", foot_s))
story.append(PageBreak())

# Page 2: Weekly update
header(story, "TARTE KITCHEN  |  Head Chef Weekly Update",
       "Fill in Thursday or Friday. 10 minutes max. Photo it and send to Chloe, every week, even quiet ones.")
story.append(tophalf)
story.append(Spacer(1, 3 * mm))

def box(label, height, hint=""):
    lab = Paragraph(label, cell_h) if not hint else Paragraph(
        f"{label} <font name='Helvetica' color='#777777' size='7.5'>{hint}</font>", cell_h)
    t = Table([[lab], [""]], colWidths=[usable], rowHeights=[7 * mm, height])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t

story.append(box("1. What went well this week", 20 * mm))
story.append(Spacer(1, 2.5 * mm))
story.append(box("2. Problems this week + what I did about them", 30 * mm, "(issue and action, not just the issue)"))
story.append(Spacer(1, 2.5 * mm))
story.append(box("3. Equipment: anything broken, faulty or getting worse", 18 * mm, "(also fill an Equipment Fault Report)"))
story.append(Spacer(1, 2.5 * mm))
story.append(box("4. Staff + roster: next 2 weeks", 22 * mm, "(gaps, leave, training, roster posted yes / no)"))
story.append(Spacer(1, 2.5 * mm))
story.append(box("5. Prep + waste notes", 18 * mm, "(anything thrown out, why, and the fix)"))
story.append(Spacer(1, 2.5 * mm))
story.append(box("6. What I need from Chloe", 18 * mm))
story.append(PageBreak())

# Page 3: Equipment fault report
header(story, "TARTE KITCHEN  |  Equipment Fault Report",
       "Fill in the same day the fault appears. Photo it and send to Chloe. One sheet per item.")
half = usable * 0.5
pairs = [("Reported by:", "Date:"), ("Equipment item:", "Location / kitchen:")]
for a, b in pairs:
    story.append(Table([[field_line(a, usable * 0.48), field_line(b, usable * 0.48)]],
                       colWidths=[half, half],
                       style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
    story.append(Spacer(1, 2 * mm))
story.append(Spacer(1, 2 * mm))
story.append(box("What is wrong (and any error code on the display)", 24 * mm))
story.append(Spacer(1, 2.5 * mm))
story.append(box("Since when, and is it getting worse?", 16 * mm))
story.append(Spacer(1, 2.5 * mm))
story.append(box("What we have already tried", 16 * mm))
story.append(Spacer(1, 2.5 * mm))
sev = Table([[Paragraph("How urgent?", cell_h),
              Paragraph("[  ] Can wait", cell_n), Paragraph("[  ] Needs fixing this week", cell_n),
              Paragraph("[  ] Affecting service NOW", cell_n)]],
            colWidths=[usable * 0.18, usable * 0.22, usable * 0.32, usable * 0.28],
            rowHeights=[10 * mm])
sev.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, RULE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                         ("LEFTPADDING", (0, 0), (-1, -1), 4)]))
story.append(sev)
story.append(Spacer(1, 2.5 * mm))
story.append(box("Follow-up (Chloe fills in): who is fixing it, booked for when", 18 * mm))
story.append(Paragraph("If it is still broken 7 days after this report, raise it again. Chasing a fault twice is never annoying. Silence is the only problem.", foot_s))
story.append(PageBreak())

# Page 4: Action tracker
header(story, "TARTE KITCHEN  |  Meeting Action Tracker",
       "Every meeting ends with this sheet filled in. We review it at the start of the next meeting, first thing.")
story.append(Table([[field_line("Meeting date:", usable * 0.48), field_line("Who was there:", usable * 0.48)]],
                   colWidths=[half, half],
                   style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
story.append(Spacer(1, 4 * mm))
story.append(grid(
    ["#", "Action we agreed", "Owner", "By when", "Done? (date)"],
    [usable * 0.06, usable * 0.48, usable * 0.16, usable * 0.14, usable * 0.16],
    10, 15 * mm))
story.append(Paragraph("An action with no owner and no date is not an action, it is a wish. Every row gets all three.", foot_s))
story.append(PageBreak())

# Page 5: Said + Done tracker
header(story, "TARTE KITCHEN  |  Said + Done  (Head Chef Commitments)",
       "What we agree gets a date. What has a date gets checked. Chloe tracks this same list digitally, week by week.")

story.append(Paragraph("A. Standing commitments, checked every week", head_s))
wk_headers = ["Standing commitment"] + ["W/C\n__ / __"] * 6 + ["Notes"]
wk_data = [[Paragraph(h.replace("\n", "<br/>"), cell_h) for h in wk_headers]]
standing = [
    "Roster posted 3 weeks ahead",
    "Portions weighed, every prep, every day",
    "Daily + weekly checklists done in the app",
    "Weekly Update sent by Friday",
    "Messages answered same day",
    "Frustrations raised early, no silent weeks",
    "",
]
for item in standing:
    wk_data.append([Paragraph(item, cell_n)] + ["" for _ in range(7)])
wk_w = [usable * 0.34] + [usable * 0.068] * 6 + [usable * 0.252]
wkt = Table(wk_data, colWidths=wk_w, rowHeights=[10 * mm] + [9.5 * mm] * len(standing))
wkt.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.6, RULE),
    ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 3),
    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
]))
story.append(wkt)
story.append(Paragraph("Mark each week Y or N. A written N with a reason is fine. A blank is not.", foot_s))
story.append(Spacer(1, 4 * mm))

story.append(Paragraph("B. One-off commitments: you said it, we date it", head_s))
story.append(Paragraph("New dishes, systems you want to implement, policy write-ups, fixes. Nothing lives as an idea, everything lands here with a firm date.", cell_n))
story.append(Spacer(1, 2 * mm))
story.append(grid(
    ["What was promised", "Who said it", "Date agreed", "Firm due date", "Done (date)", "If missed: new date + why"],
    [usable * 0.30, usable * 0.11, usable * 0.11, usable * 0.11, usable * 0.11, usable * 0.26],
    7, 12.5 * mm))
story.append(Paragraph("This sheet works both ways: Chloe's promises go on it too. Consistent green weeks are the path to the next $3.", foot_s))

doc.build(story)
print("templates done")
