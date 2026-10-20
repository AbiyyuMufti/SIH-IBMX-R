"""Read-only. Checks the pbi_* parquet files that the VFC flow wrote, after they
were downloaded with `node scripts/datalake-download-tree.js
eu_report/report/` into downloads/eu_report/report/<table>/.
For every table it checks the columns and types (the names and types of the
Tableau workbook "EU Daily OEE Report - WIP5", then our extra columns), the row
counts per file, the share of empty values in the key columns, duplicate rows,
and the comparison with the report's own tables (Segun's data, downloaded with
`node scripts/datalake-download-tree.js Sandbox/report_test/ --out
downloads/sandbox-report-test`).
Usage: python -I scripts/helper-check-pbi-report.py [folder]
"""
import glob
import os
import sys
from collections import Counter

import pandas as pd
import pyarrow.parquet as pq

ROOT = sys.argv[1] if len(sys.argv) > 1 else "downloads/eu_report/report"
REPORT = "downloads/sandbox-report-test/Sandbox/report_test/"

STR, DBL, I64, TS, DT = "string", "double", "int64", "timestamp[ms, tz=UTC]", "date32[day]"
EXPECTED = {
    "pbi_machine_names": [
        ("MachineName", STR), ("Dept", STR), ("Area", STR), ("Product Type", STR),
        ("SiteName", STR), ("Unique Machine Name", STR), ("loaded_at", TS)],
    "pbi_shift_naming": [("shift", STR), ("loaded_at", TS)],
    "pbi_calendar": [
        ("date", STR), ("year", I64), ("month_number", I64), ("month", STR),
        ("month_short_name", STR), ("month_year", STR), ("month_year_number", STR),
        ("quarter", STR), ("quarter_number", I64), ("week_number", I64), ("week_start", STR)],
    "pbi_plan_opt": [
        ("Date", DT), ("AreaName", STR), ("MachineName", STR), ("ShiftName", STR),
        ("PartName", STR), ("Good Parts", I64), ("Capacity", DBL), ("Total Time", I64),
        ("Planned OpT", I64), ("OEE Time", I64), ("Downtime Units", DBL), ("SiteName", STR),
        ("Unique Machine Name", STR), ("Product Key", STR), ("UPDT Target", DBL),
        ("PDT Target", DBL), ("OEE Target", DBL), ("source_hours", I64), ("loaded_at", TS)],
    "pbi_time_utilisation": [
        ("Date", DT), ("MachineName", STR), ("OEE Time Total", DBL), ("Total Time Total", DBL),
        ("Planned OPT Total", DBL), ("SiteName", STR), ("Unique Machine Name", STR),
        ("All Time", I64), ("loaded_at", TS)],
    "pbi_daily_losses": [
        ("Date", DT), ("Time", TS), ("MachineName", STR), ("PartDesc", STR), ("Shift Time", STR),
        ("ShiftName", STR), ("OEELossLvl3Group", STR), ("OEELossLvl3SubGroup", STR),
        ("OEELossLvl3Desc", STR), ("Duration", TS), ("SiteName", STR),
        ("Unique Machine Name", STR), ("Breakdown Types", STR), ("ShiftStartDate.1", DT),
        ("Comment", STR), ("Product Key", STR), ("Volume Key", STR), ("Loss Units", DBL),
        ("Time in Mins", DBL), ("Equipment Loss Key", STR), ("Equipment", STR),
        ("Lvl 3 Loss Name", STR), ("Loss Target Key", STR), ("Value", STR),
        ("Volume Total", DBL), ("Loss Final Level", STR), ("target", DBL), ("batch_id", STR),
        ("comment_count", I64), ("loaded_at", TS)],
}
KEY_COLUMNS = {
    "pbi_plan_opt": ["ShiftName", "OEE Target", "PDT Target", "UPDT Target", "Total Time", "Product Key"],
    "pbi_time_utilisation": ["Total Time Total", "Planned OPT Total"],
    "pbi_daily_losses": ["ShiftName", "Loss Units", "Equipment", "Value", "Volume Total",
                         "OEELossLvl3SubGroup", "Duration", "Comment"],
    "pbi_machine_names": ["Dept", "Area", "Product Type"],
}
MONTH_COLUMN = {"pbi_plan_opt": "Date", "pbi_time_utilisation": "Date",
                "pbi_daily_losses": "ShiftStartDate.1"}
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
    if dupes and table not in ("pbi_daily_losses", "pbi_plan_opt"):
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
mn_files, mn = load("pbi_machine_names")
plan_files, plan = load("pbi_plan_opt")
util_files, util = load("pbi_time_utilisation")
loss_files, loss = load("pbi_daily_losses")


def report(name):
    path = REPORT + name
    return pd.read_parquet(path) if os.path.exists(path) else None


# machine names against the report
rep = report("Machine_Names_EU.parquet")
if mn is not None and rep is not None:
    rep = rep[rep.SiteName.isin(mn.SiteName.unique())]
    cols = ["MachineName", "Dept", "Area", "Product Type", "SiteName", "Unique Machine Name"]
    a, b = set(map(tuple, mn[cols].values)), set(map(tuple, rep[cols].values))
    say(f"\nmachine names against the report: identical sets {a == b} ({len(a)} vs {len(b)})")
    problems += a != b

# plan OPT against the report: the 17 columns of the workbook
rep = report("Plan_OPT_EU.parquet")
if plan is not None and rep is not None:
    cols = [c for c, _ in EXPECTED["pbi_plan_opt"][:17]]
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
        f"{same} of {len(r)} report rows identical in 17 columns ({same / max(len(r), 1):.2%})")

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
        ok = ((both[c + "_o"] - both[c + "_r"]).abs() <= 0.01) | (both[c + "_o"].isna() & both[c + "_r"].isna())
        say(f"  {c}: {ok.mean():.2%} equal")

# daily losses against the report: one row per stop and equipment
rep = report("Daily_Losses_EU.parquet")
if loss is not None and rep is not None:
    def prep(df, ours):
        x = df.copy()
        x["d"] = x["Date"].astype(str).str[:10]
        t = pd.to_datetime(x["Time"])
        x["t"] = (t.dt.hour * 3600 + t.dt.minute * 60 + t.dt.second + t.dt.microsecond / 1e6).round()
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
             "PartDesc", "Breakdown Types", "Comment", "Product Key", "Volume Key", "Equipment Loss Key",
             "Lvl 3 Loss Name", "Loss Target Key", "Value", "Loss Final Level"]
    line = []
    for c in texts:
        a, b = both[c + "_o"], both[c + "_r"]
        line.append(f"{c} {(((a == b) | (a.isna() & b.isna())).mean()):.2%}")
    say("  equal: " + "; ".join(line))
    for c, tol in [("Loss Units", 0.01), ("Time in Mins", 0.02), ("Volume Total", 0.01)]:
        a, b = both[c + "_o"], both[c + "_r"]
        ok = ((a - b).abs() <= tol) | (a.isna() & b.isna())
        say(f"  {c}: {ok.mean():.2%} equal (tolerance {tol})")
say(f"\nproblems: {problems}")
sys.exit(1 if problems else 0)
