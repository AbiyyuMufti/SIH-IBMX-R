# PBI report build: the pbi_* tables from the files in the data lake

| At a glance | |
|---|---|
| **What** | One VFC tab, `PBI report build`, that builds the Power BI shaped tables of `eu_report/pbi_report/report/` from the CSV files in the data lake (`eu_report/reference`, later `eu_report/pbi_report/source`). No API calls. Same tables and column names as the Insights Hub flows in [powerbi-direct.md](powerbi-direct.md), so a dashboard can switch the source |
| **Flow** | `flows/vfc-pbi-report.json`. Generator `scripts/build-vfc-pbi-report-flow.js`, code `scripts/vfc/b*.js` (and `r5`, `r6`, `p1`, `m5-distinct` shared with the reference flow). Needs the Config tab (`1.1 CONFIG`) |
| **Status** | Step 1 built, offline test passes (`node scripts/test-vfc-pbi-report.js platform=xcelerator`, 20 checks), not run in the VFC yet. `DRY_RUN` is `true` for every table by default (the user sets it) |
| **Step 1 tables** | `pbi_machine_names`, `pbi_shift_naming`, `pbi_calendar` |
| **Next steps** | Step 2: `pbi_plan_opt` and `pbi_time_utilisation` (source month files, Glidepaths targets, shift mapping). Step 3: `pbi_daily_losses`. Step 4: the listeners (subscribe object) and the month range parameters |
| **Design** | Staging tables are never stored: the intermediate results exist only in the memory of a run. A check log (rows read and written, rows without a match) takes their place |

## Job (the inject payload)
`{"tables": ["pbi_machine_names", "pbi_shift_naming", "pbi_calendar"], "sites": ["Hull", "Nottingham", "Weinheim"]}`. Both lists are optional (missing = all). An unknown table or site is refused before anything runs. Dry run per table: `DRY_RUN` in node `1.1 TASK SETTINGS`.

## Tables
| Table | Source | Rule (from the load queries of the report, read with `helper-pbit-outline.js`) | File |
|---|---|---|---|
| `pbi_machine_names` | `eu_report/reference/machine_names/site=<Site>/*.csv` (newest .csv of the folder) | Hull: no `GT4 - Auto`, Dept `Dries Pack` or `Liquids Pack`. Nottingham: Area `SD Packing` or `Strepsils Packing`. Weinheim: all rows. `unique_machine_name` = machine + `-` + site. One file for all sites | `pbi_machine_names/pbi_machine_names.parquet` |
| `pbi_shift_naming` | `eu_report/reference/shift_naming/site=All/*.csv` | the distinct `Shift` values (Afternoon, Blue, Day, Gold, Green, Night, Red) | `pbi_shift_naming/pbi_shift_naming.parquet` |
| `pbi_calendar` | generated | 2011-01-01 to 2050-12-31 (as the report), 14610 rows, Monday week start, ISO week number | `pbi_calendar/pbi_calendar.parquet` |

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
