#!/usr/bin/env python3
"""Build EU_OEE_Fact WITH Run Rate rows (65 columns) in a LOCAL folder (no upload).

Copy of eu_oee_fact_build.py (62 columns, the format in the lake) plus step 4.
Keep both: the old format may still be needed.

    python scripts/eu_oee_fact_rr_build.py build [--parts DIR] [--glidepath DIR] [--out DIR]
    python scripts/eu_oee_fact_rr_build.py check [--parts DIR] [--glidepath DIR] [--out DIR] [--reference CSV]

Spec: bi-builder/docs/eu-oee-fact-spec.md. Reference code: bi-builder/tools/eu_oee_fact.py and
apply_glidepath.py. Proof and decisions: prompt-response/eu-oee-fact-build.md.

build  reads the lake tables (parquet, layout <parts>/eu_report/report/<Table>/site=<Site>/*.parquet)
       1. rewrites targets from the glidepath files (Hull, Nottingham, Weinheim), spec section 7
          Site_PDT_Targets, Site_UPDT_Targets (fractions), Plan_OPT_EU (percent points),
          Daily_Losses_EU.target (fraction). Other sites are not touched.
       2. Chartres Plan_OPT_EU UPDT Target / PDT Target: fraction -> percent points
       3. stacks Plan, Loss, Time Utilisation into EU_OEE_Fact (union, never a join), one file per
          site and month: <out>/eu_report/report/EU_OEE_Fact/site=<Site>/EU_OEE_Fact_<YYYY-MM>.parquet
       4. adds Run Rate rows from Run_Rates_EU: per shift start day, line, shift, part the
          totals RR Hours / RR Good Parts / RR Capacity (docs/eu-oee-fact-run-rate.md)
check  proves the build (stacking parity, glidepath values, KPIs, parity with the reference CSV)

Nothing is written outside --out. The data is real client data: keep it in a git-ignored folder.
"""
import argparse
import datetime
import glob
import os
import sys

import polars as pl

BI = r"C:\WORK\IBM-RECKITT\bi-builder"
PARTS = os.path.join(BI, "data", "eu_report_latest", "parts")
GLIDE_DIR = os.path.join(BI, "downloads")
GLIDE_FILES = [
    "Glidepath Hull Add Updates Inside.csv",
    "Glidepath Notts Targets Add Updates Inside.csv",
    "Glidepath Weinheim Targets Add Updates Inside.csv",
]
REFERENCE = os.path.join(BI, "data", "eu_oee_fact", "EU_OEE_Fact.csv")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "parquet", "eu_oee_fact_rr_build")

KEY = "Unique Machine Name"
FIRST = [
    "Record Type",
    "Date",
    "SiteName",
    "MachineName",
    KEY,
    "ShiftName",
    "Dept",
    "Area",
    "Product Type",
    "In EU Report",
]
LOSS_RENAMES = {
    "Date": "Event Date",
    "ShiftStartDate": "Date",
    "Shift colour": "Shift Colour",
    "target": "Loss Target",
}
BUCKET_FIX = {"In process Quality": "In Process Quality"}
PLAN_COLS = {
    "OEE Target": "% OEE",
    "UPDT Target": "Unplanned Downtime (Total)",
    "PDT Target": "Planned Downtime (Total)",
}
SITE_TABLES = {
    "Site_PDT_Targets": ("Planned Downtime (Total)", "PDT Target"),
    "Site_UPDT_Targets": ("Unplanned Downtime (Total)", "UPDT Target"),
}
MEASURES = {
    "Plan": ["Capacity", "Good Parts"],
    "Loss": ["Loss Units", "Duration"],
    "Time Utilisation": ["OEE Time Total", "Total Time Total"],
}
TABLE_OF = {
    "Plan": "Plan_OPT_EU",
    "Loss": "Daily_Losses_EU",
    "Time Utilisation": "Time_Utilisation_EU",
}
SITES = ["Chartres", "Hull", "Nottingham", "Weinheim"]
SHIFTS = os.path.join("eu_report", "reference", "shift_naming", "site=All",
                      "Shift Patterns Provideam EU.csv")
