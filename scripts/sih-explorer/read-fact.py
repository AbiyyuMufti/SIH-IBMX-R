# Reads EU_OEE_Fact parquet files and prints the rows of one day (and one
# machine, optional) as JSON. Used by scripts/sih-explorer/server.js.
# Usage: python read-fact.py <day> <machine or -> <file> [<file> ...]
import json
import sys
from datetime import date

import polars as pl

day, machine, files = sys.argv[1], sys.argv[2], sys.argv[3:]
frames = [pl.read_parquet(f) for f in files]
df = pl.concat(frames, how="diagonal_relaxed") if frames else pl.DataFrame()
if df.height:
    # Day files and month files may type Date differently.
    want = day if df.schema["Date"] == pl.Utf8 else date.fromisoformat(day)
    df = df.filter(pl.col("Date") == want)
    if machine != "-":
        df = df.filter(pl.col("MachineName") == machine)
print(json.dumps({
    "columns": df.columns,
    "rows": json.loads(df.write_json()) if df.height else [],
}, default=str))
