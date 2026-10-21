"""Read-only. Checks the parquet files of the PBI report build (Plan_OPT_EU,
Time_Utilisation_EU, Daily_Losses_EU) after they were downloaded with
`node scripts/datalake-download-tree.js eu_report/report/` into
downloads/eu_report/report/<table>/ (or give the candidate folder).
For every table it checks the columns and types (the Tableau extracts, then
Data Source and our extra columns), the row counts per file, the share of
empty values in the key columns, duplicate rows, and the comparison with
Segun's Tableau extracts (downloads/eu_oee_latest/, Hyper converted to
parquet).
Usage: python -I scripts/helper-check-pbi-report.py [folder]
"""
import glob
import os
import sys
from collections import Counter

import pandas as pd
import pyarrow.parquet as pq

ROOT = sys.argv[1] if len(sys.argv) > 1 else "downloads/eu_report/report"
REPORT = "downloads/eu_oee_latest/"

STR, DBL, I64, TS, DT = "string", "double", "int64", "timestamp[ms, tz=UTC]", "date32[day]"
EXPECTED = {
    "Plan_OPT_EU": [
        ("Date", DT), ("AreaName", STR), ("MachineName", STR), ("ShiftName", STR),
        ("PartName", STR), ("Good Parts", I64), ("Capacity", DBL), ("Total Time", I64),
        ("Planned OpT", I64), ("OEE Time", I64), ("Downtime Units", DBL), ("SiteName", STR),
        ("Unique Machine Name", STR), ("Product Key", STR), ("UPDT Target", DBL),
        ("PDT Target", DBL), ("OEE Target", DBL), ("Dept", STR), ("Area", STR), ("Product Type", STR), ("Data Source", STR),
        ("source_hours", I64), ("loaded_at", TS)],
    "Time_Utilisation_EU": [
        ("Date", DT), ("MachineName", STR), ("OEE Time Total", DBL), ("Total Time Total", DBL),
        ("Planned OPT Total", DBL), ("SiteName", STR), ("Unique Machine Name", STR),
        ("All Time", I64), ("Dept", STR), ("Area", STR), ("Product Type", STR), ("Data Source", STR), ("loaded_at", TS)],
    "Daily_Losses_EU": [
        ("Date", DT), ("Time", TS), ("MachineName", STR), ("PartName", STR), ("Shift Time", STR),
        ("ShiftName", STR), ("OEELossLvl3Group", STR), ("OEELossLvl3SubGroup", STR),
        ("OEELossLvl3Desc", STR), ("Duration", TS), ("SiteName", STR),
        ("Unique Machine Name", STR), ("Breakdown Types", STR), ("ShiftStartDate", DT),
        ("Comment", STR), ("Product Key", STR), ("Volume Key", STR), ("Loss Units", DBL),
        ("Time in Mins", DBL), ("Equipment Loss Key", STR), ("Equipment", STR),
        ("Lvl 3 Loss Name", STR), ("Loss Target Key", STR), ("Value", STR),
        ("Volume Total", DBL), ("Loss Final Level", STR), ("Dept", STR), ("Area", STR), ("Product Type", STR), ("Data Source", STR),
        ("target", DBL), ("batch_id", STR),
        ("comment_count", I64), ("loaded_at", TS)],
}
KEY_COLUMNS = {
    "Plan_OPT_EU": ["ShiftName", "OEE Target", "PDT Target", "UPDT Target", "Total Time", "Product Key",
                    "Dept"],
    "Time_Utilisation_EU": ["Total Time Total", "Planned OPT Total", "Dept"],
    "Daily_Losses_EU": ["ShiftName", "Loss Units", "Equipment", "Value", "Volume Total",
                        "OEELossLvl3SubGroup", "Duration", "Comment", "Dept"],
}
MONTH_COLUMN = {"Plan_OPT_EU": "Date", "Time_Utilisation_EU": "Date",
                "Daily_Losses_EU": "ShiftStartDate"}
# The columns compared with the extracts, besides the keys.
MACHINE = ["Dept", "Area", "Product Type"]
problems = 0


def say(text=""):
    print(text)


def schema_of(path):
    s = pq.read_schema(path)
    return [(n, str(t)) for n, t in zip(s.names, s.types)]