# Run Rate rows: new columns at the end, so the 62 old columns keep their place
RR_COLS = ["RR Hours", "RR Good Parts", "RR Capacity"]
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
# Plan's part text fixes (b6-plan-rows.js RULES.replaceText), so Product Keys match
PART_FIX = {"Hull": [("Gavi 12 X 150 Russian Crypto", "Gavi 12 x 150 russian Crypto")]}
COLOUR_SITES = ["Hull"]
FORMAT_COLS = ["Brand", "Unit Size", "Unit Count/Format", "Extra Info"]


def root(base):
    return os.path.join(base, "eu_report", "report")


def lake_files(base, table, site=None):
    pattern = os.path.join(root(base), table, "site=" + (site or "*"), "*.parquet")
    return sorted(glob.glob(pattern))


def read_file(path):
    # keep the stored clock value, drop any time zone (as lake_to_csv.py does)
    d = pl.read_parquet(path)
    zoned = [
        c for c, t in d.schema.items()
        if isinstance(t, pl.Datetime) and t.time_zone
    ]
    return d.with_columns([pl.col(c).dt.replace_time_zone(None) for c in zoned])


def read_table(base, table, site=None):
    frames = [read_file(f) for f in lake_files(base, table, site)]
    if not frames:
        return None
    return pl.concat(frames, how="diagonal_relaxed")


def num(col):
    return pl.col(col).cast(pl.Float64, strict=False)


# ---------------------------------------------------------------- glidepath


def read_glidepath(directory):
    frames = []
    for name in GLIDE_FILES:
        d = pl.read_csv(os.path.join(directory, name), infer_schema_length=0)
        months = [c for c in d.columns if "/" in c]
        g = (
            d.unpivot(index=["Site Name", "Line", "OEE Bucket"], on=months,
                      variable_name="m", value_name="v")
            .filter(pl.col("v").is_not_null() & (pl.col("v").str.strip_chars() != ""))
            .select(
                pl.col("Site Name").str.strip_chars().alias("Site"),
                pl.col("Line").str.strip_chars().alias("Line"),
                pl.col("OEE Bucket").str.strip_chars().replace(BUCKET_FIX).alias("Bucket"),
                pl.col("m").str.to_date("%d/%m/%Y").alias("Month"),
                pl.col("v").str.strip_chars().cast(pl.Float64).alias("v"),
            )
        )
        frames.append(g)
    g = pl.concat(frames)
    dup = g.group_by("Site", "Line", "Bucket", "Month").len().filter(pl.col("len") > 1)
    if dup.height:
        raise SystemExit("glidepath has duplicate keys: %d (stop, see rule 6)" % dup.height)
    return g


def key_month(col):
    return pl.col(col).str.slice(-10).str.to_date("%d/%m/%Y", strict=False)


def fix_plan(d, g, sites):
    """Plan_OPT_EU: three target columns from the glidepath, percent points."""
    n = d.height
    d = d.with_row_index("_i").with_columns(
        pl.col("MachineName").str.strip_chars().alias("_line"),
        key_month("Targets Key").alias("_m"),
    )
    for col, bucket in PLAN_COLS.items():
        look = g.filter(pl.col("Bucket") == bucket).select(
            pl.col("Site").alias("SiteName"),
            pl.col("Line").alias("_line"),
            pl.col("Month").alias("_m"),
            pl.col("v").alias("_new"),
        )
        d = d.join(look, on=["SiteName", "_line", "_m"], how="left").sort("_i")
        d = d.with_columns(
            pl.when(pl.col("SiteName").is_in(sites))
            .then(pl.col("_new"))
            .otherwise(pl.col(col))
            .alias(col)
        ).drop("_new")
    assert d.height == n, "plan join changed the row count"
    return d.drop("_i", "_line", "_m")


