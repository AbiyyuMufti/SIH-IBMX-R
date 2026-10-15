"""Normalizes the raw Provideam exports of sharepoint/source_original into
sharepoint/source/<type>/site=<Site>/<type>_<YYYY-MM>.csv  (one file per month).

Types: plan_opt, line_losses, volume_loss_correction (run_rates is not used).
Re-runnable: it rebuilds every month from the raw files; a month file is only
written when its content changed, so the files to upload are the ones that
changed (see the list printed at the end).

Rules
- Read raw files: UTF-16 or UTF-8, tab separated, any line end, no quote character.
- Drop: the `Total:` row, the trailing empty column, files with no header
  ("No data found"), rows whose business date cannot be read.
- Line losses: a comment that contains a tab makes extra fields; they are joined
  back into the Comment.
- Dates: ISO. Date columns `YYYY-MM-DD` / `ShiftStartDate` become YYYY-MM-DD,
  timestamps (`ShiftStartTime`, `StartTime`) become YYYY-MM-DD HH:MM:SS.
- Numbers: thousands commas removed (Good Parts, Defect Parts, Target, Capacity,
  Downtime Units, Loss Units). OEE (text with %) and the HH:MM:SS columns
  (hours can pass 24) are kept as text.
- Weinheim `PartName` and Hull / Nottingham `PartDesc` both become `PartName`.
- A column `SiteName` is added first.
- A business day found in several raw files is taken from ONE file: the one
  with the most rows for that day, tie: the later file name (daily files carry the publish date). Differences are listed.
- Output: UTF-8 without BOM, comma, LF.

Checks printed at the end: raw rows = kept + duplicates + invalid; the `Total:`
row of each raw file against the parsed sum; the written files read back.

Usage: python -I scripts/normalize-sharepoint-source.py [--dry-run]
"""
import csv
import glob
import os
import re
import sys
from collections import defaultdict
from datetime import datetime

RAW = "sharepoint/source_original"
OUT = "sharepoint/source"
REPORT = "sharepoint/normalize-report.txt"
DRY = "--dry-run" in sys.argv

# type -> (business date column, timestamp columns, numeric columns)
TYPES = {
    "plan_opt": (
        "YYYY-MM-DD",
        ["ShiftStartTime"],
        ["Good Parts", "Defect Parts", "Target", "Capacity", "Downtime Units"],
    ),
    "line_losses": ("ShiftStartDate", ["StartTime"], []),
    "volume_loss_correction": ("ShiftStartDate", [], ["Loss Units"]),
}
# the sum compared with the Total: row of the raw file
TOTAL_CHECK = {"plan_opt": "Good Parts", "volume_loss_correction": "Loss Units"}
RENAME = {"PartDesc": "PartName"}

report = []


def say(text=""):
    print(text)
    report.append(text)


