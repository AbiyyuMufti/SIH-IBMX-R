"""Read-only. Analyses the SharePoint files in downloads/sharepoint (git-ignored)
against the Insights Hub tables in parquet/ and writes diagrams/data/sharepoint-findings.json
for the diagram builder (scripts/build-drawio.js).

Usage (from the repo root): python scripts/helper-analyze-sharepoint.py
"""
import glob
import io
import json
import os

import polars as pl

ROOT = "sharepoint"
OUT = "diagrams/data/sharepoint-findings.json"


def read_text(path):
    raw = open(path, "rb").read()
    enc = "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
    return raw.decode(enc).replace("\r\n", "\n").replace("\r", "\n")


def load(path):
    text = read_text(path)
    head = text[:800]
    sep = "\t" if head.count("\t") > head.count(",") else ","
    return pl.read_csv(
        io.StringIO(text),
        separator=sep,
        infer_schema_length=0,
        truncate_ragged_lines=True,
        quote_char=None if sep == "\t" else '"',
        ignore_errors=True,
    )


def concat(pattern):
    frames = [load(p) for p in sorted(glob.glob(f"{ROOT}/{pattern}"))]
    return pl.concat(frames, how="diagonal_relaxed")


def num(c):
    return pl.col(c).str.replace_all(",", "").cast(pl.Float64, strict=False)


def mins(c):
    p = pl.col(c).str.split(":")
    return (
        p.list.get(0).cast(pl.Float64, strict=False) * 60
        + p.list.get(1).cast(pl.Float64, strict=False)
        + p.list.get(2).cast(pl.Float64, strict=False) / 60
    )


F = {}
ours_plan = pl.read_parquet("parquet/pbi_plan_opt.parquet")
ours_loss = pl.read_parquet("parquet/pbi_daily_losses.parquet")
hull_plan = concat("source/plan_opt/site=Hull/*.csv").filter(pl.col("YYYY-MM-DD").str.contains(r"^\d{4}-"))

# ---- Glidepaths ----
g = concat("reference/glidepaths/*/*.csv")
months = [c for c in g.columns if c not in ("Site Name", "Line", "OEE Bucket")]


def filled(year):
    cs = [c for c in months if c.endswith(year)]
    return sum(g[c].drop_nulls().len() for c in cs) / (g.height * len(cs))


h = g.filter(pl.col("Site Name") == "Hull")
plines = set(hull_plan["MachineName"].unique().to_list())
b2 = h.filter(pl.col("Line") == "B2 Auto").select("OEE Bucket", "01/09/2026").rows()
F["glidepath"] = {
    "files": g.group_by("Site Name").len().sort("Site Name").rows(),
    "month_columns": len(months),
    "first_month": months[0],
    "last_month": months[-1],
    "filled_2025": round(filled("2025"), 2),
    "filled_2026": round(filled("2026"), 2),
    "filled_2027": round(filled("2027"), 2),
    "hull_rows": h.height,
    "hull_lines": sorted(h["Line"].unique().to_list()),
    "hull_buckets": sorted(h["OEE Bucket"].unique().to_list()),
    "hull_lines_not_in_plan_opt": sorted(set(h["Line"].to_list()) - plines),
    "hull_plan_opt_machines": len(plines),
    "b2_auto_sep_2026": b2,
}

# ---- Format list ----
f = concat("reference/format_list/*/*.csv")
fh = f.filter(pl.col("Site Name") == "Hull")
pairs = hull_plan.select("MachineName", "PartName").unique()
known = set(zip(fh["MachineName"].to_list(), fh["Product Name"].to_list()))
hit = sum(1 for m, n in zip(pairs["MachineName"].to_list(), pairs["PartName"].to_list()) if (m, n) in known)
sih = {}
for sih_machine, hull_machine in (("B2 Line", "B2 Auto"), ("GT4", "GT4")):
    names = set(ours_plan.filter(pl.col("machine_name") == sih_machine)["part_name"].drop_nulls().to_list())
    fnames = set(fh.filter(pl.col("MachineName") == hull_machine)["Product Name"].to_list())
    pnames = set(hull_plan.filter(pl.col("MachineName") == hull_machine)["PartName"].to_list())
    sih[sih_machine] = {
        "sih_part_names": len(names),
        "in_format_list": len(names & fnames),
        "provideam_part_names": len(pnames),
        "sih_example": sorted(names)[:2],
        "format_example": sorted(fnames)[:2],
    }
F["formats"] = {
    "rows_all_sites": f.height,
    "hull_rows": fh.height,
    "hull_machines": fh["MachineName"].n_unique(),
    "hull_products": fh["Product Name"].n_unique(),
    "provideam_pairs": len(pairs),
    "provideam_pairs_found": hit,
    "sih": sih,
    "columns": [c for c in f.columns],
    "example": fh.head(1).to_dicts()[0],
}

gt = fh.filter((pl.col("MachineName") == "GT4") & (pl.col("Product Name") == "250 mg tablets - Pep 24's"))
F["formats"]["gt4_row"] = gt.head(1).to_dicts()[0] if gt.height else None
b2r = fh.filter(pl.col("MachineName") == "B2 Auto")
F["formats"]["b2_row"] = b2r.head(1).to_dicts()[0] if b2r.height else None
F["formats"]["b2_provideam_names"] = sorted(set(hull_plan.filter(pl.col("MachineName") == "B2 Auto")["PartName"].to_list()))

