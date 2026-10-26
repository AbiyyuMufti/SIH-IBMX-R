# Writes the parquet files of scripts/chartres-convert.js: every
# <out>/stage/<table>/site=<Site>/<file>.json ({schema, rows}) becomes
# <out>/report/<table>/site=<Site>/<file>.parquet with the types of the schema
# (UTF8, BOOLEAN, INT64, DOUBLE, DATE from a day number, TIMESTAMP_MILLIS from ms).
# Usage: python -I scripts/helper-chartres-write-parquet.py <out>
import json
import pathlib
import sys

import pyarrow as pa
import pyarrow.parquet as pq

TYPES = {
    'UTF8': pa.string(),
    'BOOLEAN': pa.bool_(),
    'INT64': pa.int64(),
    'DOUBLE': pa.float64(),
    'DATE': pa.date32(),
    'TIMESTAMP_MILLIS': pa.timestamp('ms'),
}

out = pathlib.Path(sys.argv[1])
count = 0
for src in sorted((out / 'stage').rglob('*.json')):
    data = json.loads(src.read_text(encoding='utf-8'))
    schema = pa.schema([(name, TYPES[kind]) for name, kind in data['schema']])
    columns = {name: [row[name] for row in data['rows']] for name in schema.names}
    # Day numbers and ms arrive as integers: build the date / timestamp arrays from int32 / int64.
    def array(f):
        if f.type == pa.date32():
            return pa.array(columns[f.name], type=pa.int32()).cast(f.type)
        if f.type == pa.timestamp('ms'):
            return pa.array(columns[f.name], type=pa.int64()).cast(f.type)
        return pa.array(columns[f.name], type=f.type)
    table = pa.table({f.name: array(f) for f in schema}, schema=schema)
    dest = out / 'report' / src.relative_to(out / 'stage').with_suffix('.parquet')
    dest.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, dest)
    count += 1
print(f'{count} parquet files in {out / "report"}')
