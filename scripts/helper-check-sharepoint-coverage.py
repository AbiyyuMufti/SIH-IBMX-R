"""Read-only. Completeness check of the local sharepoint/source folder.
For each type (plan_opt, line_losses, volume_loss_correction) and site it reads the
real dates inside every file (not the file names), then reports: days covered,
first and last day, missing days (gaps) from the start day to the last day found,
and days that are in more than one file (overlaps, to remove when stacking).
Usage: python -I scripts/helper-check-sharepoint-coverage.py [start day, default 2025-01-01]
"""
import csv
import glob
import os
import re
import sys
from collections import defaultdict
from datetime import date, timedelta

START = sys.argv[1] if len(sys.argv) > 1 else "2025-01-01"
ROOT = "sharepoint/source"
TYPES = {
    "plan_opt": "YYYY-MM-DD",
    "line_losses": "ShiftStartDate",
    "volume_loss_correction": "ShiftStartDate",
}


def read_lines(path):
    raw = open(path, "rb").read()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8-sig", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def days_of(path, column):
    """Days found in one file. Returns (days, note). Handles tab or comma
    files (comma files have quoted fields) and ISO or dd/mm/yyyy dates."""
    lines = read_lines(path)
    sep = "\t" if "\t" in lines[0] else ","
    header = next(csv.reader([lines[0]], delimiter=sep))
    if column not in header:
        return set(), f"no column {column}: {lines[0][:30]!r}"
    idx = header.index(column)
    out = set()
    for cells in csv.reader(lines[1:], delimiter=sep):
        if len(cells) <= idx:
            continue
        v = cells[idx].strip()
        if re.match(r"\d{4}-\d\d-\d\d", v):
            out.add(v[:10])
        elif re.match(r"\d\d/\d\d/\d{4}", v):
            out.add(f"{v[6:10]}-{v[3:5]}-{v[:2]}")
    return out, ""


def ranges(days):
    """Turn a sorted list of ISO days into 'a..b' ranges."""
    out = []
    ds = [date.fromisoformat(d) for d in sorted(days)]
    i = 0
    while i < len(ds):
        j = i
        while j + 1 < len(ds) and ds[j + 1] - ds[j] == timedelta(days=1):
            j += 1
        out.append(ds[i].isoformat() if i == j else f"{ds[i]}..{ds[j]}")
        i = j + 1
    return out


for t, col in TYPES.items():
    for site_dir in sorted(glob.glob(f"{ROOT}/{t}/site=*")):
        site = site_dir.split("site=")[1]
        owner = defaultdict(list)
        for f in sorted(glob.glob(site_dir + "/*")):
            found, note = days_of(f, col)
            if note:
                print(f"  (skipped {os.path.basename(f)}: {note})")
            for d in found:
                owner[d].append(os.path.basename(f))
        days = sorted(d for d in owner if d >= START)
        if not days:
            print(f"\n{t} / {site}: no days from {START}")
            continue
        first, last = days[0], days[-1]
        every = []
        cur = date.fromisoformat(first)
        while cur <= date.fromisoformat(last):
            every.append(cur.isoformat())
            cur += timedelta(days=1)
        missing = [d for d in every if d not in owner]
        overlap = [d for d in days if len(set(owner[d])) > 1]
        print(f"\n{t} / {site}: {len(days)} days, {first} to {last}, "
              f"{len(os.listdir(site_dir))} files")
        print(f"  missing ({len(missing)}): {', '.join(ranges(missing)) or 'none'}")
        print(f"  in more than one file ({len(overlap)}): {', '.join(ranges(overlap)) or 'none'}")
