# PBI report build 2: Run_Rates_EU, Volume_CoV_EU, Format_List_EU

| At a glance | |
|---|---|
| **What** | A second VFC tab, `PBI report build 2`, for the site dashboard tables the first tab has no room for (a tab holds 200 nodes; `PBI report build` has 176). Same job format, same site setup, same `In EU Report` rule ([report-scope.md](report-scope.md)) |
| **Tables** | `Run_Rates_EU` (one row per machine and hour), `Volume_CoV_EU` (one row per day, shift and machine), `Format_List_EU` (the Format List file of each site) |
| **Output** | `<root>/report/Run_Rates_EU/site=<Site>/Run_Rates_EU_<YYYY-MM>_provideam.parquet`, same for `Volume_CoV_EU`; `<root>/report/Format_List_EU/site=<Site>/Format_List_EU.parquet` (one file per site, a rerun replaces it). A line on another source in Config goes to `candidate/provideam` (run rates, Volume CoV) |
| **Flow** | `flows/vfc-pbi-report-2.json` (137 nodes). Builder `scripts/build-vfc-pbi-report-2-flow.js`; new nodes `scripts/vfc/b9-*.js`; site setup lanes and table ends shared with the first tab (`scripts/lib-pbi-report-lanes.js`). Needs the Config tab |
| **Input** | Run rates: `<root>/pbi_report/source/run_rates/site=<Site>/run_rates_YYYY-MM.csv` (new type of the normalizer, see below). Volume CoV: the plan OPT month files. Format List: `<root>/reference/format_list/site=<Site>/` (newest .csv). Lookups: Machine Names, Shift Patterns, report scope |
| **Job** | `{"tables": ["Run_Rates_EU", "Volume_CoV_EU", "Format_List_EU"], "sites": [...], "from": "YYYY-MM", "to": "YYYY-MM"}`; inject `Run (edit payload)`, the queue `jobQueue_2` (lake watcher) or the run monitor (flow `pbi-report-2`, months). `DRY_RUN` is true for every table (node `1.1 TASK SETTINGS`) |
| **Status** | Built 2026-10-27, tested offline and against the EU report's own tables (below). Not run in the VFC yet |
| **Tests** | `node scripts/test-vfc-pbi-report-2.js platform=xcelerator` (offline, synthetic files); `... real dir=<dir>` then `python -I scripts/helper-check-report-2.py <dir>` (real files of `sharepoint/` against `downloads/pbix_data/eu__*.parquet`) |

