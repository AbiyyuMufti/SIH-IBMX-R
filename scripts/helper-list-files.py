"""Counts parquet files and rows per table and site folder (read only).
Usage: python -I scripts/helper-list-files.py <report dir>
"""
import collections
import glob
import os
import sys

import pyarrow.parquet as pq

files = collections.Counter()
rows = collections.Counter()
for f in glob.glob(os.path.join(sys.argv[1], "*", "site=*", "*.parquet")):
    key = (os.path.basename(os.path.dirname(os.path.dirname(f))), os.path.basename(os.path.dirname(f)))
    files[key] += 1
    rows[key] += pq.read_metadata(f).num_rows
for key in sorted(files):
    print(key, files[key], rows[key])
print("total", sum(files.values()), sum(rows.values()))
