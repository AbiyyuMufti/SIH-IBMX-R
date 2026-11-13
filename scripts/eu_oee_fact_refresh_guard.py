#!/usr/bin/env python3
"""Guard before the daily EU_OEE_Fact upload (scripts/local-daily-refresh.js).

    python scripts/eu_oee_fact_refresh_guard.py <new dir> <live dir> <first day> <site,..> <YYYY-MM,..>

<new dir>/<live dir>: folders with site=<Site>/EU_OEE_Fact_<YYYY-MM>.parquet
(the new build and a fresh download of the lake). <first day>: first day of
the refetch window. For each site and month it checks that the new month file
- has exactly the schema of the live file (names, order, types) and no
  Null-typed column (the Hyper sync error of 2026-11-13),
- has the same number of rows as the live file for every record type before
  the first day (nothing older than the window changed),
- has rows on or after the first day for at least one site (data arrived).
Exit code 1 on any failure; the data is client data, nothing is printed of it.
"""
import datetime
import os
import sys

import polars as pl
import pyarrow.parquet as pq


def main():
    new, live, first, sites, months = sys.argv[1:6]
    day = datetime.date.fromisoformat(first)
    ok = True
    fresh = 0
    for site in sites.split(","):
        for ym in months.split(","):
            name = "EU_OEE_Fact_%s.parquet" % ym
            n = os.path.join(new, "site=" + site, name)
            o = os.path.join(live, "site=" + site, name)
            if not os.path.exists(n):
                print("FAIL %s %s: new file missing" % (site, ym))
                ok = False
                continue
            ns = [(f.name, str(f.type)) for f in pq.read_schema(n)]
            nulls = [c for c, t in ns if t == "null"]
            if nulls:
                print("FAIL %s %s: Null-typed columns %s" % (site, ym, nulls))
                ok = False
            nd = pl.read_parquet(n)
            fresh += nd.filter(pl.col("Date") >= day).height
            if not os.path.exists(o):
                print("ok   %s %s: new month (no live file), %d rows" % (site, ym, nd.height))
                continue
            os_ = [(f.name, str(f.type)) for f in pq.read_schema(o)]
            if ns != os_:
                print("FAIL %s %s: schema differs from the live file" % (site, ym))
                ok = False
            od = pl.read_parquet(o)
            a = nd.filter(pl.col("Date") < day).group_by("Record Type").len().sort("Record Type")
            b = od.filter(pl.col("Date") < day).group_by("Record Type").len().sort("Record Type")
            same = a.rows() == b.rows()
            ok &= same
            print("%s %s %s: rows %d (live %d), before %s equal: %s"
                  % ("ok  " if same else "FAIL", site, ym, nd.height, od.height, first, same))
    if fresh == 0:
        print("FAIL no row on or after %s in any site: the fetch brought nothing" % first)
        ok = False
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
