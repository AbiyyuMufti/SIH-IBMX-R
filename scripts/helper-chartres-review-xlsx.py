"""Writes the Chartres review Excel from the review.json of scripts/chartres-review.js.
Each sheet is a list of blocks: title, notes, header, rows, and optional
formats {column: number format}, flag (column coloured yes / NO and by the name source),
validation {col, list} (a drop-down), answer [columns] (yellow cells for the site),
boldLast (a total row), filter (auto filter), pick [columns] (drop-down from the hidden sheet names, filled from pickList). Sheet freeze {row, col}.
Usage: python -I scripts/helper-chartres-review-xlsx.py <review.json> <out.xlsx>
Reads only our own JSON. The Excel holds site data: never commit it.
"""
import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8"))

HEAD = PatternFill("solid", fgColor="1F4E79")
GREEN = PatternFill("solid", fgColor="D5E8D4")
RED = PatternFill("solid", fgColor="F8CECC")
ANSWER = PatternFill("solid", fgColor="FFF2CC")
TOTAL = PatternFill("solid", fgColor="EEEEEE")
THIN = Side(style="thin", color="BBBBBB")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def flag_fill(value):
    text = str(value or "")
    if text == "yes":
        return GREEN
    if text == "NO":
        return RED
    return None


wb = Workbook()
wb.remove(wb.active)
for sheet in data["sheets"]:
    ws = wb.create_sheet(sheet["name"])
    ws.sheet_view.showGridLines = False
    for i, w in enumerate(sheet.get("widths", []), start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    pick_cells = []
    for block in sheet["blocks"]:
        if block.get("title"):
            ws.append([block["title"]])
            ws.cell(ws.max_row, 1).font = Font(bold=True, size=12, color="1F4E79")
        for note in block.get("notes", []):
            ws.append([note])
            ws.cell(ws.max_row, 1).font = Font(italic=True, color="555555")
        rows = block.get("rows", [])
        if block.get("header"):
            ws.append(block["header"])
            head_row = ws.max_row
            for cell in ws[head_row]:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = HEAD
                cell.border = BOX
                cell.alignment = Alignment(wrap_text=True, vertical="center")
            if block.get("filter"):
                last = get_column_letter(len(block["header"]))
                ws.auto_filter.ref = f"A{head_row}:{last}{head_row + len(rows)}"
        formats = {int(k): v for k, v in block.get("formats", {}).items()}
        answer = block.get("answer", [])
        width = len(block.get("header") or [1])
        validation = block.get("validation")
        if validation and rows:
            dv = DataValidation(type="list", formula1=f'"{validation["list"]}"', allow_blank=True)
            ws.add_data_validation(dv)
        for n, row in enumerate(rows):
            ws.append(row)
            r = ws.max_row
            for c in range(1, width + 1):
                cell = ws.cell(r, c)
                cell.border = BOX
                cell.alignment = Alignment(wrap_text=True, vertical="top")
                if c - 1 in formats:
                    cell.number_format = formats[c - 1]
                if c - 1 in answer:
                    cell.fill = ANSWER
            if block.get("flag") is not None:
                fill = flag_fill(row[block["flag"]])
                if fill:
                    ws.cell(r, block["flag"] + 1).fill = fill
            if block.get("boldLast") and n == len(rows) - 1:
                for c in range(1, width + 1):
                    ws.cell(r, c).font = Font(bold=True)
                    ws.cell(r, c).fill = TOTAL
            if validation:
                dv.add(ws.cell(r, validation["col"] + 1))
            for c in block.get("pick", []):
                pick_cells.append(ws.cell(r, c + 1))
        ws.append([])
    if pick_cells:
        pick = DataValidation(
            type="list",
            formula1=f"=names!$A$2:$A${len(data['pickList']) + 1}",
            allow_blank=True,
            showErrorMessage=False,
        )
        ws.add_data_validation(pick)
        for cell in pick_cells:
            pick.add(cell)
    freeze = sheet.get("freeze")
    if freeze:
        ws.freeze_panes = ws.cell(freeze["row"], freeze["col"])
names = wb.create_sheet("names")
names.append(["MASTERDATA names"])
for v in data.get("pickList", []):
    names.append([v])
names.sheet_state = "hidden"
wb.save(dst)
print(f"{dst}: {len(data['sheets'])} sheets")
