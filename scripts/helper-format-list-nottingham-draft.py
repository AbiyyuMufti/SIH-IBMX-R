"""Draft Nottingham Format List from the product names (rules to confirm).

Output has only the 6 columns the site fills; the flow adds Site Name,
Unique Machine Name and Product Key (scripts/vfc/b9-format-rows.js).
Reads the other project's PBI-08 file, keeps the agreed packing lines,
fills Unit Size, Unit Count/Format, Extra Info, Brand where the name says it.
Usage: python scripts/helper-format-list-nottingham-draft.py <in.csv> <out.csv>
"""
import re
import sys

import pandas as pd

# tablets per pack: 12's, 12s, 12�s (broken apostrophe in the export)
PACK = re.compile(r"(\d+)\s*(?:'s|’s|�s|s\b)", re.I)
# blisters or strips per pack, first pattern that matches wins
COUNT = [
    re.compile(r"x\s*(\d+)\s*(?:blister|strip)", re.I),
    re.compile(r"(\d+)\s*(?:blister|strip)", re.I),
    re.compile(r"\b(\d+)\s*x\s*\d+\s*(?:'s|’s|�s)", re.I),
]
EXTRA = [
    (r"standard outer", "Standard outer"),
    (r"small outer", "Small outer"),
    (r"\btray\b", "Tray"),
    (r"xl (?:leaflet|lft)|x -?large lft", "XL leaflet"),
    (r"lrg (?:leaflet|lft)", "Large leaflet"),
    (r"booklet", "Booklet"),
    (r"hand ?pack", "Hand pack"),
    (r"sugar free", "Sugar free"),
    (r"\((BE|FR|GB|HU|IT|NZ|PL|UA)\)", None),
]
BRAND = [
    (r"gaviscon", "Gaviscon"),
    (r"\bmuc(?:inex|nx)?\b|mucnx", "Mucinex"),
    (r"fosrenol", "Fosrenol"),
    (r"cuprofen", "Cuprofen"),
    (r"nuromol", "Nuromol"),
    (r"paramol", "Paramol"),
    (r"cepacol", "Cepacol"),
    (r"quickzorb", "Quickzorb"),
    (r"nurofen|nurfn", "Nurofen"),
    (r"strepsils", "Strepsils"),
]


def unit_size(name):
    m = PACK.search(name)
    return m.group(1) if m else ""


def count(name):
    for pat in COUNT:
        m = pat.search(name)
        if m:
            return m.group(1)
    return ""


def extra(name):
    found = []
    for pat, label in EXTRA:
        m = re.search(pat, name, re.I)
        if m:
            found.append(label or m.group(1).upper())
    return ", ".join(found)


def brand(name):
    for pat, label in BRAND:
        if re.search(pat, name, re.I):
            return label
    return ""


def main(src, out):
    d = pd.read_csv(src, dtype=str, encoding="utf-8-sig").fillna("")
    d = d[d["Packing line (agreed list)"] == "Yes"].copy()
    d = d[d["Product Name"].str.lower() != "maintenance"]
    n = d["Product Name"]
    d["Brand"] = n.map(brand)
    d["Unit Size"] = n.map(unit_size)
    d["Unit Count/Format"] = n.map(count)
    d["Extra Info"] = n.map(extra)
    cols = [
        "MachineName",
        "Product Name",
        "Brand",
        "Unit Size",
        "Unit Count/Format",
        "Extra Info",
    ]
    d = d[cols].sort_values(["MachineName", "Product Name"])
    d.to_csv(out, index=False, encoding="utf-8-sig")
    print(len(d), "rows")
    for c in cols[2:6]:
        print(c, "filled", int((d[c] != "").sum()))
    full = (d[cols[2:5]] != "").all(axis=1).sum()
    print("Brand + Unit Size + Count all filled:", int(full))


main(sys.argv[1], sys.argv[2])