## Rules (from the EU report queries, read with `helper-pbit-outline.js`)
**Run_Rates_EU** (queries Run Rates H, N, W): rows without a machine and rows with `Good Parts` 0 are dropped; `ShiftName` = the `Shift` of the Shift Patterns file for the raw shift name (unknown: empty); Weinheim: the first 8 characters of the part name (part code) are cut; trailing spaces of the part name go (the report data has none); `Unique Machine Name` = machine + `-` + site; `Product Key` = unique name + space + part name; `Good Parts - Copy` = `Good Parts` (zeros are already gone). `Date` is the hour, written as a timestamp (wall clock as UTC, like every other time of our tables). `In EU Report` false: Hull `Senokot Press`, Nottingham `S14`. Columns: the 11 of the report (without Mira's `Batch ID`), then Dept, Area, Product Type, Data Source, In EU Report, loaded_at.

**Volume_CoV_EU** (queries Volume CoV H, N, W): from the plan OPT rows. Hull groups per date, mapped shift and machine; Nottingham and Weinheim per date, raw shift name and machine and map the shift after (so two raw names of one shift give two rows, as in the report). `Good Parts Sum` = sum of Good Parts, `Cap Max` = largest Capacity; only groups over 1,000 good parts. Dropped by both reports: Hull `GT4 - Auto`, Nottingham and Weinheim `N11 Auto`. `Shift Machine Key` = shift + space + machine. `In EU Report` false: the Hull process machines (not `Analgesics X Press`, it is not in the report's list), 13 Nottingham manufacturing machines and `S14`. Columns: the 7 of the report plus `SiteName` (the report table has none), the machine columns, In EU Report, loaded_at. `Time on Shift` and the raw `ShiftName` are removed by the EU query and left out. In Tableau: `Capacity Checker` = Good Parts Sum > 0.7 x Cap Max, `AVG Volume`, `CoV Aggregate` = STDEV / AVG of Good Parts Sum (`Is Outlier` is not used on any page).

**Format_List_EU** (query Format List EU): the columns of the file (`Site Name`, `MachineName`, `Product Name`, `Brand`, `Unit Size`, `Unit Count/Format`, `Extra Info`) plus `Unique Machine Name` and `Product Key` = unique name + space + Product Name (the key of plan OPT, losses and run rates). Empty cells are empty texts and trailing spaces go, as in the report. **Nottingham has no Format List file**: the run logs `FAILED, NOTHING WRITTEN: format_list Nottingham: no csv file` and the other sites are built. A starter file: `node scripts/helper-format-list-starter.js <Site>` (below).

## Normalizer: run_rates
`scripts/normalize-sharepoint-source.py` reads `sharepoint/source_original/run_rates/site=<Site>/` (the Provideam Run Rates exports: UTF-16, tab, `Total:` row, thousands commas) and writes `sharepoint/source/run_rates/site=<Site>/run_rates_YYYY-MM.csv` with `YYYY-MM-DD HH` as `YYYY-MM-DD HH:MM:SS`. Duplicates are decided per hour (a monthly export ends inside the first day of the next month; per day the early hours of the 1st would be lost). First run 2026-10-27: Aug to Oct 2026 for Hull, Nottingham and Weinheim, raw rows = kept + duplicates for every site, `problems: 0`. Upload: `npm run upload-changed` (the changed files are listed in `sharepoint/normalize-changed.txt`). More months: download the Run Rates exports into `sharepoint/source_original/run_rates/site=<Site>/`, run `npm run normalize`, then upload.

## Checked against the EU report (2026-10-27)
Offline real run (Aug and Sep 2026, Hull, Nottingham, Weinheim) against the tables loaded in the EU `.pbix` (`downloads/pbix_data/`, extracted with `python scripts/helper-pbix-extract.py . "Run Rates EU" "Volume CoV EU" "Format List EU"`), rows with `In EU Report` true, the days both cover (1 Aug to 15 Sep):
| Table | Rows ours / EU | Matched | Equal in matched rows |
|---|---|---|---|
| Run_Rates_EU | 21,890 / 21,904 | 21,772 | Good Parts, ShiftName, Product Key, AreaName 100 %; Capacity 99.7 % (63 rows of September changed after the report's refresh) |
| Volume_CoV_EU | 2,828 / 2,827 | 2,819 | Good Parts Sum, Shift Machine Key, Unique Machine Name 100 %; Cap Max 99.3 % (19 rows, same refresh effect) |
| Format_List_EU | 341 / 341 | 341 | all columns 100 % |

Unmatched run rates: 118 Nottingham rows of machine `Kilian ` (trailing space in the export; the report shows `Kilian`, our tables keep the machine name as exported, as in plan OPT and losses) and 9 Hull rows of the refresh window. Unmatched Volume CoV: 8 Nottingham and 1 Weinheim group (refresh). The first check found the trailing spaces of the part name (883 run rate rows) and of the Format List product names (11 rows): fixed.

## Format List starter
`node scripts/helper-format-list-starter.js <Site>` lists every MachineName + PartName of the site's plan OPT and run rates files (`sharepoint/source/`) that the site's Format List file does not have, in the Format List layout with empty Brand, Unit Size, Unit Count/Format, Extra Info. Output `sharepoint/format_list_starter_<Site>.csv` (local, not uploaded). For Nottingham (no file) it lists every product; for Hull the products missing from its file. The site fills the empty columns; then the file goes to `sharepoint/reference/format_list/site=<Site>/` and the lake.

## What to test in the VFC
1. Import `flows/vfc-pbi-report-2.json` into the workspace of the Config tab (and re-import `vfc-pbi-report.json`, `vfc-pbi-listener.json`, `vfc-run-monitor.json`). Upload the report scope file and the run rates files first.
2. Dry run Hull, Sep 2026, all three tables: three `DRY RUN` log lines, Format List 286 rows, Run Rates and Volume CoV with rows; Nottingham Format List: one `FAILED` line.
3. Write run (set `DRY_RUN` false for the table in 1.1): files in `eu_report/report/<table>/site=Hull/`.
4. Run monitor: the flow `PBI report build 2` is listed; connect the link `to pbi-report-2 BACKFILL` of the monitor tab with the link in `pbi-report-2 BACKFILL` of this tab.
