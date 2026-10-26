# Historical_OEE_EU: one-time archive of the Provideam Historical OEE

| At a glance | |
|---|---|
| **What** | The daily OEE, Availability and Performance per machine of 2022 to Nov 2024 (before the Plan OPT history starts), for the Historical OEE page of the site dashboards. The data never changes: a one-time conversion and upload, no flow |
| **Input** | `downloads/Historical_OLD_OEE.csv` (Hull, 2022-01-01 to 2024-10-31) and `downloads/Notts_HistoricalOEE_1jan22_30nov24.csv` (Nottingham, 2022-01-03 to 2024-11-30): Provideam exports, UTF-16, tab, `YYYY-MM-DD`, `MachineName`, `OEE`, `Availability`, `Performance` as `40.6%`, a `Total:` row |
| **Output** | `eu_report/report/Historical_OEE_EU/site=<Site>/Historical_OEE_EU_archive.parquet` |
| **Scripts** | `scripts/historical-oee-convert.js` (rows and checks), `scripts/helper-chartres-write-parquet.py` (generic stage JSON to parquet writer), `scripts/historical-oee-upload.js` (lists, uploads with `--yes`) |
| **Status** | Converted 2026-10-27, local files in `sharepoint/historical_oee_20261027/` (git-ignored). **Not uploaded**: the user uploads after a look |

## Columns
| Column | Type | From |
|---|---|---|
| `Date` | DATE | `YYYY-MM-DD` |
| `MachineName` | text | as exported |
| `SiteName` | text | the site of the file |
| `Unique Machine Name` | text | machine + `-` + site (the key of the other tables) |
| `OEE`, `Availability`, `Performance` | double | fraction: `40.6%` becomes 0.406 (as the report's Percentage type) |
| `Dept`, `Area`, `Product Type` | text | the site's Machine Names file (local copy in `sharepoint/reference/machine_names/`), unfiltered; empty for old machines that are not in it |
| `Data Source` | text | `Provideam archive` |
| `In EU Report` | boolean | `config/report_scope.csv`; the file has no rule for this table, so all true |
| `loaded_at` | timestamp | time of the conversion |

The site queries (Hull `Historical OEE`, Nottingham `Historical OEE N`) only type the columns; the `Total:` row is dropped here (in Power BI it fails the date type). The page shows a **simple average** of the daily values (not weighted by time): copy that in Tableau so the numbers match.

## Result of the conversion (2026-10-27)
| Site | Rows | Days | Machines | Simple average OEE / Availability / Performance | Machines not in Machine Names |
|---|---|---|---|---|---|
| Hull | 28,944 | 2022-01-01 to 2024-10-31 | 50 | 0.3616 / 0.5883 / 0.5754 | `B1 - Auto`, `B4 Auto`, `B5 Auto` |
| Nottingham | 42,401 | 2022-01-03 to 2024-11-30 | 70 | 0.6008 / 0.7069 / 0.8108 | 7 old machines (`Fette1`, `Fette3`, `Fette15`, `S09`, printing and filling) |

Raw rows = kept + the `Total:` row for both files. Read back with pandas: 13 columns, the types above.

## Run it again (only if the archive or the Machine Names change)
```
node scripts/historical-oee-convert.js sharepoint/historical_oee_<date> Hull=downloads/Historical_OLD_OEE.csv Nottingham=downloads/Notts_HistoricalOEE_1jan22_30nov24.csv
python -I scripts/helper-chartres-write-parquet.py sharepoint/historical_oee_<date>
node scripts/historical-oee-upload.js sharepoint/historical_oee_<date>          (lists only)
node scripts/historical-oee-upload.js sharepoint/historical_oee_<date> --yes    (WRITES to the data lake)
```
The upload skips a file that already exists in the lake; to replace one, run `node scripts/datalake-upload-tree.js sharepoint/historical_oee_<date>/report eu_report/report --overwrite`.

## Later
This is also the pattern for archiving our own old data: one row per machine and day with a few numbers, written once.
