"""Read-only. Checks the pbi_* parquet files that the VFC flow wrote, after they
were downloaded with `node scripts/datalake-download.js get <path>` into
downloads/eu_report/pbi_report/report/<table>/.... For every table it checks the
columns and types, the row counts per file, the share of empty values in the
key columns, duplicate rows, and (plan OPT, machine names) the comparison with
the report's own tables when the files of the report folder are there.
Usage: python -I scripts/helper-check-pbi-report.py [folder]
"""
import glob
import os
import sys
from collections import Counter

import pandas as pd
import pyarrow.parquet as pq

ROOT = sys.argv[1] if len(sys.argv) > 1 else "downloads/eu_report/pbi_report/report"
REPORT = "C:/WORK/IBM-RECKITT/ReportReplica/Seguns/"

STR, DBL, I64, TS = "string", "double", "int64", "timestamp[ms, tz=UTC]"
EXPECTED = {
    "pbi_machine_names": [
        ("site_name", STR), ("area", STR), ("dept", STR), ("machine_name", STR),
        ("product_type", STR), ("unique_machine_name", STR), ("loaded_at", TS)],
    "pbi_shift_naming": [("shift", STR), ("loaded_at", TS)],
    "pbi_calendar": [
        ("date", STR), ("year", I64), ("month_number", I64), ("month", STR),
        ("month_short_name", STR), ("month_year", STR), ("month_year_number", STR),
        ("quarter", STR), ("quarter_number", I64), ("week_number", I64), ("week_start", STR)],
    "pbi_plan_opt": [
        ("site_name", STR), ("area_name", STR), ("machine_name", STR),
        ("unique_machine_name", STR), ("date", STR), ("shift_name", STR),
        ("part_name", STR), ("product_key", STR), ("good_parts", DBL),
        ("capacity", DBL), ("downtime_units", DBL), ("total_time", DBL),
        ("planned_opt", DBL), ("oee_time", DBL), ("oee_target", DBL),
        ("pdt_target", DBL), ("updt_target", DBL), ("source_hours", I64), ("loaded_at", TS)],
    "pbi_time_utilisation": [
        ("site_name", STR), ("machine_name", STR), ("unique_machine_name", STR),
        ("date", STR), ("total_time_total", DBL), ("planned_opt_total", DBL),
        ("oee_time_total", DBL), ("all_time", I64), ("loaded_at", TS)],
    "pbi_daily_losses": [
        ("site_name", STR), ("machine_name", STR), ("unique_machine_name", STR),
        ("date", STR), ("time", STR), ("shift_start_date", STR), ("shift_name", STR),
        ("duration", DBL), ("loss_units", DBL), ("loss_lvl3_group", STR),
        ("loss_lvl3_sub_group", STR), ("loss_lvl3_desc", STR), ("loss_final_level", STR),
        ("equipment", STR), ("breakdown_types", STR), ("batch_id", STR),
        ("comment_count", I64), ("part_name", STR), ("product_key", STR),
        ("loss_target_key", STR), ("value", DBL), ("target", DBL), ("volume_key", STR),
        ("volume_total", DBL), ("comment", STR), ("merged", STR),
        ("shift_name_copy", STR), ("volume_day_key", STR), ("loaded_at", TS)],
}
KEY_COLUMNS = {
    "pbi_plan_opt": ["shift_name", "oee_target", "pdt_target", "updt_target", "total_time", "product_key"],
    "pbi_time_utilisation": ["total_time_total", "planned_opt_total"],
    "pbi_daily_losses": ["shift_name", "loss_units", "equipment", "value", "volume_total",
                         "loss_lvl3_sub_group", "duration"],
    "pbi_machine_names": ["dept", "area", "product_type"],
}
problems = 0


def say(text=""):
    print(text)


