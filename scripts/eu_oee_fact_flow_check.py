#!/usr/bin/env python3
"""Checks the EU_OEE_Fact files of the flows (tab EU OEE Fact write) against
the EU_OEE_Fact month files of the lake, for the days the flow built.

    python scripts/eu_oee_fact_flow_check.py <flow out> <reference> [--hyper]
        [--ignore=Col1,Col2]

<flow out>   the folder of scripts/local-report-build.js after
             helper-chartres-write-parquet.py (<flow out>/report/EU_OEE_Fact)
<reference>  a folder with eu_report/report/EU_OEE_Fact/site=*/*.parquet (the
             month files: a lake download or parquet/eu_oee_fact_rr_build_v2)
--ignore     columns left out of the row comparison (a known difference)
--hyper      also reads every flow file with the Tableau Hyper API (the reader
             of the SIH sync), as the sync of 2026-11-13 did

Checks: same 65 columns and types as the month files, no column of type Null;
per site and record type the rows of the flow days equal the month files
(Plan, Time Utilisation, Loss row by row without loaded_at; Run Rate after
summing the rows of one shift-day, because a shift can span two day files).
Exit code 1 when a check fails. Data is client data: keep the folders
git-ignored.
"""
import glob
import os
import sys

import polars as pl
import pyarrow.parquet as pq

KEYS_RR = ["Date", "SiteName", "Unique Machine Name", "ShiftName",
           "Shift Colour", "PartName"]
RR_SUMS = ["RR Hours", "RR Good Parts", "RR Capacity"]
SKIP = ["loaded_at"]


def files(base):
    pattern = os.path.join(base, "**", "EU_OEE_Fact", "site=*", "*.parquet")
    return sorted(glob.glob(pattern, recursive=True))


def read(paths):
    frames = []
    for p in paths:
        d = pl.read_parquet(p)
        zoned = [c for c, t in d.schema.items()
                 if isinstance(t, pl.Datetime) and t.time_zone]
        d = d.with_columns([pl.col(c).dt.replace_time_zone(None) for c in zoned])
        frames.append(d)
    return pl.concat(frames, how="vertical_relaxed")


def norm(d):
    cols = [c for c in d.columns if c not in SKIP]
    return d.select(cols).sort(cols, nulls_last=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    hyper = "--hyper" in sys.argv
    for a in sys.argv[1:]:
        if a.startswith("--ignore="):
            SKIP.extend(a.split("=", 1)[1].split(","))
            print("   left out of the row comparison: %s" % SKIP)
    flow_files = files(args[0])
    ref_files = files(args[1])
    ok = True
    print("flow files %d, reference files %d" % (len(flow_files), len(ref_files)))

    # 1. schema: names, order, types; no Null type
    ref_schema = [(f.name, str(f.type).replace("large_", ""))
                  for f in pq.read_schema(ref_files[0])]
    bad = 0
    for f in flow_files:
        s = [(x.name, str(x.type).replace("large_", "").replace(", tz=UTC", ""))
             for x in pq.read_schema(f)]
        if s != ref_schema:
            bad += 1
            print("   schema differs: %s" % os.path.basename(f))
        nulls = [x.name for x in pq.read_schema(f) if str(x.type) == "null"]
        if nulls:
            bad += 1
            print("   Null-typed columns in %s: %s" % (os.path.basename(f), nulls))
    ok &= bad == 0
    print("%s 1. schema = month files (%d columns), no Null type: %d bad files"
          % ("ok  " if not bad else "FAIL", len(ref_schema), bad))

    # 2. rows of the flow days
    flow = read(flow_files)
    days = flow.filter(pl.col("Record Type") != "Run Rate")["Date"].unique()
    day_list = days.to_list()
    sites = flow["SiteName"].unique().to_list()
    ref = read(ref_files).filter(
        pl.col("SiteName").is_in(sites) & pl.col("Date").is_in(day_list))
    print("   days %s..%s, sites %s" % (days.min(), days.max(), sorted(sites)))
    for site in sorted(sites):
        for rtype in ["Plan", "Time Utilisation", "Loss", "Run Rate"]:
            a = flow.filter((pl.col("SiteName") == site) & (pl.col("Record Type") == rtype)
                            & pl.col("Date").is_in(day_list))
            b = ref.filter((pl.col("SiteName") == site) & (pl.col("Record Type") == rtype))
            if rtype == "Run Rate":
                agg = [pl.col(c).sum() for c in RR_SUMS]
                a = a.group_by(KEYS_RR).agg(agg)
                b = b.group_by(KEYS_RR).agg(agg)
                a, b = norm(a), norm(b)
            else:
                a, b = norm(a), norm(b.select(a.columns)) if a.height else norm(b)
            same = a.height == b.height and (a.height == 0 or a.equals(b))
            note = ""
            if not same and a.height and b.height:
                cols = [c for c in a.columns if c in b.columns]
                diff = a.join(b, on=cols, how="anti", nulls_equal=True).height
                note = " (%d flow rows not in the month files)" % diff
            ok &= same
            print("%s 2. %-10s %-16s flow %5d rows, month files %5d%s"
                  % ("ok  " if same else "FAIL", site, rtype, a.height, b.height, note))

    # 3. Hyper reads every flow file
    if hyper:
        from tableauhyperapi import HyperProcess, Telemetry, Connection
        failed = 0
        with HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hp:
            with Connection(hp.endpoint) as c:
                for f in flow_files:
                    p = os.path.abspath(f).replace("\\", "/")
                    try:
                        c.execute_list_query("SELECT COUNT(*) FROM external('%s')" % p)
                    except Exception as e:
                        failed += 1
                        print("   Hyper: %s: %s" % (os.path.basename(f), " ".join(str(e).split())[:200]))
        ok &= failed == 0
        print("%s 3. Hyper reads the flow files: %d failed" % ("ok  " if not failed else "FAIL", failed))
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
