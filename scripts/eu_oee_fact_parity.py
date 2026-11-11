#!/usr/bin/env python3
"""Compare the built EU_OEE_Fact (parquet) with the reference CSV of bi-builder, row by row.

    python scripts/eu_oee_fact_parity.py [--out DIR] [--reference CSV]

Every cell is turned into the text the reference CSV uses, a row becomes one string, and the
two row sets are compared per Record Type (rows only in one side are counted and sampled by
column). Also prints per site and Record Type rows, and In EU Report per line.
"""
import argparse
import os
import sys

import polars as pl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eu_oee_fact_build as b  # noqa: E402


def as_text(d):
    cols = []
    for c, t in d.schema.items():
        if t == pl.Date:
            e = pl.col(c).dt.strftime("%Y-%m-%d")
        elif isinstance(t, pl.Datetime):
            e = pl.col(c).dt.strftime("%Y-%m-%d %H:%M:%S")
        elif t == pl.Boolean:
            e = pl.when(pl.col(c)).then(pl.lit("true")).otherwise(pl.lit("false"))
            e = pl.when(pl.col(c).is_null()).then(None).otherwise(e)
        else:
            e = pl.col(c).cast(pl.String)
        cols.append(e.alias(c))
    return d.select(cols)


TARGETS = ["OEE Target", "UPDT Target", "PDT Target", "Loss Target"]


def norm_targets(d, chartres_to_percent):
    """Targets compared as numbers (the reference keeps the glidepath text, '31' vs '31.0').

    The reference still has Chartres UPDT/PDT as fractions: for the comparison they are put
    in percent points (the one intended difference), the rest is compared as it is.
    """
    cols = []
    for c in TARGETS:
        e = pl.col(c).cast(pl.Float64, strict=False)
        if chartres_to_percent and c in ("UPDT Target", "PDT Target"):
            is_c = (pl.col("SiteName") == "Chartres") & (pl.col("Record Type") == "Plan")
            e = pl.when(is_c).then(e * 100).otherwise(e)
        cols.append(e.round(6).cast(pl.String).alias(c))
    return d.with_columns(cols)


def row_key(d):
    return d.select(pl.concat_str([pl.col(c).fill_null("") for c in d.columns],
                                  separator="\x1f").alias("k"))["k"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=b.OUT)
    ap.add_argument("--reference", default=b.REFERENCE)
    a = ap.parse_args()
    mine, _ = b.read_fact(a.out)
    ref = pl.read_csv(a.reference, infer_schema_length=0)
    print("columns mine %d, reference %d, same names and order: %s"
          % (mine.width, ref.width, mine.columns == ref.columns))
    print("only in mine: %s | only in reference: %s" % (
        [c for c in mine.columns if c not in ref.columns],
        [c for c in ref.columns if c not in mine.columns]))
    mt = norm_targets(as_text(mine).select(ref.columns), False)
    ref = norm_targets(ref, True)
    print("\nrows per Record Type and site (mine / reference):")
    x = mt.group_by("Record Type", "SiteName").len().rename({"len": "mine"})
    y = ref.group_by("Record Type", "SiteName").len().rename({"len": "ref"})
    j = x.join(y, on=["Record Type", "SiteName"], how="full", coalesce=True).sort(
        "Record Type", "SiteName")
    for r in j.iter_rows():
        print("  %-17s %-11s %8s %8s %s" % (r[0], r[1], r[2], r[3], "" if r[2] == r[3] else "DIFF"))
    print("\nIn EU Report per Record Type and line (lines whose count differs):")
    kx = mt.group_by("Record Type", b.KEY, "In EU Report").len().rename({"len": "mine"})
    ky = ref.group_by("Record Type", b.KEY, "In EU Report").len().rename({"len": "ref"})
    kj = kx.join(ky, on=["Record Type", b.KEY, "In EU Report"], how="full", coalesce=True)
    bad = kj.filter(pl.col("mine").fill_null(0) != pl.col("ref").fill_null(0))
    print("  lines differing: %d of %d" % (bad.height, kj.height))
    print("\nwhole-row comparison per Record Type:")
    for rtype in b.MEASURES:
        m = mt.filter(pl.col("Record Type") == rtype)
        r = ref.filter(pl.col("Record Type") == rtype)
        km = row_key(m).value_counts().rename({"k": "k", "count": "m"})
        kr = row_key(r).value_counts().rename({"k": "k", "count": "r"})
        jj = km.join(kr, on="k", how="full", coalesce=True).with_columns(
            pl.col("m").fill_null(0), pl.col("r").fill_null(0))
        only_m = int(jj.filter(pl.col("m") > pl.col("r")).select(
            (pl.col("m") - pl.col("r")).sum()).item() or 0)
        only_r = int(jj.filter(pl.col("r") > pl.col("m")).select(
            (pl.col("r") - pl.col("m")).sum()).item() or 0)
        print("  %-17s rows mine %d ref %d | identical rows %d | only mine %d | only ref %d"
              % (rtype, m.height, r.height, m.height - only_m, only_m, only_r))
        if only_m or only_r:
            # which columns differ: compare per column the multiset of values
            for c in ref.columns:
                cm = m[c].fill_null("").value_counts().rename({c: "v", "count": "m"})
                cr = r[c].fill_null("").value_counts().rename({c: "v", "count": "r"})
                d = cm.join(cr, on="v", how="full", coalesce=True).with_columns(
                    pl.col("m").fill_null(0), pl.col("r").fill_null(0))
                n = int(d.select((pl.col("m") - pl.col("r")).abs().sum()).item() or 0) // 2
                if n:
                    print("      column %-24s %8d values differ (mismatch of value counts)" % (c, n))


if __name__ == "__main__":
    main()