def schema_of(path):
    s = pq.read_schema(path)
    return [(n, str(t)) for n, t in zip(s.names, s.types)]


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
    if "site_name" in d:
        say("  rows per site: " + str(d.site_name.value_counts().to_dict()))
    cols = [c for c in KEY_COLUMNS.get(table, []) if c in d]
    if cols:
        say("  empty share: " + ", ".join(f"{c} {d[c].isna().mean():.1%}" for c in cols))
    dupes = int(d.drop(columns=[c for c in ["_file", "loaded_at"] if c in d]).duplicated().sum())
    say(f"  fully duplicated rows: {dupes}")
    # Plan OPT rows can repeat (two shift segments of a product with the same values):
    # the report has them too (170 of its 16655 Hull rows), so it is only a note.
    if dupes and table not in ("pbi_daily_losses", "pbi_plan_opt"):
        problems += 1
    if table in ("pbi_plan_opt", "pbi_daily_losses", "pbi_time_utilisation"):
        d["month"] = d["date"].str[:7] if table != "pbi_daily_losses" else d["shift_start_date"].str[:7]
        per = d.groupby(["site_name", "month"]).size().unstack(0)
        say("  rows per month and site (first 6):")
        say(per.head(6).to_string())

# machine names against the report
mn = f"{ROOT}/pbi_machine_names/pbi_machine_names.parquet"
rep_mn = REPORT + "Machine Names EU.parquet"
if os.path.exists(mn) and os.path.exists(rep_mn):
    m = pd.read_parquet(mn)
    r = pd.read_parquet(rep_mn)
    r = r[r.SiteName.isin(m.site_name.unique())]
    a = set(zip(m.machine_name, m.dept, m.area, m.product_type, m.site_name, m.unique_machine_name))
    b = set(zip(r.MachineName, r.Dept, r.Area, r["Product Type"], r.SiteName, r["Unique Machine Name"]))
    say(f"\nmachine names against the report: identical sets {a == b} ({len(a)} vs {len(b)})")
    problems += a != b

# plan OPT against the report
plan_files = sorted(glob.glob(f"{ROOT}/pbi_plan_opt/**/*.parquet", recursive=True))
rep_plan = REPORT + "Plan OPT EU.parquet"
if plan_files and os.path.exists(rep_plan):
    o = pd.concat([pd.read_parquet(f) for f in plan_files], ignore_index=True)
    r = pd.read_parquet(rep_plan)
    r["date"] = r.Date.dt.strftime("%Y-%m-%d")
    r = r.rename(columns={"AreaName": "area_name", "MachineName": "machine_name", "ShiftName": "shift_name",
                          "PartName": "part_name", "Good Parts": "good_parts", "Capacity": "capacity",
                          "Total Time": "total_time", "Planned OpT": "planned_opt", "OEE Time": "oee_time",
                          "Downtime Units": "downtime_units", "SiteName": "site_name",
                          "Unique Machine Name": "unique_machine_name", "Product Key": "product_key",
                          "UPDT Target": "updt_target", "PDT Target": "pdt_target", "OEE Target": "oee_target"})
    cols = ["site_name", "date", "area_name", "machine_name", "shift_name", "part_name", "good_parts", "capacity",
            "total_time", "planned_opt", "oee_time", "downtime_units", "unique_machine_name", "product_key",
            "updt_target", "pdt_target", "oee_target"]
    sites = set(o.site_name)
    months = {(s, m) for s, m in zip(o.site_name, o.date.str[:7])}
    r = r[r.site_name.isin(sites) & (r.date <= r.date.max())]
    r = r[[(s, m) in months for s, m in zip(r.site_name, r.date.str[:7])]]
    o = o[o.date <= r.date.max()] if len(r) else o

    def keyset(df):
        x = df[cols].copy()
        for c in ["good_parts", "capacity", "total_time", "planned_opt", "oee_time", "downtime_units",
                  "updt_target", "pdt_target", "oee_target"]:
            x[c] = pd.to_numeric(x[c], errors="coerce").round(4)
        x = x.astype(object).where(x.notna(), None)
        return Counter(x.apply(tuple, axis=1))
    co, cr = keyset(o), keyset(r)
    same = sum((co & cr).values())
    say(f"\nplan OPT against the report (same sites and months, up to {r.date.max() if len(r) else '-'}): "
        f"{same} of {len(r)} report rows identical in 17 columns ({same / max(len(r), 1):.2%})")
say(f"\nproblems: {problems}")
sys.exit(1 if problems else 0)
