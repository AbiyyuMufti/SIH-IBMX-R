#!/usr/bin/env python3
"""Cutover of EU_OEE_Fact from the month files to the day files of the flows.

From the first day the tab EU OEE Fact write writes for a site, the month
file of that month must no longer hold those days, or Tableau counts them
twice. This script trims the month file: it keeps only the rows with Date
before the first day. Nothing is uploaded or deleted here.

    python scripts/eu_oee_fact_cutover.py <lake copy> <out> <first day> [sites]

<lake copy>  a download of eu_report/report/EU_OEE_Fact (datalake-download-tree)
<out>        new empty folder: trimmed month files at the same relative paths,
             plus upload-list.txt (files to replace) and delete-list.txt
             (month files with no row left: delete them instead)
<first day>  YYYY-MM-DD, the first day the flow writes (its backfill start)
[sites]      default Hull,Nottingham,Weinheim (the Provideam sites)

Then, with the user's go only:
  node scripts/datalake-upload-tree.js <out>/eu_report/report/EU_OEE_Fact
    eu_report/report/EU_OEE_Fact --overwrite --only <out>/upload-list.txt
  node scripts/datalake-delete.js <each path of delete-list.txt>
"""
import datetime
import glob
import os
import sys

import pyarrow.parquet as pq
import polars as pl


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    src, out, first = sys.argv[1], sys.argv[2], sys.argv[3]
    sites = (sys.argv[4] if len(sys.argv) > 4 else "Hull,Nottingham,Weinheim").split(",")
    day = datetime.date.fromisoformat(first)
    month = first[:7]
    uploads, deletes = [], []
    for site in sites:
        pattern = os.path.join(src, "**", "EU_OEE_Fact", "site=" + site,
                               "EU_OEE_Fact_*.parquet")
        for f in sorted(glob.glob(pattern, recursive=True)):
            name = os.path.basename(f)
            ym = name[len("EU_OEE_Fact_"):-len(".parquet")]
            # only month files (YYYY-MM) of the first day's month or later
            if len(ym) != 7 or ym < month:
                continue
            d = pl.read_parquet(f)
            keep = d.filter(pl.col("Date") < day)
            rel = "eu_report/report/EU_OEE_Fact/site=%s/%s" % (site, name)
            print("%-10s %s: %d rows, keep %d (Date < %s)"
                  % (site, name, d.height, keep.height, first))
            if keep.height == 0:
                deletes.append(rel)
                continue
            target = os.path.join(out, rel)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            # same schema as the source file (types of empty columns included)
            table = keep.to_arrow().cast(pq.read_schema(f))
            pq.write_table(table, target, compression="snappy")
            uploads.append("site=%s/%s" % (site, name))
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "upload-list.txt"), "w") as fh:
        fh.write("".join(u + "\n" for u in uploads))
    with open(os.path.join(out, "delete-list.txt"), "w") as fh:
        fh.write("".join(x + "\n" for x in deletes))
    print("replace %d file(s), delete %d file(s); lists in %s"
          % (len(uploads), len(deletes), out))


if __name__ == "__main__":
    main()
