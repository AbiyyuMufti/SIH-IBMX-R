# Traces the Tableau loss % dials of one site and month, filter by filter.
# In: download folder (Plan_OPT_EU, Daily_Losses_EU), site, month, and an
# optional machine. Out: row count and sums after each step, then the
# loss % with and without the blend drop and the In EU Report filter.
# Tableau dial (Plan primary, Losses secondary, link MachineName +
# ShiftName): loss units of a machine + shift with no plan row in the
# period drop out; a null ShiftName never links.
# Run: python -I scripts/helper-blend-trace.py <dir> <site> <YYYY-MM> [machine]
import os
import sys
import glob
import pandas as pd

SRC, SITE, MONTH = sys.argv[1:4]
MACHINE = sys.argv[4] if len(sys.argv) > 4 else None
UNPLANNED = ['Unplanned Loss', 'Not Logged']
PLANNED = ['Planned Loss']


def load(table, date_col):
    pattern = os.path.join(SRC, '**', table, f'site={SITE}', '*.parquet')
    paths = glob.glob(pattern, recursive=True)
    df = pd.concat([pd.read_parquet(p) for p in paths], ignore_index=True)
    df['day'] = pd.to_datetime(df[date_col]).dt.strftime('%Y-%m-%d')
    return df


def show(step, df, cols):
    sums = ', '.join(f'{c} {df[c].sum():,.0f}' for c in cols)
    print(f'  {step:<44} rows {len(df):>7,}  {sums}')


plan = load('Plan_OPT_EU', 'Date')
loss = load('Daily_Losses_EU', 'ShiftStartDate')
print(f'== {SITE} {MONTH}' + (f' machine {MACHINE}' if MACHINE else ''))
print('Plan_OPT_EU')
show('all files of the site', plan, ['Capacity', 'Good Parts'])
plan = plan[plan['day'].str[:7] == MONTH]
show('date in month', plan, ['Capacity', 'Good Parts'])
if MACHINE:
    plan = plan[plan['MachineName'] == MACHINE]
    show('machine', plan, ['Capacity', 'Good Parts'])
plan_eu = plan[plan['In EU Report'] == True]
show('In EU Report true', plan_eu, ['Capacity', 'Good Parts'])

print('Daily_Losses_EU')
show('all files of the site', loss, ['Loss Units', 'Duration'])
loss = loss[loss['day'].str[:7] == MONTH]
show('ShiftStartDate in month', loss, ['Loss Units', 'Duration'])
if MACHINE:
    loss = loss[loss['MachineName'] == MACHINE]
    show('machine', loss, ['Loss Units', 'Duration'])
keys = set(zip(plan['MachineName'], plan['ShiftName']))
linked = loss[[k in keys for k in zip(loss['MachineName'],
                                      loss['ShiftName'])]]
show('machine + shift found in plan (blend)', linked,
     ['Loss Units', 'Duration'])
dropped = loss.drop(linked.index)
show('dropped by the blend', dropped, ['Loss Units', 'Duration'])
loss_eu = loss[loss['In EU Report'] == True]
show('In EU Report true (no blend)', loss_eu, ['Loss Units', 'Duration'])


def pct(lo, pl, groups):
    units = lo[lo['OEELossLvl3Group'].isin(groups)]['Loss Units'].sum()
    cap = pl['Capacity'].sum()
    return 100 * units / cap if cap else float('nan')


print('Loss % = loss units / capacity        unplanned  planned')
cases = [
    ('Tableau now: all rows, blend drop', linked, plan),
    ('all rows, no blend drop (filler)', loss, plan),
    ('In EU Report, no blend drop (PBI EU)', loss_eu, plan_eu),
    ('In EU Report, blend drop', linked[linked['In EU Report'] == True],
     plan_eu),
]
for name, lo, pl in cases:
    print(f'  {name:<37} {pct(lo, pl, UNPLANNED):>8.2f}  '
          f'{pct(lo, pl, PLANNED):>7.2f}')

if len(dropped):
    print('Dropped loss units by machine and shift (top 10)')
    top = dropped.groupby(['MachineName', dropped['ShiftName'].fillna(
        '<null>')])[['Loss Units', 'Duration']].sum()
    print(top.sort_values('Loss Units', ascending=False).head(10)
          .to_string())
