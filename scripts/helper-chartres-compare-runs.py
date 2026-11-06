"""Compares two Chartres runs (parquet under <run>/report): rows per table and month,
sums of Duration, Loss Units, Good Parts, schema per folder, and a column-by-column diff
of Daily_Losses_EU (rows in the same order). Read only.
Usage: python -I scripts/helper-chartres-compare-runs.py <old run> <new run>
"""
import glob
import os
import sys

import pyarrow.parquet as pq

old, new = sys.argv[1], sys.argv[2]


def files(run):
    root = os.path.join(run, "report")
    out = {}
    for f in glob.glob(os.path.join(root, "**", "*.parquet"), recursive=True):
        out[os.path.relpath(f, root)] = f
    return out


a, b = files(old), files(new)
print("files only in one run:", sorted(set(a) ^ set(b)) or "none")
bad = 0
for rel in sorted(set(a) & set(b)):
    ta, tb = pq.read_table(a[rel]), pq.read_table(b[rel])
    if ta.schema != tb.schema or ta.num_rows != tb.num_rows:
        bad += 1
        print("DIFF schema/rows", rel, ta.num_rows, tb.num_rows)
    for col in ("Duration", "Loss Units", "Good Parts"):
        if col in ta.column_names:
            sa = sum(x for x in ta[col].to_pylist() if x is not None)
            sb = sum(x for x in tb[col].to_pylist() if x is not None)
            if abs(sa - sb) > 1e-6:
                bad += 1
                print("DIFF sum", rel, col, sa, sb)
print("files with row, schema or sum differences:", bad)

changed = {}
rows_changed = 0
rows = 0
for rel in sorted(k for k in set(a) & set(b) if k.startswith("Daily_Losses_EU")):
    ra = pq.read_table(a[rel]).to_pylist()
    rb = pq.read_table(b[rel]).to_pylist()
    for x, y in zip(ra, rb):
        rows += 1
        diff = [c for c in x if x[c] != y[c]]
        if diff:
            rows_changed += 1
        for c in diff:
            changed[c] = changed.get(c, 0) + 1
print("Daily_Losses_EU rows", rows, "changed", rows_changed)
print("changed columns:", changed)
