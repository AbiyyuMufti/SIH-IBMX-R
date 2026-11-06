# Measures the data blending gap of the report tables.
# In: a download folder with Plan_OPT_EU, Time_Utilisation_EU and
# Daily_Losses_EU (<table>/site=<Site>/*.parquet). Out (into out_dir):
# gaps_line_day.csv (per site, month, line, direction: line-days, rows,
# loss minutes, loss units, good parts), gaps_shift_day.csv (plan vs
# losses on site + machine + shift + day), and a summary on stdout.
# Run: python -I scripts/helper-blend-gap.py <dir>[,<dir>...] <out dir>
import os
import sys
import glob
import pandas as pd

# several folders: comma separated (a lake copy plus a filler build)
SRC = sys.argv[1].split(',')
OUT = sys.argv[2]
TABLES = {
    'plan': 'Plan_OPT_EU',
    'util': 'Time_Utilisation_EU',
    'loss': 'Daily_Losses_EU',
}
# loss rows are dated by the shift start (the Tableau date filter uses it)
DATE_COL = {
    'plan': 'Date',
    'util': 'Date',
    'loss': 'ShiftStartDate',
}


def load(key):
    frames = []
    paths = []
    for src in SRC:
        pattern = os.path.join(src, '**', TABLES[key], 'site=*', '*.parquet')
        paths += glob.glob(pattern, recursive=True)
    for path in paths:
        df = pd.read_parquet(path)
        df['site'] = path.split('site=')[1].split(os.sep)[0]
        df['file'] = os.path.basename(path)
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df['day'] = pd.to_datetime(df[DATE_COL[key]]).dt.strftime('%Y-%m-%d')
    df['month'] = df['day'].str[:7]
    df['line'] = df['MachineName'].astype(str)
    if 'ShiftName' in df.columns:
        df['shift'] = df['ShiftName'].fillna('<null>').astype(str)
    return df


def per_key(df, key, keys):
    agg = {'rows': ('line', 'size')}
    if key == 'loss':
        agg['loss_min'] = ('Duration', 'sum')
        agg['loss_units'] = ('Loss Units', 'sum')
    if key == 'plan':
        agg['good_parts'] = ('Good Parts', 'sum')
        agg['capacity'] = ('Capacity', 'sum')
    return df.groupby(keys).agg(**agg).reset_index()


data = {k: load(k) for k in TABLES}
for k, df in data.items():
    print(k, len(df), 'rows', df['site'].nunique(), 'sites',
          df['day'].min(), 'to', df['day'].max())

# 1. line-day level, all 6 directions
LD = ['site', 'month', 'line', 'day']
sets = {k: per_key(df, k, LD) for k, df in data.items()}
out = []
for a in TABLES:
    for b in TABLES:
        if a == b:
            continue
        m = sets[a].merge(sets[b][LD], on=LD, how='left', indicator=True)
        miss = m[m['_merge'] == 'left_only'].drop(columns='_merge')
        g = miss.groupby(['site', 'month', 'line']).agg(
            line_days=('day', 'size'),
            days=('day', lambda s: ' '.join(sorted(s))),
            **{c: (c, 'sum') for c in miss.columns
               if c not in LD}).reset_index()
        g.insert(0, 'direction', f'in {a}, not in {b}')
        out.append(g)
gaps = pd.concat(out, ignore_index=True)
os.makedirs(OUT, exist_ok=True)
gaps.to_csv(os.path.join(OUT, 'gaps_line_day.csv'), index=False)

print('\n== line-days present in A, missing in B (per site) ==')
cols = ['line_days', 'rows', 'loss_min', 'loss_units', 'good_parts']
cols = [c for c in cols if c in gaps.columns]
print(gaps.groupby(['direction', 'site'])[cols].sum().to_string())

# 2. plan vs losses on site + machine + shift + day (the blend fields)
SD = ['site', 'month', 'line', 'shift', 'day']
p = per_key(data['plan'], 'plan', SD)
lo = per_key(data['loss'], 'loss', SD)
m = p.merge(lo, on=SD, how='outer', suffixes=('_plan', '_loss'),
            indicator=True)
m['side'] = m['_merge'].map({
    'left_only': 'plan only',
    'right_only': 'loss only',
    'both': 'both',
})
m.drop(columns='_merge').to_csv(
    os.path.join(OUT, 'gaps_shift_day.csv'), index=False)
print('\n== plan vs losses on site + machine + shift + day ==')
print(m.groupby(['site', 'side'], observed=True)[
    ['good_parts', 'capacity', 'loss_min', 'loss_units']
].sum().round(0).to_string())
print(m.groupby(['site', 'side'], observed=True).size().unstack().to_string())

# 3. line D1
for k, df in data.items():
    d1 = df[df['line'].str.strip().str.upper() == 'D1']
    if len(d1):
        print(f'\nD1 in {k}: sites {sorted(d1.site.unique())}, '
              f'{d1.day.nunique()} days {d1.day.min()} to {d1.day.max()}')
d1 = gaps[gaps['line'].str.strip().str.upper() == 'D1']
print('\n== D1 gaps ==')
print(d1[['direction', 'site', 'month', 'days'] +
         [c for c in cols if c in d1.columns]].to_string())
