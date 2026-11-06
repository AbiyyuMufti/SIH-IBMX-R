# Step 1 of the local filler build (docs/pbi-report-build.md step 10).
# Reads Plan_OPT_EU and Daily_Losses_EU of a lake copy, groups the files by
# site and period (the YYYY-MM or YYYY-MM-DD of the file name) and writes
# <out>/input/<Site>/<period>.json: the distinct key and machine columns
# of both tables, plus the file each filler copies its schema from.
# Existing *_filler files are not read (the filler is rebuilt whole).
# Run: python -I scripts/helper-filler-input.py <lake copy> <out> [sites=..]
import glob
import json
import os
import re
import sys

import pyarrow.parquet as pq

SRC, OUT = sys.argv[1], sys.argv[2]
SITES = 'Hull,Nottingham,Weinheim'
for arg in sys.argv[3:]:
    if arg.startswith('sites='):
        SITES = arg[6:]
SITES = SITES.split(',')
NAME = re.compile(r'^(?P<table>.+?)_(?P<period>\d{4}-\d{2}(-\d{2})?)_'
                  r'(?P<source>[a-z]+)\.parquet$')
COLUMNS = {
    'Plan_OPT_EU': ['Date', 'AreaName', 'MachineName', 'ShiftName',
                    'SiteName', 'Unique Machine Name', 'Dept', 'Area',
                    'Product Type', 'In EU Report', 'Shift Colour',
                    'ShiftStartTime'],
    'Daily_Losses_EU': ['ShiftStartDate', 'MachineName', 'ShiftName',
                        'SiteName', 'Unique Machine Name', 'Dept', 'Area',
                        'Product Type', 'In EU Report', 'Shift colour',
                        'Shift Time'],
}
DAYS = ('Date', 'ShiftStartDate')


def rows_of(path, table):
    df = pq.read_table(path, columns=COLUMNS[table]).to_pandas()
    for col in DAYS:
        if col in df.columns:
            df[col] = df[col].astype('datetime64[ms]').dt.strftime('%Y-%m-%d')
    if 'ShiftStartTime' in df.columns:
        ts = df['ShiftStartTime']
        if getattr(ts.dt, 'tz', None) is not None:
            ts = ts.dt.tz_localize(None)
        ms = ts.astype('datetime64[ms]').astype('int64')
        df['ShiftStartTime'] = ms.where(ts.notna(), None)
    df = df.drop_duplicates()
    df = df.astype(object).where(df.notna(), None)
    return df.to_dict('records')


groups = {}
for table in COLUMNS:
    for site in SITES:
        pattern = os.path.join(SRC, '**', table, f'site={site}', '*.parquet')
        for path in sorted(glob.glob(pattern, recursive=True)):
            m = NAME.match(os.path.basename(path))
            if not m or m['source'] == 'filler':
                continue
            g = groups.setdefault((site, m['period']), {
                'site': site,
                'period': m['period'],
                'plan': [],
                'loss': [],
                'schemaFrom': {},
                'oldFiller': [],
            })
            g['plan' if table == 'Plan_OPT_EU' else 'loss'] += \
                rows_of(path, table)
            g['schemaFrom'].setdefault(table, path)
        old = os.path.join(SRC, '**', table, 'site=*', f'{table}_*_filler.parquet')
        for path in glob.glob(old, recursive=True):
            site = path.split('site=')[1].split(os.sep)[0]
            period = NAME.match(os.path.basename(path))['period']
            if (site, period) in groups:
                groups[(site, period)]['oldFiller'].append(path)
            else:
                print('old filler with no source period:', path)

for (site, period), g in sorted(groups.items()):
    dest = os.path.join(OUT, 'input', site, period + '.json')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(g, f)
print(f'{len(groups)} site periods in {os.path.join(OUT, "input")}')
