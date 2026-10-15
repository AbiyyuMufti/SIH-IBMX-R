# PBI report build: the pbi_* tables from the files in the data lake

| At a glance | |
|---|---|
| **What** | One VFC tab, `PBI report build`, that builds the Power BI shaped tables of `eu_report/pbi_report/report/` from the CSV files in the data lake (`eu_report/reference`, later `eu_report/pbi_report/source`). No API calls. Same tables and column names as the Insights Hub flows in [powerbi-direct.md](powerbi-direct.md), so a dashboard can switch the source |
| **Flow** | `flows/vfc-pbi-report.json`. Generator `scripts/build-vfc-pbi-report-flow.js`, code `scripts/vfc/b*.js` (and `r5`, `r6`, `p1`, `m5-distinct` shared with the reference flow). Needs the Config tab (`1.1 CONFIG`) |
| **Status** | Step 1 ran in the VFC (checked, see below). Step 2 built and tested offline (`node scripts/test-vfc-pbi-report.js platform=xcelerator`, 50 checks, real data compared with the report), not run in the VFC yet. `DRY_RUN` is `true` for every table by default (the user sets it) |
| **Step 1 tables** | `pbi_machine_names`, `pbi_shift_naming`, `pbi_calendar` |
| **Step 2 tables** | `pbi_plan_opt` and `pbi_time_utilisation`: one file per site and month, see "Step 2" below |
| **Next steps** | Step 3: `pbi_daily_losses`. Step 4: the listeners (subscribe object) with the wait window, the reference-change rebuild and the backfill |
| **Design** | Staging tables are never stored: the intermediate results exist only in the memory of a run. A check log (rows read and written, rows without a match) takes their place |

## Job (the inject payload)
`{"tables": [...], "sites": ["Hull", "Nottingham", "Weinheim"], "from": "2026-09", "to": "2026-10"}`. All optional: no list = all tables / all sites, no months = last month and this month (`from` and `to` are months YYYY-MM, both included; used by the month tables). An unknown table or site, or `from` after `to`, is refused before anything runs. Dry run per table: `DRY_RUN` in node `1.1 TASK SETTINGS`.

## Tables
| Table | Source | Rule (from the load queries of the report, read with `helper-pbit-outline.js`) | File |
|---|---|---|---|
| `pbi_machine_names` | `eu_report/reference/machine_names/site=<Site>/*.csv` (newest .csv of the folder) | Hull: no `GT4 - Auto`, Dept `Dries Pack` or `Liquids Pack`. Nottingham: Area `SD Packing` or `Strepsils Packing`. Weinheim: all rows. `unique_machine_name` = machine + `-` + site. One file for all sites | `pbi_machine_names/pbi_machine_names.parquet` |
| `pbi_shift_naming` | `eu_report/reference/shift_naming/site=All/*.csv` | the distinct `Shift` values (Afternoon, Blue, Day, Gold, Green, Night, Red) | `pbi_shift_naming/pbi_shift_naming.parquet` |
| `pbi_calendar` | generated | 2011-01-01 to 2050-12-31 (as the report), 14610 rows, Monday week start, week number as DAX `WEEKNUM(date, 2)` (week 1 holds 1 January, not the ISO week) | `pbi_calendar/pbi_calendar.parquet` |

A rerun replaces the file. A site without a file, or a file without the expected columns, makes the table fail: nothing is written and the log says which site (no half tables).

## Checked
- Offline test (small CSV files in a mock lake): rules, quoted commas, dry run, one table or one site per job, missing file, newest of two files, unknown table.
- Real files (`node scripts/test-vfc-pbi-report.js platform=xcelerator real out=<file>`, local `sharepoint/reference`): the machine rows are identical to the report's own `Machine Names EU` (`ReportReplica/Seguns/Machine Names EU.parquet`) for Hull, Nottingham and Weinheim: 60 rows, all 6 columns. Mira has 15 rows in the report and no file here. The shifts are the 7 expected values.

## The VFC nodes used, and what is untested
- `list objects` (path = folder with a trailing slash, answer = array of `{key, lastModified, contentSize}`, as in the lake spike), `read object`, `csv` (settings of the node the user tested: header row, one message with the array of all rows; the first test with a 30,830 row file gave `msg.payload.length` 30830).
- First VFC dry run (2026-10-15): `list objects` found the files, but `read object` answered `Error: Not Found` on the key it returned (3 Machine Names files and the shift file). Assumed cause, not seen in the VFC: the list returns the key with the tenant folder `data/ten=<tenant>/` in front and the read node wants the path without it. Fix in node `Pick the file`: the tenant folder and a leading slash are removed, and the node status shows the last 40 characters of the path it reads. The offline test lists keys with the prefix (the first version fails on it exactly like the VFC did). If the VFC still says Not Found, send the `list objects` debug output of one item (the key form).
- Still untested in the VFC: that `msg.parts` survives `list objects`, `read object` and `csv` (the join over the sites needs it).
- A folder that does not exist: what `list objects` does is not known. If it raises an error, the catch lane logs it and the table waits for the missing site item (nothing is written).

## Test runner
`scripts/lib-vfc-runner.js` got the `csv` node, the `list objects` node and the option `startPayload` (the payload of the first message). The csv parser handles quoted fields and any line end; values stay text.