def fix_loss(d, g, sites):
    """Daily_Losses_EU.target: fraction, by line, loss category and month of the key."""
    n = d.height
    cats = sorted(set(g["Bucket"]) - set(PLAN_COLS.values()))
    d = d.with_row_index("_i").with_columns(
        pl.col("MachineName").str.strip_chars().alias("_line"),
        key_month("Loss Target Key").alias("_m"),
    )
    look = g.filter(pl.col("Bucket").is_in(cats)).select(
        pl.col("Site").alias("SiteName"),
        pl.col("Line").alias("_line"),
        pl.col("Bucket").alias("OEELossLvl3SubGroup"),
        pl.col("Month").alias("_m"),
        (pl.col("v") / 100).round(6).alias("_new"),
    )
    d = d.join(look, on=["SiteName", "_line", "OEELossLvl3SubGroup", "_m"], how="left")
    d = d.sort("_i")
    hit = (
        pl.col("SiteName").is_in(sites)
        & pl.col("OEELossLvl3SubGroup").is_in(cats)
        & pl.col("_m").is_not_null()
    )
    d = d.with_columns(
        pl.when(hit).then(pl.col("_new")).otherwise(pl.col("target")).alias("target")
    ).drop("_new")
    assert d.height == n, "loss join changed the row count"
    return d.drop("_i", "_line", "_m")


def chartres_percent(d):
    """Chartres UPDT/PDT Target: fraction -> percent points (only when still fractions)."""
    cols = ["UPDT Target", "PDT Target"]
    top = d.filter(pl.col("SiteName") == "Chartres").select(
        [pl.col(c).max() for c in cols]
    ).row(0)
    if any(v is not None and v > 1 for v in top):
        raise SystemExit("Chartres targets above 1 found %s: already percent points?" % (top,))
    is_c = pl.col("SiteName") == "Chartres"
    return d.with_columns([
        pl.when(is_c).then((pl.col(c) * 100).round(6)).otherwise(pl.col(c)).alias(c)
        for c in cols
    ])


