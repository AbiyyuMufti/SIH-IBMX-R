"""Merges a NEW page of a generated .drawio into the user's saved (hand-edited) file.
Nothing else in the saved file is changed. The generated file comes from
DRAWIO_OUT=<path> node scripts/build-drawio.js

Usage:
  python scripts/helper-merge-drawio-new.py <saved> <generated> "<new page name>" "<after page name>" [--overview]

--overview also appends the new cells of the Overview page (ids not in the saved page).
"""
import io
import re
import sys
import xml.etree.ElementTree as ET

args = [a for a in sys.argv[1:] if not a.startswith("--")]
with_overview = "--overview" in sys.argv
if len(args) != 4:
    raise SystemExit(__doc__)
saved_path, gen_path, new_page, after_page = args
saved = io.open(saved_path, "r", encoding="utf-8", newline="").read()
gen = io.open(gen_path, "r", encoding="utf-8", newline="").read()


def page_text(text, name):
    return re.search(r'<diagram name="' + re.escape(name) + r'".*?</diagram>', text, re.S)


if page_text(saved, new_page):
    raise SystemExit("page already in the saved file")
g = page_text(gen, new_page)
if not g:
    raise SystemExit("new page not found in the generated file")
slug = re.sub(r"[^a-z0-9]+", "-", new_page.lower()).strip("-")[:40]
new_diagram = re.sub(r'id="page[^"]*"', 'id="page-' + slug + '"', g.group(0), count=1)
after = page_text(saved, after_page)
if not after:
    raise SystemExit("anchor page not found in the saved file")
saved = saved[: after.end()] + "\n  " + new_diagram + saved[after.end():]

if with_overview:
    so = page_text(saved, "Overview")
    go = page_text(gen, "Overview")
    saved_ids = set(re.findall(r'<mxCell id="([^"]+)"', so.group(0)))
    add = [m.group(0) for m in re.finditer(r'<mxCell id="([^"]+)".*?</mxCell>', go.group(0), re.S) if m.group(1) not in saved_ids]
    print("new overview cells:", len(add))
    block = so.group(0)
    pos = block.rindex("</root>")
    block = block[:pos] + "\n".join(add) + "\n        " + block[pos:]
    saved = saved[: so.start()] + block + saved[so.end():]

saved = re.sub(r'pages="(\d+)"', lambda m: 'pages="%d"' % (int(m.group(1)) + 1), saved, count=1)
io.open(saved_path, "w", encoding="utf-8", newline="").write(saved)
r = ET.parse(saved_path).getroot()
print("merged ok. pages:", len(list(r.iter("diagram"))), "| last:", [d.get("name") for d in r.iter("diagram")][-3:])
