"""Read-only. Profiles the parquet files downloaded from the data lake.

For each file in the folder (default `parquet/`): row count, and per column
the type, the share of rows that are filled, the number of distinct values
and up to three example values. Writes one JSON file for the diagram builder.

Usage (from the repo root):
    python -I scripts/helper-profile-parquet.py [folder] [output.json]
"""
import json
import sys
from pathlib import Path

import polars as pl

folder = Path(sys.argv[1] if len(sys.argv) > 1 else "parquet")
output = Path(sys.argv[2] if len(sys.argv) > 2 else "diagrams/data/ours-profile.json")

# Example values longer than this are cut, so the diagram boxes stay small.
MAX_EXAMPLE_LENGTH = 60
MAX_EXAMPLES = 3


def short(value):
    text = str(value)
    # Asset ids (32 hex characters) are shortened: they are not needed in the diagram.
    if len(text) == 32 and all(ch in "0123456789abcdef" for ch in text):
        return text[:8] + "..."
    if len(text) > MAX_EXAMPLE_LENGTH:
        return text[: MAX_EXAMPLE_LENGTH - 1] + "..."
    return text


profile = {}
for path in sorted(folder.glob("*.parquet")):
    frame = pl.read_parquet(path)
    rows = frame.height
    columns = []
    for name in frame.columns:
        series = frame[name]
        filled = rows - series.null_count()
        non_null = series.drop_nulls()
        distinct = non_null.n_unique() if filled > 0 else 0
        counts = (
            non_null.value_counts(sort=True).head(MAX_EXAMPLES)
            if filled > 0
            else None
        )
        examples = []
        if counts is not None:
            examples = [short(v) for v in counts[name].to_list()]
        columns.append(
            {
                "name": name,
                "type": str(series.dtype),
                "filled": filled,
                "filled_share": (filled / rows) if rows else 0,
                "distinct": distinct,
                "examples": examples,
            }
        )
    profile[path.stem] = {"rows": rows, "columns": columns}

output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(profile, indent=2, ensure_ascii=False), encoding="utf-8")
for table, info in profile.items():
    empty = [c["name"] for c in info["columns"] if c["filled"] == 0]
    print(f"{table}: {info['rows']} rows, {len(info['columns'])} columns, empty: {empty}")
