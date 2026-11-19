"""Re-stamp the In EU Report flag of the Nottingham report files after the
2026-11-19 scope change (24 machines, S14 in). Reads a backup tree
<in>/eu_report/report/<table>/site=Nottingham/*.parquet, writes the same tree
to <out>, and prints the flips per table. Only flag columns change.
Usage: python -I scripts/helper-nott-scope-patch.py <in> <out>
"""
import csv
import glob
import os
import sys
import collections

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

LIST = ('N1,N3,N4,N5,N6,N7,N8,N9 Auto,N10,N11,N12,O5,O6,S04,S05,S06,S08,'
        'S10,S11,S12,S13,T2,T7,S14').split(',')
OLD_FACT_LINES = [m for m in LIST if m != 'S14']
TABLES = ['Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU',
          'Run_Rates_EU', 'Volume_CoV_EU', 'EU_OEE_Fact']
src, dst = sys.argv[1], sys.argv[2]

flips = collections.Counter()
files = 0
for table in TABLES:
    pattern = os.path.join(src, 'eu_report', 'report', table,
                           'site=Nottingham', '*.parquet')
    for path in sorted(glob.glob(pattern)):
        rel = os.path.relpath(path, src)
        out = os.path.join(dst, rel)
        pf = pq.ParquetFile(path)
        comp = pf.metadata.row_group(0).column(0).compression
        t = pf.read()
        names = pc.utf8_trim_whitespace(t['MachineName'].cast(pa.string()))
        new = pc.fill_null(pc.is_in(names, value_set=pa.array(LIST)), False)
        cols = ['In EU Report']
        if table == 'EU_OEE_Fact':
            # the fact flag follows the line list; the source flag the table
            old_lines = pc.fill_null(
                pc.is_in(names, value_set=pa.array(OLD_FACT_LINES)), False)
            if not pc.all(pc.equal(t['In EU Report'], old_lines)).as_py():
                raise SystemExit('fact flag differs from the old line list: ' + rel)
            cols = ['In EU Report', 'In EU Report Source']
        for c in cols:
            old = t[c]
            for m, o, n in zip(names.to_pylist(), old.to_pylist(),
                               new.to_pylist()):
                if o != n:
                    flips[(table, c, m, o, n)] += 1
            i = t.schema.get_field_index(c)
            t = t.set_column(i, t.schema.field(i), new)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        pq.write_table(t, out, compression='none' if comp == 'UNCOMPRESSED' else comp.lower())
        files += 1

print('files written', files)
with open(os.path.join(dst, 'flips.csv'), 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['table', 'column', 'machine', 'old', 'new', 'rows'])
    for k, v in sorted(flips.items(), key=lambda kv: str(kv[0])):
        w.writerow(list(k) + [v])
agg = collections.Counter()
for (table, c, m, o, n), v in flips.items():
    agg[(table, c, o, n)] += v
for k, v in sorted(agg.items(), key=lambda kv: str(kv[0])):
    print(k, v)
