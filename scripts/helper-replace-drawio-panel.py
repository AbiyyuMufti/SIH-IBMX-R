"""Replaces the builder-made priority panel (cells at x >= 1590, ids p0c..) on the overview of the saved
(hand-edited) file with the panel of a generated file. Nothing else is changed."""
import io
import re
import sys
import xml.etree.ElementTree as ET

saved_path, gen_path = sys.argv[1], sys.argv[2]
saved = io.open(saved_path, "r", encoding="utf-8", newline="").read()
gen = io.open(gen_path, "r", encoding="utf-8", newline="").read()


def page(text, name):
    return re.search(r'<diagram name="' + re.escape(name) + r'".*?</diagram>', text, re.S)


so, go = page(saved, "Overview"), page(gen, "Overview")
cell_re = re.compile(r'[ \t]*<mxCell id="(p0c\d+)".*?</mxCell>[ \t]*\n?', re.S)


def x_of(cell):
    m = re.search(r'<mxGeometry x="([-\d.]+)"', cell)
    return float(m.group(1)) if m else 0.0


block = so.group(0)
removed = 0
for m in list(cell_re.finditer(block))[::-1]:
    if x_of(m.group(0)) >= 1590:
        block = block[: m.start()] + block[m.end():]
        removed += 1
panel = [m.group(0).strip() for m in cell_re.finditer(go.group(0)) if x_of(m.group(0)) >= 1590]
pos = block.rindex("</root>")
block = block[:pos] + "\n".join(panel) + "\n        " + block[pos:]
saved = saved[: so.start()] + block + saved[so.end():]
io.open(saved_path, "w", encoding="utf-8", newline="").write(saved)
ET.parse(saved_path)
print("removed old panel cells:", removed, "| added new panel cells:", len(panel))