def read_lines(path):
    raw = open(path, "rb").read()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16", errors="replace")
    else:
        text = raw.decode("utf-8-sig", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def parse_dt(value):
    """ISO date or dd/mm/yyyy (with optional HH:MM[:SS]) -> datetime or None."""
    v = value.strip().strip('"')
    for fmt in (
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
    ):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            pass
    return None


def to_number(value):
    v = value.strip().strip('"')
    if v == "":
        return ""
    cleaned = v.replace(",", "")
    try:
        float(cleaned)
    except ValueError:
        return None
    return cleaned


def read_raw_file(path, kind):
    """Returns (header without trailing empty column, rows, total row or None)."""
    lines = read_lines(path)
    header = lines[0].split("\t")
    if len(header) < 3 or (kind and kind[0] not in header):
        return None, [], None
    while header and header[-1] == "":
        header.pop()
    n = len(header)
    comment_at = header.index("Comment") if "Comment" in header else None
    rows, total = [], None
    for line in lines[1:]:
        if not line.strip():
            continue
        cells = line.split("\t")
        while len(cells) > n and cells[-1] == "":
            cells.pop()
        if len(cells) > n and comment_at is not None:
            cells = cells[:comment_at] + [" ".join(cells[comment_at:])]
        if len(cells) < n:
            cells += [""] * (n - len(cells))
        if cells[0].strip().startswith("Total"):
            total = dict(zip(header, cells))
            continue
        rows.append(cells[:n])
    return header, rows, total


def normalize_row(site, header, cells, date_col, ts_cols, num_cols):
    """Returns (output row as list, day ISO string) or (None, reason)."""
    rec = dict(zip(header, cells))
    day = parse_dt(rec[date_col])
    if day is None:
        return None, "bad date"
    out = {}
    for h in header:
        v = rec[h].strip().strip('"')
        if h == date_col:
            v = day.strftime("%Y-%m-%d")
        elif h in ts_cols:
            t = parse_dt(v)
            v = t.strftime("%Y-%m-%d %H:%M:%S") if t else v
        elif h in num_cols:
            num = to_number(v)
            if num is None:
                return None, "bad number " + h
            v = num
        out[RENAME.get(h, h)] = v
    names = [RENAME.get(h, h) for h in header]
    return [site] + [out[x] for x in names], day.strftime("%Y-%m-%d")


def main():
    changed = []
    problems = 0
    for t, (date_col, ts_cols, num_cols) in TYPES.items():
        for site_dir in sorted(glob.glob(f"{RAW}/{t}/site=*")):
            site = site_dir.split("site=")[1]
            # day -> list of (file, mtime, rows)
            per_day = defaultdict(list)
            raw_rows = invalid = 0
            small_gaps = []
            names = None
            say(f"\n== {t} / {site}")
            for f in sorted(glob.glob(site_dir + "/*")):
                header, rows, total = read_raw_file(f, [date_col])
                base = os.path.basename(f)
                if header is None:
                    say(f"  skipped (no header): {base}")
                    continue
                if names is None:
                    names = ["SiteName"] + [RENAME.get(h, h) for h in header]
                elif names != ["SiteName"] + [RENAME.get(h, h) for h in header]:
                    say(f"  COLUMNS DIFFER in {base}")
                    problems += 1
                mtime = os.path.getmtime(f)
                by_day = defaultdict(list)
                sums = 0.0
                for cells in rows:
                    raw_rows += 1
                    out, day = normalize_row(site, header, cells, date_col, ts_cols, num_cols)
                    if out is None:
                        invalid += 1
                        continue
                    by_day[day].append(out)
                    col = TOTAL_CHECK.get(t)
                    if col:
                        sums += float(out[names.index(col)] or 0)
                for day, rs in by_day.items():
                    per_day[day].append((base, mtime, rs))
                col = TOTAL_CHECK.get(t)
                if col and total is not None:
                    want = to_number(total.get(col, ""))
                    gap = abs(float(want) - sums) if want not in (None, "") else 0
                    if gap > 1 and gap > 1e-5 * abs(sums):
                        say(f"  TOTAL MISMATCH {base}: row says {want}, rows add up to {sums:.2f}")
                        problems += 1
                    elif gap > 0.01:
                        small_gaps.append(gap / max(abs(sums), 1))
            kept = {}
            dup_rows = 0
            for day, options in per_day.items():
                options.sort(key=lambda o: (len(o[2]), o[0]), reverse=True)
                kept[day] = options[0][2]
                for o in options[1:]:
                    dup_rows += len(o[2])
                if len(options) > 1:
                    first = [tuple(r) for r in options[0][2]]
                    same = all([tuple(r) for r in o[2]] == first for o in options[1:])
                    say(
                        f"  day {day} in {len(options)} files, kept {options[0][0]} "
                        f"({len(options[0][2])} rows), "
                        f"{'identical' if same else 'DIFFERENT'}: "
                        + ", ".join(f"{o[0]} ({len(o[2])})" for o in options)
                    )
            months = defaultdict(list)
            for day in sorted(kept):
                months[day[:7]].extend(kept[day])
            kept_rows = sum(len(v) for v in months.values())
            say(
                f"  raw rows {raw_rows} = kept {kept_rows} + duplicates {dup_rows} "
                f"+ invalid {invalid}: "
                f"{'OK' if raw_rows == kept_rows + dup_rows + invalid else 'MISMATCH'}"
            )
            if raw_rows != kept_rows + dup_rows + invalid:
                problems += 1
            if small_gaps:
                say(
                    f"  Total: rows differ slightly from the parsed sum in {len(small_gaps)} "
                    f"file(s), largest {max(small_gaps):.2e} of the sum (rounding in Provideam)"
                )
            say(f"  months written: {len(months)}, {min(months)} to {max(months)}")
            for month, rows in sorted(months.items()):
                path = f"{OUT}/{t}/site={site}/{t}_{month}.csv"
                text_rows = [names] + rows
                import io

                buf = io.StringIO()
                csv.writer(buf, lineterminator="\n").writerows(text_rows)
                data = buf.getvalue().encode("utf-8")
                old = open(path, "rb").read() if os.path.exists(path) else None
                if old == data:
                    continue
                changed.append(path)
                if DRY:
                    continue
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, "wb").write(data)
                back = list(csv.reader(io.StringIO(open(path, encoding="utf-8").read())))
                if len(back) != len(text_rows):
                    say(f"  READ-BACK MISMATCH {path}")
                    problems += 1
    say(f"\nfiles written or changed: {len(changed)}{' (dry run, nothing written)' if DRY else ''}")
    say(f"problems: {problems}")
    if not DRY:
        open(REPORT, "w", encoding="utf-8").write("\n".join(report) + "\n")
        open("sharepoint/normalize-changed.txt", "w", encoding="utf-8").write(
            "\n".join(p[len(OUT) + 1:] for p in changed) + "\n"
        )
    return 1 if problems else 0


sys.exit(main())