def write_parquet(d, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    d.write_parquet(path, compression="snappy")


def build_targets(parts, gdir, out, log):
    g = read_glidepath(gdir)
    sites = sorted(g["Site"].unique().to_list())
    log("glidepath: %d values, sites %s, months %s..%s"
        % (g.height, sites, g["Month"].min(), g["Month"].max()))
    stamp = datetime.datetime.now().replace(microsecond=0)

    # Site target tables: one file per site, fractions
    for table, (bucket, col) in SITE_TABLES.items():
        for site in SITES:
            files = lake_files(parts, table, site)
            if not files:
                continue
            old = read_file(files[0])
            if site in sites:
                new = (
                    g.filter((pl.col("Bucket") == bucket) & (pl.col("Site") == site))
                    .select(
                        pl.col("Site"),
                        pl.col("Line"),
                        pl.lit(bucket).alias("OEE Bucket"),
                        pl.col("Month").alias("Date"),
                        (pl.col("v") / 100).round(6).alias(col),
                        (pl.col("Line") + pl.lit(" ") + pl.col("Month").dt.strftime("%d/%m/%Y"))
                        .alias("Volume Key"),
                        pl.lit(stamp).cast(pl.Datetime("ms")).alias("loaded_at"),
                    )
                    .sort("Site", "Line", "Date")
                )
                log("%s site=%s: %d -> %d rows (replaced from the glidepath)"
                    % (table, site, old.height, new.height))
            else:
                new = old
                log("%s site=%s: %d rows kept (not in the glidepath files)"
                    % (table, site, old.height))
            write_parquet(new.select(old.columns), os.path.join(
                root(out), table, "site=" + site, table + ".parquet"))

    # Plan_OPT_EU and Daily_Losses_EU: same file names as the lake
    for table, fix in (("Plan_OPT_EU", fix_plan), ("Daily_Losses_EU", fix_loss)):
        changed = 0
        for f in lake_files(parts, table):
            site = os.path.basename(os.path.dirname(f))[5:]
            d = read_file(f)
            e = fix(d, g, sites)
            if table == "Plan_OPT_EU":
                e = chartres_percent(e) if site == "Chartres" else e
            same = e.equals(d)
            changed += 0 if same else 1
            write_parquet(e, os.path.join(
                root(out), table, "site=" + site, os.path.basename(f)))
        log("%s: files changed %d" % (table, changed))
    return g, sites


# --------------------------------------------------------------------- fact


def fact_columns(parts):
    """Column order: union of the three tables as the reference stacks them."""
    frames = []
    for rtype in MEASURES:
        table = TABLE_OF[rtype]
        schema = {}
        for f in lake_files(parts, table):
            for c, t in pl.read_parquet_schema(f).items():
                schema.setdefault(c, t)
        d = pl.DataFrame(schema=schema)
        if rtype == "Loss":
            d = d.rename(LOSS_RENAMES)
        frames.append(d.with_columns(pl.lit(rtype).alias("Record Type")))
    cols = pl.concat(frames, how="diagonal_relaxed").columns
    return FIRST + [c for c in cols if c not in FIRST] + ["In EU Report Source"] + RR_COLS


def read_shifts(path):
    d = pl.read_csv(path, infer_schema_length=0, encoding="utf8-lossy")
    d = d.rename({d.columns[0]: "ShiftName"})
    return d.select("ShiftName", pl.col("Shift").alias("_shift")).unique("ShiftName")


def run_rate_rows(parts, site, shifts):
    """Run Rate rows of one site: hourly Run_Rates_EU summed per shift start day, line,
    shift and part. Shared columns follow the Plan rows (b6-plan-rows.js)."""
    r = read_table(parts, "Run_Rates_EU", site)
    if r is None:
        return None
    r = r.filter(
        pl.col("MachineName").is_not_null() & (pl.col("MachineName") != "")
        & (pl.col("Good Parts") != 0))
    part = pl.col("PartName")
    for old, new in PART_FIX.get(site, []):
        part = part.str.replace_all(old, new, literal=True)
    # Shift start day: the latest day on or before the hour with the weekday that the
    # raw shift name starts with ("FriNight", "Friday Night Shift", "FriDay - Blue").
    wd = pl.col("ShiftName").str.slice(0, 3).str.to_lowercase().replace_strict(
        DAYS, list(range(1, 8)), default=None)
    back = ((pl.col("Hour").dt.weekday() - wd) % 7).fill_null(0)
    day = (pl.col("Hour").dt.date() - pl.duration(days=back)).alias("Date")
    if site in COLOUR_SITES:
        colour = pl.col("ShiftName").str.splitn("-", 2).struct.field("field_1").str.strip_chars()
        colour = pl.when(colour.is_null() | (colour == "")).then(pl.lit("Pink")).otherwise(colour)
    else:
        colour = pl.lit(None, pl.String)
    r = r.join(shifts, on="ShiftName", how="left").with_columns(
        day,
        part.alias("PartName"),
        pl.col("_shift").alias("_mapped"),
        colour.alias("Shift Colour"),
        (pl.col("MachineName") + "-" + pl.lit(site)).alias(KEY),
    )
    g = r.group_by("Date", KEY, "_mapped", "Shift Colour", "PartName", maintain_order=True).agg(
        pl.len().cast(pl.Int64).alias("RR Hours"),
        pl.col("Good Parts").sum().cast(pl.Int64).alias("RR Good Parts"),
        num("Capacity").sum().alias("RR Capacity"),
        pl.col("MachineName").first(),
        pl.col("AreaName").first(),
        pl.col("Dept").first(),
        pl.col("Area").first(),
        pl.col("Product Type").first(),
        pl.col("Data Source").first(),
        pl.col("In EU Report").any(),
        pl.col("loaded_at").max(),
    ).rename({"_mapped": "ShiftName"})
    fmt = read_table(parts, "Format_List_EU", site)
    if fmt is not None:
        fmt = fmt.select("Product Key", *FORMAT_COLS).unique("Product Key")
    g = g.with_columns(
        pl.lit(site).alias("SiteName"),
        (pl.col(KEY) + " " + pl.col("PartName")).alias("Product Key"),
        pl.lit("Run Rate").alias("Record Type"),
    )
    if fmt is not None:
        n = g.height
        g = g.join(fmt, on="Product Key", how="left")
        assert g.height == n, "format list join changed the row count"
    return g


def rr_unmapped(parts, shifts):
    """Raw shift names of Run_Rates_EU that the shift file does not map (hour rows)."""
    r = read_table(parts, "Run_Rates_EU")
    if r is None:
        return {}
    miss = r.join(shifts, on="ShiftName", how="anti").group_by("ShiftName").len()
    return dict(miss.iter_rows())


def read_dim(parts):
    d = pl.read_csv(os.path.join(root(parts), "Dim", "Machine_Names_EU.csv"),
                    infer_schema_length=0)
    d = d.select(
        pl.col(KEY).str.strip_chars().alias("_key"),
        pl.col("Dept").alias("_dept"),
        pl.col("Area").alias("_area"),
        pl.col("Product Type").alias("_ptype"),
        pl.lit(True).alias("_listed"),
    )
    dup = d.group_by("_key").len().filter(pl.col("len") > 1)
    if dup.height:
        raise SystemExit("line list has duplicate Unique Machine Name: %s" % dup["_key"].to_list())
    return d


def stack_site(out, parts, site, dim, cols, shifts):
    parts_list = []
    for rtype in MEASURES:
        base = parts if rtype == "Time Utilisation" else out
        d = read_table(base, TABLE_OF[rtype], site)
        if d is None:
            continue
        if rtype == "Loss":
            d = d.rename(LOSS_RENAMES)
        parts_list.append(d.with_columns(pl.lit(rtype).alias("Record Type")))
    rr = run_rate_rows(parts, site, shifts)
    if rr is not None:
        parts_list.append(rr)
    f = pl.concat(parts_list, how="diagonal_relaxed")
    n = f.height
    f = f.with_columns(pl.col(KEY).str.strip_chars().alias("_key")).join(dim, on="_key", how="left")
    assert f.height == n, "line list join changed the row count"
    f = f.with_columns(
        pl.col("In EU Report").alias("In EU Report Source"),
        pl.col("_listed").fill_null(False).alias("In EU Report"),
        pl.coalesce("_dept", "Dept").alias("Dept"),
        pl.coalesce("_area", "Area").alias("Area"),
        pl.coalesce("_ptype", "Product Type").alias("Product Type"),
    ).drop("_key", "_dept", "_area", "_ptype", "_listed")
    missing = [c for c in cols if c not in f.columns]
    extra = [c for c in f.columns if c not in cols]
    assert not extra, "unexpected columns %s" % extra
    f = f.with_columns([pl.lit(None).alias(c) for c in missing])
    # a file with no Run Rate rows (Chartres) would write all-null columns
    # of type Null, which Hyper cannot read: give them a real type
    f = f.with_columns(
        pl.col("RR Hours").cast(pl.Int64),
        pl.col("RR Good Parts").cast(pl.Int64),
        pl.col("RR Capacity").cast(pl.Float64),
    )
    return f.select(cols)


def build_fact(parts, out, shifts_path, log):
    dim = read_dim(parts)
    cols = fact_columns(parts)
    shifts = read_shifts(shifts_path)
    log("fact columns: %d" % len(cols))
    log("Run Rate hour rows with a raw shift name the shift file does not map: %s"
        % rr_unmapped(parts, shifts))
    total = 0
    for site in SITES:
        f = stack_site(out, parts, site, dim, cols, shifts)
        undated = f.filter(pl.col("Date").is_null()).height
        rr = f.filter(pl.col("Record Type") == "Run Rate").height
        log("site=%s: %d rows (Run Rate %d), rows without Date: %d"
            % (site, f.height, rr, undated))
        f = f.with_columns(pl.col("Date").dt.strftime("%Y-%m").alias("_ym"))
        for (ym,), part in f.group_by("_ym", maintain_order=True):
            if ym is None:
                ym = "undated"
            name = "EU_OEE_Fact_%s.parquet" % ym
            write_parquet(part.drop("_ym"), os.path.join(
                root(out), "EU_OEE_Fact", "site=" + site, name))
            total += part.height
    log("fact rows written: %d" % total)


def cmd_build(a):
    lines = []

    def log(s):
        print(s)
        lines.append(s)

    build_targets(a.parts, a.glidepath, a.out, log)
    build_fact(a.parts, a.out, a.shifts or os.path.join(a.parts, SHIFTS), log)
    with open(os.path.join(a.out, "build.log"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


# -------------------------------------------------------------------- check


def read_fact(out):
    files = sorted(glob.glob(os.path.join(root(out), "EU_OEE_Fact", "site=*", "*.parquet")))
    return pl.concat([pl.read_parquet(f) for f in files], how="diagonal_relaxed"), files


def cmd_check(a):
    ok = True
    fact, files = read_fact(a.out)
    print("fact files %d, rows %d, columns %d" % (len(files), fact.height, fact.width))
    print("1. stacking parity (rows and sums, fact vs corrected tables / time util source):")
    for rtype, ms in MEASURES.items():
        base = a.parts if rtype == "Time Utilisation" else a.out
        src = read_table(base, TABLE_OF[rtype])
        orig = read_table(a.parts, TABLE_OF[rtype])
        part = fact.filter(pl.col("Record Type") == rtype)
        same = src.height == part.height == orig.height
        line = ["rows %d = %d (lake %d)" % (src.height, part.height, orig.height)]
        for m in ms:
            x, y, z = (d.select(num(m).sum()).item() for d in (src, part, orig))
            same &= abs(x - y) < 1e-6 * max(1.0, abs(x)) and abs(x - z) < 1e-6 * max(1.0, abs(x))
            line.append("%s %.2f = %.2f (lake %.2f)" % (m, x, y, z))
        ok &= same
        print("   %s %-16s %s" % ("ok  " if same else "FAIL", rtype, " | ".join(line)))
    print("2. KPIs 2026-09-01..30, In EU Report = true:")
    f = fact.filter(
        pl.col("In EU Report")
        & (pl.col("Date") >= pl.date(2026, 9, 1))
        & (pl.col("Date") <= pl.date(2026, 9, 30))
    )
    for site in ("Hull", "Nottingham"):
        x = f.filter(pl.col("SiteName") == site)
        cap = x.select(num("Capacity").sum()).item()
        good = x.select(num("Good Parts").sum()).item()
        loss = x.filter(pl.col("Record Type") == "Loss")
        un = loss.filter(pl.col("OEELossLvl3Group").is_in(["Unplanned Loss", "Not Logged"]))
        pl_ = loss.filter(pl.col("OEELossLvl3Group") == "Planned Loss")
        u = un.select(num("Loss Units").sum()).item()
        p = pl_.select(num("Loss Units").sum()).item()
        print("   %s: OEE %.2f unplanned %.2f planned %.2f volume %.2fM"
              % (site, good / cap * 100, u / cap * 100, p / cap * 100, good / 1e6))
    print("3. targets equal the glidepath:")
    g = read_glidepath(a.glidepath)
    ok &= check_targets(a, g)
    print("4. Run Rate rows:")
    ok &= check_run_rates(fact)
    sys.exit(0 if ok else 1)


def check_run_rates(fact):
    ok = True
    rr = fact.filter(pl.col("Record Type") == "Run Rate")
    other = fact.filter(pl.col("Record Type") != "Run Rate")
    bad = other.filter(pl.any_horizontal([pl.col(c).is_not_null() for c in RR_COLS])).height
    bad += rr.filter(pl.col("Good Parts").is_not_null() | pl.col("Capacity").is_not_null()).height
    ok &= bad == 0
    print("   %s RR columns only on Run Rate rows, Good Parts / Capacity empty there: "
          "%d bad rows" % ("ok  " if bad == 0 else "FAIL", bad))
    print("   rows per site: %s" % dict(rr.group_by("SiteName").len().sort("SiteName").iter_rows()))
    # distinct EU lines per site must not grow by the stack
    eu = fact.filter(pl.col("In EU Report"))
    before = dict(eu.filter(pl.col("Record Type") != "Run Rate")
                  .group_by("SiteName").agg(pl.col(KEY).n_unique()).iter_rows())
    after = dict(eu.group_by("SiteName").agg(pl.col(KEY).n_unique()).iter_rows())
    same = before == after
    ok &= same
    print("   %s distinct EU lines per site: without Run Rate %s, with %s"
          % ("ok  " if same else "FAIL", dict(sorted(before.items())), dict(sorted(after.items()))))
    # RR Good Parts = Plan Good Parts per site, line, day, shift
    keys = ["SiteName", KEY, "Date", "ShiftName"]
    plan = fact.filter(pl.col("Record Type") == "Plan").group_by(keys).agg(
        num("Good Parts").sum().alias("p"))
    rsum = rr.group_by(keys).agg(pl.col("RR Good Parts").sum().alias("r"))
    j = rsum.join(plan, on=keys, how="inner").with_columns(
        ((pl.col("r") - pl.col("p")).abs() < 0.5).alias("eq"))
    for site, n, share in j.group_by("SiteName").agg(pl.len(), pl.col("eq").mean()) \
            .sort("SiteName").iter_rows():
        good = share >= 0.99
        ok &= good
        print("   %s %s RR Good Parts = Plan Good Parts: %.2f %% of %d shift-days in both"
              % ("ok  " if good else "FAIL", site, share * 100, n))
    ex = rr.filter((pl.col(KEY) == "GT4-Hull") & (pl.col("Date") == pl.date(2026, 9, 15))
                   & (pl.col("ShiftName") == "Blue") & (pl.col("PartName") == "Dada/Straw 24's"))
    got = ex.select(RR_COLS).rows()
    good = got == [(10, 47070, 90240.0)]
    ok &= good
    print("   %s example GT4-Hull 2026-09-15 Blue Dada/Straw 24's: %s (want 10 / 47070 / 90240)"
          % ("ok  " if good else "FAIL", got))
    # Power BI Hull, By Shift, GT4, 2026-01-01..2026-09-08
    want = {"Blue": (5603, 61), "Gold": (5831, 66), "Green": (5285, 66), "Pink": (5405, 63)}
    x = rr.filter((pl.col(KEY) == "GT4-Hull") & pl.col("Date").is_between(
        pl.date(2026, 1, 1), pl.date(2026, 9, 8))).group_by("Shift Colour").agg(
        pl.col("RR Good Parts").sum().alias("g"), pl.col("RR Hours").sum().alias("h"),
        pl.col("RR Capacity").sum().alias("c"))
    for colour, g, h, c in x.sort("Shift Colour").iter_rows():
        got = (round(g / h), round(g / c * 100))
        tag = "    " if colour not in want else ("ok  " if got == want[colour] else "DIFF")
        print("   %s Power BI GT4 %s: AVG Hr Rate %d, %% Max Rate %d %% (Power BI %s)"
              % (tag, colour, got[0], got[1], want.get(colour, "-")))
    return ok


def check_targets(a, g):
    ok = True
    sites = sorted(g["Site"].unique().to_list())
    # Site tables
    for table, (bucket, col) in SITE_TABLES.items():
        t = read_table(a.out, table)
        t = t.filter(pl.col("Site").is_in(sites))
        want = g.filter(pl.col("Bucket") == bucket).select(
            "Site", "Line", pl.col("Month").alias("Date"), (pl.col("v") / 100).round(6).alias("w"))
        j = want.join(t, on=["Site", "Line", "Date"], how="full", coalesce=True)
        bad = j.filter(
            pl.col("w").is_null() | pl.col(col).is_null()
            | ((pl.col("w") - pl.col(col)).abs() > 1e-9))
        ok &= bad.height == 0
        print("   %s %s: %d glidepath values, %d table rows, mismatches %d"
              % ("ok  " if bad.height == 0 else "FAIL", table, want.height, t.height, bad.height))
    # Plan rows (percent points): every row of a glidepath site
    p = read_table(a.out, "Plan_OPT_EU").filter(pl.col("SiteName").is_in(sites))
    p = p.with_columns(pl.col("MachineName").str.strip_chars().alias("Line"),
                       key_month("Targets Key").alias("Month"))
    for col, bucket in PLAN_COLS.items():
        w = g.filter(pl.col("Bucket") == bucket).select(
            pl.col("Site").alias("SiteName"), "Line", "Month", pl.col("v").alias("w"))
        j = p.join(w, on=["SiteName", "Line", "Month"], how="left")
        # rows with a glidepath value: equal; rows without: empty
        bad = j.filter(
            (pl.col("w").is_not_null() & (((pl.col(col) - pl.col("w")).abs() > 1e-9)
                                          | pl.col(col).is_null()))
            | (pl.col("w").is_null() & pl.col(col).is_not_null()))
        ok &= bad.height == 0
        print("   %s Plan_OPT_EU.%s: %d rows, with value %d, mismatches %d"
              % ("ok  " if bad.height == 0 else "FAIL", col, j.height,
                 j.filter(pl.col("w").is_not_null()).height, bad.height))
    # Daily losses (fraction): categories that have a bucket
    cats = sorted(set(g["Bucket"]) - set(PLAN_COLS.values()))
    d = read_table(a.out, "Daily_Losses_EU").filter(
        pl.col("SiteName").is_in(sites) & pl.col("OEELossLvl3SubGroup").is_in(cats)
        & key_month("Loss Target Key").is_not_null())
    d = d.with_columns(pl.col("MachineName").str.strip_chars().alias("Line"),
                       key_month("Loss Target Key").alias("Month"))
    w = g.filter(pl.col("Bucket").is_in(cats)).select(
        pl.col("Site").alias("SiteName"), "Line",
        pl.col("Bucket").alias("OEELossLvl3SubGroup"), "Month",
        (pl.col("v") / 100).round(6).alias("w"))
    j = d.join(w, on=["SiteName", "Line", "OEELossLvl3SubGroup", "Month"], how="left")
    bad = j.filter(
        (pl.col("w").is_not_null() & (((pl.col("target") - pl.col("w")).abs() > 1e-9)
                                      | pl.col("target").is_null()))
        | (pl.col("w").is_null() & pl.col("target").is_not_null()))
    ok &= bad.height == 0
    print("   %s Daily_Losses_EU.target: %d rows in categories with a bucket, with value %d, "
          "mismatches %d" % ("ok  " if bad.height == 0 else "FAIL", j.height,
                             j.filter(pl.col("w").is_not_null()).height, bad.height))
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["build", "check"])
    ap.add_argument("--parts", default=PARTS)
    ap.add_argument("--glidepath", default=GLIDE_DIR)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--reference", default=REFERENCE)
    ap.add_argument("--shifts", help="shift patterns CSV (default <parts>/" + SHIFTS + ")")
    a = ap.parse_args()
    if a.cmd == "build":
        cmd_build(a)
    else:
        cmd_check(a)


if __name__ == "__main__":
    main()
