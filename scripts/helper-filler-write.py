# Step 3 of the local filler build (docs/pbi-report-build.md step 10).
# Every <out>/stage/<table>/site=<Site>/<name>.json ({schemaFrom, rows}) of
# local-filler-build.js becomes <out>/report/<table>/site=<Site>/<name>.parquet
# with exactly the schema (names, order, types) of the file schemaFrom, the
# period's own file. Columns a row does not carry are null.
# Run: python -I scripts/helper-filler-write.py <out>
import json
import pathlib
import sys

import pyarrow as pa
import pyarrow.parquet as pq

out = pathlib.Path(sys.argv[1])


def array(field, values):
    t = field.type
    if pa.types.is_date32(t):
        return pa.array(values, pa.string()).cast(t)
    if pa.types.is_timestamp(t):
        return pa.array(values, pa.int64()).cast(t)
    return pa.array(values, t)


count = 0
for src in sorted((out / 'stage').rglob('*.json')):
    data = json.loads(src.read_text(encoding='utf-8'))
    schema = pq.read_schema(data['schemaFrom']).remove_metadata()
    rows = data['rows']
    table = pa.table({f.name: array(f, [r.get(f.name) for r in rows])
                      for f in schema}, schema=schema)
    dest = out / 'report' / src.relative_to(out / 'stage').with_suffix('.parquet')
    dest.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, dest)
    back = pq.read_schema(dest).remove_metadata()
    assert back.equals(schema), f'schema differs: {dest}'
    count += 1
print(f'{count} filler parquet files in {out / "report"}, schemas equal')
