"""Adds NEW cells of generated pages to the same pages of the user's saved (hand-edited) file.
Only cells at x >= --min-x are taken (the new panel on the right), and their ids get a prefix, so they
cannot clash with cells of the saved page. Nothing else in the saved file is changed.

Usage:
  python scripts/helper-merge-drawio-cells.py <saved> <generated> --min-x 1340 --prefix how- "<page>" ["<page>" ...]
"""
import io
import re
import sys
import xml.etree.ElementTree as ET

argv = sys.argv[1:]


def option(name, default):
    if name in argv:
        i = argv.index(name)
        value = argv[i + 1]
        del argv[i : i + 2]
        return value
    return default


min_x = float(option("--min-x", "1340"))
prefix = option("--prefix", "new-")
saved_path, gen_path, *pages = argv
if not pages:
    raise SystemExit(__doc__)
saved = io.open(saved_path, "r", encoding="utf-8", newline="").read()
gen = io.open(gen_path, "r", encoding="utf-8", newline="").read()
cell_re = re.compile(r'<mxCell id="([^"]+)".*?</mxCell>', re.S)


def page_of(text, name):
    return re.search(r'<diagram name="' + re.escape(name) + r'".*?</diagram>', text, re.S)


def x_of(cell):
    m = re.search(r'<mxGeometry x="([-\d.]+)"', cell)
    return float(m.group(1)) if m else 0.0


for name in pages:
    sp, gp = page_of(saved, name), page_of(gen, name)
    if not sp or not gp:
        raise SystemExit("page not found: " + name)
    block = sp.group(0)
    have = set(re.findall(r'<mxCell id="([^"]+)"', block))
    add = []
    for m in cell_re.finditer(gp.group(0)):
        if x_of(m.group(0)) < min_x:
            continue
        new_id = prefix + m.group(1)
        if new_id in have:
            continue
        add.append(m.group(0).replace('id="%s"' % m.group(1), 'id="%s"' % new_id, 1))
    pos = block.rindex("</root>")
    block = block[:pos] + "\n".join(add) + "\n        " + block[pos:]
    saved = saved[: sp.start()] + block + saved[sp.end():]
    print(name, ": added", len(add), "cell(s)")
io.open(saved_path, "w", encoding="utf-8", newline="").write(saved)
ET.parse(saved_path)
print("saved file is valid XML")