## First VFC run and content check (2026-10-15)
- Dry run in the VFC: calendar 14610 rows, shift naming 7 rows, machine names 60 rows (Hull 29, Nottingham 25, Weinheim 6). So `msg.parts` survives `list objects`, `read object` and `csv` (the join over the sites worked) and the key fix works.
- Write run (user, DRY_RUN false): three files in `eu_report/pbi_report/report/`. Downloaded and read back with pandas: machine names 60 rows, no nulls, identical to the report's own Machine Names EU for the three sites, unique key unique, one `loaded_at` per run; shift names the 7 values; calendar 14610 dates 2011-01-01 to 2050-12-31, no duplicate date.
- Found: `week_number` was the ISO week, the report uses DAX `WEEKNUM(date, 2)` (week 1 holds 1 January, so 2011-01-01 is week 1 and 2024-12-30 is week 53). Fixed in `scripts/vfc/p1-build-calendar.js` (shared with the Insights Hub reference flow and the old Power BI conversion flow, rebuilt and tested); checked against an independent calculation for all 14610 dates. The calendar file in the lake from the first write run still has ISO weeks: run the calendar again.

## Step 2: pbi_plan_opt and pbi_time_utilisation (2026-10-15)
- **Source:** `eu_report/pbi_report/source/plan_opt/site=<Site>/plan_opt_YYYY-MM.csv` (normalized layer). **Output:** `eu_report/pbi_report/report/<table>/site=<Site>/<table>_<YYYY-MM>.parquet`, one file per site and month; a rerun replaces the month. Columns are those of `scripts/lib-pbi-schemas.js` (`planSchema`, `utilSchema`); `source_hours` is empty (it only exists for the Insights Hub flow).
- **Per site (lanes 9 to 15):** list and read the site's Glidepaths file and build the target lookup in flow context (`targets_<site>`), read the Shift Patterns file into `shiftMap`, list the month files and keep the months of the job that exist (a missing month is logged: a read node would stop on a missing file), then one message per month, one per second: read the month file, build the rows, and write both tables. Per month a check line goes to the log (rows read, kept, left out, shifts without a mapping, machines without a target). A site whose Glidepaths or Shift Patterns file is missing is logged as FAILED and skipped.
- **Plan OPT rules** (from the report queries, `helper-pbit-outline.js --table "Plan OPT H"`, N, W, "Plan OPT Provideam", "Plan OPT EU"):
  - rows without a machine name are dropped. Hull: 19 machines and `GT4 - Auto` (list in node `Build plan rows`; the name `Bosch Capsulator ` has a trailing space). Nottingham: only AreaName ` Strepsils Packing` (leading space) and `SD Packing`, not `N11 Auto`, not `S14`. Weinheim: not `N11 Auto`.
  - Unique Machine Name = machine + `-` + site. Product Key = unique name + space + part name. Weinheim: the first 8 characters of the part name are cut off (the part code). Hull: text `Gavi 12 X 150 Russian Crypto` replaced by `Gavi 12 x 150 russian Crypto`. Trailing spaces of the part name are removed (the report data has none; leading spaces stay).
  - ShiftName = the `Shift` of the Shift Patterns file for the raw name (an unknown name gives an empty shift).
  - Total Time, Planned OpT, OEE Time: `H:MM:SS` to minutes `H*60+M`, seconds dropped (as the report: it splits on `:` and keeps two parts).
  - Targets: key = unique name + month start (`01/MM/YYYY`); OEE Target = bucket `% OEE`, PDT Target = `Planned Downtime (Total)`, UPDT Target = `Unplanned Downtime (Total)` of the Glidepaths file (an empty cell gives an empty target).
  - The report drops Defect Parts, Target, OEE, ShiftStartTime; the table has the other 17 columns.
- **Time Utilisation rules:** own machine rules (Hull: the same list; Nottingham: only 23 machines and not `N11 Auto`; Weinheim: all), computed from the raw rows (not from the filtered plan rows), minutes with seconds (`H*60+M+S/60`) summed per machine and day, All Time 1440.
- **Checked against the report** (`Plan OPT EU.parquet` of the report, Dec 2024 to 18 Sep 2026, Hull, Nottingham, Weinheim, run with `node scripts/test-vfc-pbi-report.js platform=xcelerator real plan dir=<dir>` and a pandas comparison): 99.80 % of the report's 39,928 rows are identical in all 17 columns (Hull 99.71 %, Nottingham 99.85 %, Weinheim 99.96 %). What is left is data, not rules: Sep 2026 rows changed after the report's snapshot (capacity, planned time of the last days) and 57 Hull rows of December 2025 that are in the report but not in our files (the gap days). 248 rows exist only on our side, almost all of Sep 2026 (the report stops on 18 Sep and the current month file is rewritten every hour). Time Utilisation has no sample in the report folder: checked against the plan sums (difference at most the seconds rounding, 0 machine-days without a plan row, no excluded machine present, 23 Nottingham machines).
- **Mistakes found by that comparison, fixed:** the glidepath files start with a byte order mark (`\uFEFFSite Name`, no target matched: the lookup removes it and the test fixture has one now); the Weinheim part code; the trailing spaces of the part name; `N11 Auto` in the Nottingham plan filter (an earlier filter step I had missed); and the normalizer was trimming all text (see sharepoint-files.md), which broke the Nottingham area filter and the Hull exclusion `Bosch Capsulator `.
- **Not tested in the VFC yet:** flow context (`flow.set` / `flow.get`) of the lookups between the nodes of a site, `list objects` on the month folders, one month message per second for about 70 months (3 sites x 23 months, roughly 2 minutes plus the writes), memory of a month of Nottingham rows (2,700 rows).