def load(table):
    files = sorted(glob.glob(f"{ROOT}/{table}/**/*.parquet", recursive=True))
    return files, (pd.concat([pd.read_parquet(f) for f in files], ignore_index=True) if files else None)


for table, expected in EXPECTED.items():
    files = sorted(glob.glob(f"{ROOT}/{table}/**/*.parquet", recursive=True))
    if not files:
        say(f"\n{table}: no file downloaded")
        continue
    frames = []
    bad_schema = 0
    for f in files:
        if schema_of(f) != expected:
            bad_schema += 1
            if bad_schema == 1:
                got = schema_of(f)
                say(f"  SCHEMA DIFFERS in {os.path.basename(f)}: missing "
                    f"{[c for c in expected if c not in got]}, extra {[c for c in got if c not in expected]}")
        df = pd.read_parquet(f)
        df["_file"] = os.path.basename(f)
        frames.append(df)
    d = pd.concat(frames, ignore_index=True)
    problems += bad_schema
    say(f"\n{table}: {len(files)} file(s), {len(d)} rows, schema ok in {len(files) - bad_schema}/{len(files)}")
    if "SiteName" in d:
        say("  rows per site: " + str(d.SiteName.value_counts().to_dict()))
    cols = [c for c in KEY_COLUMNS.get(table, []) if c in d]
    if cols:
        say("  empty share: " + ", ".join(f"{c} {d[c].isna().mean():.1%}" for c in cols))
    dupes = int(d.drop(columns=[c for c in ["_file", "loaded_at"] if c in d]).duplicated().sum())
    say(f"  fully duplicated rows: {dupes}")
    # Plan OPT rows can repeat (two shift segments of a product with the same values):
    # the report has them too, so it is only a note. Daily losses: two identical stops.
    if dupes and table not in ("Daily_Losses_EU", "Plan_OPT_EU"):
        problems += 1
    if table in MONTH_COLUMN and MONTH_COLUMN[table] in d:
        d["month"] = d[MONTH_COLUMN[table]].astype(str).str[:7]
        per = d.groupby(["SiteName", "month"]).size().unstack(0)
        say("  rows per month and site (first 6):")
        say(per.head(6).to_string())

if problems:
    say(f"\nproblems: {problems} (the files do not have the columns of the workbook: "
        "run the flow again; the comparisons with the report are skipped)")
    sys.exit(1)
plan_files, plan = load("Plan_OPT_EU")
util_files, util = load("Time_Utilisation_EU")
loss_files, loss = load("Daily_Losses_EU")


def report(name):
    path = REPORT + name
    return pd.read_parquet(path) if os.path.exists(path) else None


# plan OPT against the extract: the 17 columns of the workbook and Dept, Area, Product Type
rep = report("Plan_OPT_EU.parquet")
if plan is not None and rep is not None:
    cols = [c for c, _ in EXPECTED["Plan_OPT_EU"][:17]] + [c for c in MACHINE if c in rep]
    last = rep.Date.max()
    months = {(s, str(x)[:7]) for s, x in zip(plan.SiteName, plan.Date)}
    r = rep[rep.SiteName.isin(set(plan.SiteName))]
    r = r[[(s, str(x)[:7]) in months for s, x in zip(r.SiteName, r.Date)]]
    o = plan[plan.Date <= last]

    def keyset(df):
        x = df[cols].copy()
        for c in ["Good Parts", "Capacity", "Total Time", "Planned OpT", "OEE Time", "Downtime Units",
                  "UPDT Target", "PDT Target", "OEE Target"]:
            x[c] = pd.to_numeric(x[c], errors="coerce").round(4)
        x["Date"] = x["Date"].astype(str)
        x = x.astype(object).where(x.notna(), None)
        return Counter(x.apply(tuple, axis=1))
    co, cr = keyset(o), keyset(r)
    same = sum((co & cr).values())
    say(f"\nplan OPT against the report (same sites and months, up to {last}): "
        f"{same} of {len(r)} report rows identical in {len(cols)} columns ({same / max(len(r), 1):.2%})")

