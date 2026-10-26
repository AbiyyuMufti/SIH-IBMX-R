# Reads the loaded tables of the three Power BI files (EU, Hull, Nottingham)
# with pbixray and saves them as parquet, one file per table, for the proof
# notebooks. Read-only on the .pbix. Output holds customer data: it goes to
# downloads/pbix_data/ (git-ignored).
# Usage: python -I scripts/helper-pbix-extract.py <repo root> [table ...]
#   (table names: only those tables, for example "Run Rates EU")
import sys
from pathlib import Path

from pbixray import PBIXRay

ROOT = Path(sys.argv[1]).resolve()
ONLY = sys.argv[2:]
OUT = ROOT / 'downloads' / 'pbix_data'
FILES = {
    'eu': ROOT.parent / 'ReportReplica' / 'EU Daily OEE Report 2025 V1 1'
    / 'EU Daily OEE Report 2025 V1 1.pbix',
    'hull': ROOT / 'downloads' / 'Hull Site OEE Report 2025 V3.1 (2).pbix',
    'nott': ROOT / 'downloads' / 'Nottingham Site OEE Report 2025 V1 (8).pbix',
}
TABLES = {
    'eu': ['Plan OPT EU', 'Time Utilisation EU', 'Daily Losses EU',
           'Plan OPT H', 'Time Utilisation H', 'Daily Line Losses H',
           'Plan OPT N', 'Time Utilisation N', 'Daily Line Losses N',
           'Machine Names EU', 'Run Rates EU', 'Volume CoV EU',
           'Format List EU'],
    'hull': ['New Plan OPT', 'Time Utilisation', 'New Daily Line Losses',
             'New Machine Names'],
    'nott': ['Plan OPT N', 'Time Utilisation N', 'Daily Line Losses N',
             'Machine Names N'],
}

OUT.mkdir(parents=True, exist_ok=True)
for key, path in FILES.items():
    wanted = [t for t in TABLES[key] if not ONLY or t in ONLY]
    if not wanted:
        continue
    model = PBIXRay(str(path))
    for table in wanted:
        df = model.get_table(table)
        name = f"{key}__{table.replace(' ', '_')}.parquet"
        df.to_parquet(OUT / name, index=False)
        print(f'{key:5} {table:25} {len(df):>8} rows {len(df.columns):>3} cols')
