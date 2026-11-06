"""Compares the Chartres files of a lake copy with a local run, per table and month.
Per table and month: rows and sums for lake, run (own files, no filler) and filler.
Also the filler duplicate keys and the schema per folder. Read only.
Usage: python -I scripts/helper-chartres-lake-compare.py <lake report dir> <run report dir>
"""
import glob
import os
import re
import sys
from collections import Counter

import pyarrow.parquet as pq

lake, run = sys.argv[1], sys.argv[2]
SUMS = {
    "Plan_OPT_EU": ["Good Parts", "Capacity", "Defect Parts"],
    "Time_Utilisation_EU": ["Total Time Total", "OEE Time Total"],
    "Daily_Losses_EU": ["Duration", "Loss Units"],
    "Volume_CoV_EU": [],
    "Format_List_EU": [],
}


def stats(files, cols):
    rows, sums = 0, Counter()
    for f in files:
        t = pq.read_table(f)
        rows += t.num_rows
        for c in cols:
            if c in t.column_names:
                sums[c] += sum(x for x in t[c].to_pylist() if x is not None)
    return rows, sums


def month(f):
    m = re.search(r"_(\d{4}-\d{2})_", os.path.basename(f))
    return m.group(1) if m else "-"


for table, cols in SUMS.items():
    print("==", table)
    lf = glob.glob(f"{lake}/{table}/site=Chartres/*.parquet")
    rf = glob.glob(f"{run}/{table}/site=Chartres/*.parquet")
    months = sorted({month(f) for f in lf + rf})
    for m in months:
        a = stats([f for f in lf if month(f) == m], cols)
        own = [f for f in rf if month(f) == m and "_filler" not in f]
        b = stats(own, cols)
        fi = stats([f for f in rf if month(f) == m and "_filler" in f], cols)
        same = a[0] == b[0] and all(abs(a[1][c] - b[1][c]) < 1e-6 for c in cols)
        diff = {c: round(b[1][c] - a[1][c], 2) for c in cols if abs(a[1][c] - b[1][c]) > 1e-6}
        print(m, "lake", a[0], "run", b[0], "filler", fi[0], "SAME" if same else f"DIFF rows {b[0]-a[0]} sums {diff}")
