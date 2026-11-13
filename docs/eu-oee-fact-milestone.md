# EU_OEE_Fact with Run Rate rows: milestone 2026-11-13

| At a glance | |
|---|---|
| **Result** | Success. `eu_report/report/EU_OEE_Fact/` (94 month files) now has 65 columns and `Record Type = "Run Rate"` rows. SIH sync ok, Tableau (Site OEE Report Draft_Live V0.4) reads 979,008 rows, dashboards fine (user check, 2026-11-13) |
| **How** | Local build ([scripts/eu_oee_fact_rr_build.py](../scripts/eu_oee_fact_rr_build.py), parts from `parquet/rr_20261112/parts`) replaced the live files in place (`datalake-upload-tree.js --overwrite`), verified with `datalake-verify-tree.js` |
| **Rows** | 979,008: Chartres 116,617, Hull 315,930 (Run Rate 15,343), Nottingham 513,209 (45,879), Weinheim 33,252 (2,761) |
| **Backup** | `parquet/eu_oee_fact_backup_20261113/` = the live 62-column files before the change (git-ignored). Rollback: `node scripts/datalake-upload-tree.js parquet/eu_oee_fact_backup_20261113/eu_report/report/EU_OEE_Fact eu_report/report/EU_OEE_Fact --overwrite` |
| **Docs** | [eu-oee-fact-run-rate.md](eu-oee-fact-run-rate.md) (rules, check), [eu-oee-fact-live-plan.md](eu-oee-fact-live-plan.md) (flow plan), [../prompt-response/eu-oee-fact-build.md](../prompt-response/eu-oee-fact-build.md) (62-column build and parity) |

## Timeline (2026-11-13, SIH time)
1. Backup of the live tree downloaded (94 files, 40 MB). Old and new file lists compared: identical names, so an overwrite leaves nothing behind.
2. Upload 1 (user's go). SIH sync at 08:12 failed on `site=Chartres/EU_OEE_Fact_2025-01.parquet`: Hyper cannot read the columns `RR Hours`, `RR Good Parts`, `RR Capacity` (physical type INT32, logical type UNKNOWN).
3. Rolled back at once from the backup (94 files, 3 sampled files byte-identical).
4. Cause and fix, upload 2 (user's go, "try the fix immediately"), sync ok.

## Finding: empty column, no type
Chartres has no Run Rate rows. The three new columns were added with `pl.lit(None)`, which polars writes as type Null (parquet INT32 with logical type UNKNOWN). Hyper refuses the whole file, so the whole data source sync fails, not only the column. Fix: cast the columns to Int64, Int64, Float64 after the diagonal concat, so every file has real types. After the rebuild all 94 files were scanned: 0 Null-typed columns.

Rule for later builds and for the flow: any column that can be empty for a whole file must be typed explicitly before the write. The 62 old columns did not hit this, because they are filled in every site file.

## What was checked before upload
- Non-Run-Rate rows equal the previously uploaded fact (0 row differences, `check`).
- RR Good Parts equals Plan Good Parts on 99.85 % (Hull), 99.93 % (Nottingham), 100 % (Weinheim) of shift-days in both.
- Power BI parity for GT4 per colour: AVG Hr Rate and % Max Rate equal for Blue, Gold, Green, Pink (Red has no Power BI value to compare).
- Same 94 file names as the live table.

## Known points (unchanged, not blockers)
- 38 Nottingham tablet lines have Run Rate rows with `In EU Report = False` and empty Dept, Area, Product Type (they are not EU lines in the line list).
- Raw shift names the shift file does not map leave `ShiftName` empty on Run Rate rows: `Sunday Early shift - Green` (41 hours), `Sunday Late shift - Green` (11), `Sunday Early shift - Blue` (7), `Sat Afternoon` (5). Ask for the mapping when the Shift Patterns file is next updated.
- Data is to 2026-11-12, the last day partial. Weinheim: Provideam returned no rows for 11-11 and 11-12.
- The same build also rewrote the targets from the glidepath files (Hull, Nottingham, Weinheim) and moved Chartres Plan UPDT / PDT to percent points. Dashboards were fine after the sync.
- The Tableau measures AVG Hr Rate and % Max Rate (formulas in the run-rate doc) are NOT added: the user decided they are not needed now.

## Next: update the VFC flows to the 65-column format
The planned fact tab and the Chartres fact output ([eu-oee-fact-live-plan.md](eu-oee-fact-live-plan.md), "Update 2026-11-13") must write 65 columns and the Run Rate record type. Until then the lake is refreshed by hand with the local scripts.
