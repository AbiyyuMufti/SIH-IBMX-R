"""Adds NEW cells (boxes and their arrows) of generated pages to the same pages of the user's saved
(hand-edited) file. Only vertices at x >= --min-x are taken (the panel on the right) and the arrows
between them. Their ids get a prefix, so they cannot clash with cells of the saved page.
--remove-prefix first deletes the cells of an earlier run (ids with that prefix).
Nothing else in the saved file is changed.

Usage:
  python scripts/helper-merge-drawio-cells.py <saved> <generated> --min-x 1340 --prefix how2- [--remove-prefix how-] "<page>" ["<page>" ...]
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
remove_prefix = option("--remove-prefix", "")
saved_path, gen_path, *pages = argv
if not pages:
    raise SystemExit(__doc__)
saved = io.open(saved_path, "r", encoding="utf-8", newline="").read()
gen = io.open(gen_path, "r", encoding="utf-8", newline="").read()
cell_re = re.compile(r'[ \t]*<mxCell id="([^"]+)".*?</mxCell>[ \t]*\n?', re.S)


def page_of(text, name):
    return re.search(r'<diagram name="' + re.escape(name) + r'".*?</diagram>', text, re.S)


def x_of(cell):
    m = re.search(r'<mxGeometry x="([-\d.]+)"', cell)
    return float(m.group(1)) if m else None


for name in pages:
    sp, gp = page_of(saved, name), page_of(gen, name)
    if not sp or not gp:
        raise SystemExit("page not found: " + name)
    block = sp.group(0)
    removed = 0
    if remove_prefix:
        for m in list(cell_re.finditer(block))[::-1]:
            if m.group(1).startswith(remove_prefix):
                block = block[: m.start()] + block[m.end():]
                removed += 1
    have = set(re.findall(r'<mxCell id="([^"]+)"', block))
    cells = [m.group(0).strip() for m in cell_re.finditer(gp.group(0))]
    vertex_ids = set()
    for c in cells:
        cid = re.match(r'<mxCell id="([^"]+)"', c).group(1)
        x = x_of(c)
        if 'vertex="1"' in c and x is not None and x >= min_x:
            vertex_ids.add(cid)
    add = []
    for c in cells:
        cid = re.match(r'<mxCell id="([^"]+)"', c).group(1)
        if cid in vertex_ids:
            keep = True
        elif 'edge="1"' in c:
            s = re.search(r'source="([^"]+)"', c)
            t = re.search(r'target="([^"]+)"', c)
            keep = bool(s and t and s.group(1) in vertex_ids and t.group(1) in vertex_ids)
        else:
            keep = False
        if not keep:
            continue
        new = c.replace('id="%s"' % cid, 'id="%s%s"' % (prefix, cid), 1)
        new = re.sub(r'source="([^"]+)"', lambda m: 'source="%s%s"' % (prefix, m.group(1)), new)
        new = re.sub(r'target="([^"]+)"', lambda m: 'target="%s%s"' % (prefix, m.group(1)), new)
        if (prefix + cid) not in have:
            add.append(new)
    pos = block.rindex("</root>")
    block = block[:pos] + "\n".join(add) + "\n        " + block[pos:]
    saved = saved[: sp.start()] + block + saved[sp.end():]
    print(name, ": removed", removed, "| added", len(add), "cell(s)")
io.open(saved_path, "w", encoding="utf-8", newline="").write(saved)
ET.parse(saved_path)
print("saved file is valid XML")