# ---- Shift coding ----
s = load(f"{ROOT}/reference/shift_naming/site=All/Shift Patterns Provideam EU.csv")
raw_hull = set(hull_plan["ShiftName"].unique().to_list())
values = sorted(s["Shift"].unique().to_list())
sih_shifts = sorted(ours_plan["shift_name"].drop_nulls().unique().to_list())
examples = []
for v in values:
    row = s.filter(pl.col("Shift") == v).head(1).to_dicts()[0]
    examples.append([row["ShiftName"], row["Shift"]])
F["shift"] = {
    "rows": s.height,
    "values": values,
    "hull_raw_names": len(raw_hull),
    "hull_raw_in_coding": len(raw_hull & set(s["ShiftName"].to_list())),
    "sih_names": sih_shifts,
    "sih_in_values": [x for x in sih_shifts if x in values],
    "sih_not_in_values": [x for x in sih_shifts if x not in values],
    "examples": examples,
}

# ---- Equipment coding ----
eq = {}
for site, ecp, llp in (
    ("Nottingham", "reference/equipment_coding/site=Nottingham/*.csv", "source/line_losses/site=Nottingham/*.csv"),
    ("Weinheim", "reference/equipment_coding/site=Weinheim/*.csv", "source/line_losses/site=Weinheim/*.csv"),
):
    ec = concat(ecp)
    ll = concat(llp)
    key = set(zip(ec["MachineName"].to_list(), ec["OEELossLvl3Desc"].to_list()))
    un = ll.filter(pl.col("OEELossLvl3Group").str.to_lowercase().str.contains("unplanned"))
    got = sum(1 for m, d in zip(un["MachineName"].to_list(), un["OEELossLvl3Desc"].to_list()) if (m, d) in key)
    eq[site] = {
        "rows": ec.height,
        "machines": ec["MachineName"].n_unique(),
        "equipment_values": ec["Equipment"].n_unique(),
        "stop_rows": un.height,
        "stop_rows_covered": got,
        "example": ec.head(1).to_dicts()[0],
    }
F["equipment"] = eq

# ---- Loss names ----
names = {}
for site, key, llp in (("Nottingham", "Nottingham", "source/line_losses/site=Nottingham/*.csv"), ("Weinheim", "Weinheim", "source/line_losses/site=Weinheim/*.csv")):
    ll = concat(llp)
    buckets = set(g.filter(pl.col("Site Name") == key)["OEE Bucket"].to_list())
    same = ll.filter(pl.col("OEELossLvl3SubGroup").is_in(list(buckets))).height
    names[site] = {
        "stop_rows": ll.height,
        "rows_subgroup_equals_bucket": same,
        "groups": ll.group_by("OEELossLvl3Group").len().sort("len", descending=True).rows(),
        "has_comment": ll.filter(pl.col("Comment").is_not_null()).height,
    }
hull_buckets = set(h["OEE Bucket"].to_list())
sih_sub = ours_loss.group_by("loss_lvl3_sub_group").len().sort("len", descending=True).rows()
F["loss_names"] = {
    "provideam": names,
    "sih_sub_groups": sih_sub,
    "sih_stops": ours_loss.height,
    "sih_stops_subgroup_equals_hull_bucket": sum(n for k, n in sih_sub if k in hull_buckets),
}

# ---- Loss units rule ----
vc = concat("source/volume_loss_correction/site=Nottingham/*.csv").filter(pl.col("ShiftStartDate").str.contains(r"^\d{2}/\d{2}/\d{4}"))
vc = vc.with_columns(m=mins("Time"), u=num("Loss Units")).with_columns(per_min=pl.col("u") / pl.col("m")).filter(pl.col("m") > 5)
po = concat("source/plan_opt/site=Nottingham/*.csv").filter(pl.col("YYYY-MM-DD").str.contains(r"^\d{4}-"))
po = po.with_columns(cap=num("Capacity"), opt=mins("Planned OpT")).filter(pl.col("opt") > 0)
day = po.group_by("MachineName", "YYYY-MM-DD").agg(cap=pl.col("cap").sum(), opt=pl.col("opt").sum(), prods=pl.col("PartName").n_unique()).filter(pl.col("prods") == 1)
day = day.with_columns(
    cap_min=pl.col("cap") / pl.col("opt"),
    d=pl.col("YYYY-MM-DD").str.slice(8, 2) + "/" + pl.col("YYYY-MM-DD").str.slice(5, 2) + "/" + pl.col("YYYY-MM-DD").str.slice(0, 4),
)
vd = vc.with_columns(d=pl.col("ShiftStartDate").str.slice(0, 10)).group_by("MachineName", "d").agg(lu_min=pl.col("per_min").median())
j = vd.join(day, on=["MachineName", "d"]).with_columns(ratio=pl.col("lu_min") / pl.col("cap_min"))
F["loss_units"] = {
    "machine_days": j.height,
    "within_3_percent": j.filter((pl.col("ratio") - 1).abs() < 0.03).height,
    "median_ratio": round(j["ratio"].median(), 3),
    "example": vc.head(1).to_dicts()[0],
}

# ---- Volume total (capacity per machine and day) example ----
F["volume_total"] = {"rule": "sum of Capacity per machine and day in the Plan OPT files"}

# ---- Machine names (xlsx counts are read by the builder) ----
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(F, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print("written", OUT)
for k, v in F.items():
    print(k, json.dumps(v, ensure_ascii=False)[:230])
