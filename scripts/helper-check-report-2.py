# Compares the tables of the tab PBI report build 2 (offline real run of
# scripts/test-vfc-pbi-report-2.js ... real dir=<dir>) with the same tables
# loaded in the EU Power BI report (downloads/pbix_data/eu__*.parquet, made
# by scripts/helper-pbix-extract.py). Only the rows our run has In EU Report
# true are compared, for the days both sides cover. Read-only.
# Usage: python -I scripts/helper-check-report-2.py <dir> [repo root]
import json
import sys
from pathlib import Path

import pandas as pd

DIR = Path(sys.argv[1])
ROOT = Path(sys.argv[2] if len(sys.argv) > 2 else '.')
EU = ROOT / 'downloads' / 'pbix_data'
SITES = ['Hull', 'Nottingham', 'Weinheim']


def ours(name):
    return pd.DataFrame(json.loads((DIR / name).read_text(encoding='utf-8')))


def compare(title, a, b, keys, values):
    """a = ours, b = EU. Row counts per key and equal values."""
    a = a.copy()
    b = b.copy()
    a['_n'] = a.groupby(keys).cumcount()
    b['_n'] = b.groupby(keys).cumcount()
    m = a.merge(b, on=keys + ['_n'], how='outer', suffixes=(' ours', ' EU'),
                indicator=True)
    both = m[m['_merge'] == 'both']
    print(f'\n== {title}')
    print(f'  rows ours {len(a)}, EU {len(b)}, in both {len(both)}, '
          f'only ours {int((m["_merge"] == "left_only").sum())}, '
          f'only EU {int((m["_merge"] == "right_only").sum())}')
    for col in values:
        x = both[col + ' ours']
        y = both[col + ' EU']
        if pd.api.types.is_numeric_dtype(x) and pd.api.types.is_numeric_dtype(y):
            same = (x.fillna(-1).astype(float) - y.fillna(-1).astype(float)).abs() < 1e-6
        else:
            same = x.fillna('<null>').astype(str) == y.fillna('<null>').astype(str)
        print(f'  {col:20} equal {same.mean() * 100:7.3f} %  ({int((~same).sum())} differ)')
    return m


# ---- Run_Rates_EU: hour rows, the EU file ends inside 9 Sep 2026
rr = ours('run_rates.json')
rr = rr[rr['In EU Report']]
rr['hour'] = pd.to_datetime(rr['Date'], unit='ms')
eu = pd.read_parquet(EU / 'eu__Run_Rates_EU.parquet')
eu = eu[eu['SiteName'].isin(SITES)].copy()
# Midnight is written as the date alone.
eu['hour'] = pd.to_datetime(eu['Date'], format='%m/%d/%Y %I:%M:%S %p', errors='coerce').fillna(
    pd.to_datetime(eu['Date'], format='%m/%d/%Y', errors='coerce'))
lo, hi = rr['hour'].min(), min(rr['hour'].max(), eu['hour'].max())
hi = hi.normalize()
rr = rr[(rr['hour'] >= lo) & (rr['hour'] < hi)]
eu = eu[(eu['hour'] >= lo) & (eu['hour'] < hi)]
print(f'Run rates window: {lo} to {hi} (exclusive)')
m = compare('Run_Rates_EU', rr, eu, ['SiteName', 'MachineName', 'hour', 'PartName'],
            ['Good Parts', 'Capacity', 'ShiftName', 'Product Key', 'AreaName'])
print(m[m['_merge'] != 'both'].groupby(['_merge', 'SiteName']).size().to_string())

# ---- Volume_CoV_EU: days, the EU file ends on 16 Sep 2026
cov = ours('cov.json')
cov = cov[cov['In EU Report']]
cov['day'] = pd.to_datetime(cov['Date'], unit='D')
eu = pd.read_parquet(EU / 'eu__Volume_CoV_EU.parquet')
eu['SiteName'] = eu['Unique Machine Name'].str.rsplit('-', n=1).str[-1]
eu = eu[eu['SiteName'].isin(SITES)].copy()
eu['day'] = pd.to_datetime(eu['Date'])
lo, hi = cov['day'].min(), min(cov['day'].max(), eu['day'].max())
cov = cov[(cov['day'] >= lo) & (cov['day'] < hi)]
eu = eu[(eu['day'] >= lo) & (eu['day'] < hi)]
print(f'\nVolume CoV window: {lo.date()} to {hi.date()} (exclusive)')
for frame in (cov, eu):
    frame['Shift'] = frame['Shift'].fillna('<null>')
m = compare('Volume_CoV_EU', cov, eu, ['SiteName', 'MachineName', 'day', 'Shift'],
            ['Good Parts Sum', 'Cap Max', 'Shift Machine Key', 'Unique Machine Name'])
print(m[m['_merge'] != 'both'].groupby(['_merge', 'SiteName']).size().to_string())

# ---- Format_List_EU
fmt = ours('format.json')
eu = pd.read_parquet(EU / 'eu__Format_List_EU.parquet')
eu = eu[eu['Site Name'].isin(fmt['Site Name'].unique())]
compare('Format_List_EU', fmt, eu, ['Site Name', 'Product Key'],
        ['MachineName', 'Product Name', 'Brand', 'Unit Size', 'Unit Count/Format', 'Extra Info'])