# time utilisation against the report: one row per machine and day
rep = report("Time_Utilisation_EU.parquet")
if util is not None and rep is not None:
    last = rep.Date.max()
    months = {(s, str(x)[:7]) for s, x in zip(util.SiteName, util.Date)}
    r = rep[rep.SiteName.isin(set(util.SiteName))]
    r = r[[(s, str(x)[:7]) in months for s, x in zip(r.SiteName, r.Date)]]
    o = util[util.Date <= last]
    m = o.merge(r, on=["SiteName", "MachineName", "Date"], how="outer", suffixes=("_o", "_r"), indicator=True)
    both = m[m._merge == "both"]
    say(f"\ntime utilisation against the report (up to {last}): rows {len(o)} vs {len(r)}, "
        f"same machine-day {len(both)}, only ours {int((m._merge == 'left_only').sum())}, "
        f"only report {int((m._merge == 'right_only').sum())}")
    for c in ["OEE Time Total", "Total Time Total", "Planned OPT Total", "All Time"]:
        if c + "_r" not in both:
            continue
        ok = ((both[c + "_o"] - both[c + "_r"]).abs() <= 0.01) | (both[c + "_o"].isna() & both[c + "_r"].isna())
        say(f"  {c}: {ok.mean():.2%} equal")
    for c in MACHINE:
        if c + "_r" in both:
            a, b = both[c + "_o"], both[c + "_r"]
            say(f"  {c}: {(((a == b) | (a.isna() & b.isna())).mean()):.2%} equal")

# daily losses against the report: one row per stop and equipment
rep = report("Daily_Losses_EU.parquet")
if loss is not None and rep is not None:
    def prep(df, ours):
        x = df.copy()
        x["d"] = x["Date"].astype(str).str[:10]
        t = pd.to_datetime(x["Time"])
        # the extract cuts every start to the minute; some source files have seconds
        x["t"] = t.dt.hour * 60 + t.dt.minute
        x["dl"] = x["OEELossLvl3Desc"].str.lower()
        x["el"] = x["Equipment"].fillna("")
        return x
    o, r = prep(loss, True), prep(rep, False)
    last = r.d.max()
    months = {(s, x[:7]) for s, x in zip(o.SiteName, o.d)}
    r = r[r.SiteName.isin(set(o.SiteName))]
    r = r[[(s, x[:7]) in months for s, x in zip(r.SiteName, r.d)]]
    o = o[o.d <= last]
    key = ["SiteName", "MachineName", "d", "t", "dl", "el"]
    o["n"] = o.groupby(key).cumcount()
    r["n"] = r.groupby(key).cumcount()
    m = o.merge(r, on=key + ["n"], how="outer", suffixes=("_o", "_r"), indicator=True)
    both = m[m._merge == "both"]
    say(f"\ndaily losses against the report (up to {last}): rows {len(o)} vs {len(r)}, "
        f"same stop {len(both)} ({len(both) / max(len(r), 1):.2%}), only ours {int((m._merge == 'left_only').sum())}, "
        f"only report {int((m._merge == 'right_only').sum())}")
    say("  (the stop is matched on site, machine, start and description without case; the report "
        "model keeps ONE spelling of texts that differ only in capitals, ours keeps the spelling of the file)")
    texts = ["ShiftName", "Shift Time", "OEELossLvl3Group", "OEELossLvl3SubGroup", "OEELossLvl3Desc",
             "PartName", "Breakdown Types", "Comment", "Product Key", "Volume Key", "Equipment Loss Key",
             "Lvl 3 Loss Name", "Loss Target Key", "Value", "Loss Final Level"] + MACHINE
    line = []
    for c in [c for c in texts if c + "_r" in both]:
        a, b = both[c + "_o"], both[c + "_r"]
        line.append(f"{c} {(((a == b) | (a.isna() & b.isna())).mean()):.2%}")
    say("  equal: " + "; ".join(line))
    # the extract rounds Loss Units and Volume Total to whole units
    for c, tol in [("Loss Units", 0.99), ("Time in Mins", 0.02), ("Volume Total", 0.99)]:
        if c + "_r" not in both:
            continue
        a, b = both[c + "_o"], both[c + "_r"]
        ok = ((a - b).abs() <= tol) | (a.isna() & b.isna())
        say(f"  {c}: {ok.mean():.2%} equal (tolerance {tol})")
say(f"\nproblems: {problems}")
sys.exit(1 if problems else 0)
