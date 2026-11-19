# Reads the EU_OEE_Fact day files of one walkthrough folder into fact.json.
# In: <dir> with fact/*.parquet (from scripts/sih-walkthrough.js).
# Out: <dir>/fact.json = {"columns": [...], "types": {...}, "rows": [...]}.
# Dates and timestamps become ISO text.
import json
import sys
from pathlib import Path

import polars as pl

folder = Path(sys.argv[1])
frames = [pl.read_parquet(f) for f in sorted((folder / "fact").glob("*.parquet"))]
if not frames:
    out = {"columns": [], "types": {}, "rows": []}
else:
    df = pl.concat(frames, how="diagonal_relaxed")
    out = {
        "columns": frames[0].columns,
        "types": {c: str(t) for c, t in df.schema.items()},
        "rows": json.loads(df.write_json()),
    }
(folder / "fact.json").write_text(json.dumps(out, default=str), encoding="utf-8")
print("fact rows:", len(out["rows"]))
