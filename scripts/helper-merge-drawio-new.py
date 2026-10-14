"""Merges NEW parts of a generated .drawio into the user's saved (hand-edited) file.
- a new page (by name) is inserted after a given page;
- new cells (ids not in the saved page) are appended to an existing page.
Nothing else in the saved file is changed."""
import io
import re
import sys
import xml.etree.ElementTree as ET

saved_path, gen_path = sys.argv[1], sys.argv[2]
saved = io.open(saved_path, "r", encoding="utf-8", newline="").read()
gen = io.open(gen_path, "r", encoding="utf-8", newline="").read()


def page_text(text, name):
    m = re.search(r'<diagram name="' + re.escape(name) + r'".*?</diagram>', text, re.S)
    return m


NEW_PAGE = "Explanation Plan to get the missing data"
AFTER_PAGE = "Explanation Data collection and conflicts"
OVERVIEW = "Overview"

# 1. new page
if NEW_PAGE in saved:
    raise SystemExit("page already in the saved file")
g = page_text(gen, NEW_PAGE)
if not g:
    raise SystemExit("new page not found in the generated file")
new_diagram = re.sub(r'id="page\d+"', 'id="page-plan"', g.group(0), count=1)
after = page_text(saved, AFTER_PAGE)
if not after:
    raise SystemExit("anchor page not found in the saved file")
saved = saved[: after.end()] + "\n  " + new_diagram + saved[after.end():]

# 2. new cells on the overview
so = page_text(saved, OVERVIEW)
go = page_text(gen, OVERVIEW)
saved_ids = set(re.findall(r'<mxCell id="([^"]+)"', so.group(0)))
cells = re.findall(r'<mxCell id="([^"]+)".*?</mxCell>', go.group(0), re.S)
full = re.finditer(r'<mxCell id="([^"]+)".*?</mxCell>', go.group(0), re.S)
add = [m.group(0) for m in full if m.group(1) not in saved_ids]
print("new overview cells:", len(add))
block = so.group(0)
pos = block.rindex("</root>")
block2 = block[:pos] + "\n".join(add) + "\n        " + block[pos:]
saved = saved[: so.start()] + block2 + saved[so.end():]

# 3. page count
saved = re.sub(r'pages="(\d+)"', lambda m: 'pages="%d"' % (int(m.group(1)) + 1), saved, count=1)
io.open(saved_path, "w", encoding="utf-8", newline="").write(saved)
r = ET.parse(saved_path).getroot()
print("merged ok. pages:", [d.get("name") for d in r.iter("diagram")][-4:], "| total", len(list(r.iter("diagram"))))
