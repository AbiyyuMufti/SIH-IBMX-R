# PBI report build: how to test everything (VFC), and notes for remote work

| At a glance | |
|---|---|
| **What** | One checklist for the flow `flows/vfc-pbi-report.json` (tab `PBI report build`): what to import, what to run in which order, what you should see, how to check the files in the data lake, and what to send back when something is wrong |
| **State of the build** | Steps 1 to 3 are built (6 tables). Steps 1 and 2 ran in the VFC for the three small tables; plan OPT, time utilisation and daily losses passed the offline tests and the real-data runs but have **not run in the VFC yet**. Details of the rules: [pbi-report-build.md](pbi-report-build.md) |
| **Files** | Input in the lake: `eu_report/reference/` (14 files) and `eu_report/pbi_report/source/` (204 month files). Output: `eu_report/pbi_report/report/<table>/` |
| **Dry run** | Every table is `true` in `DRY_RUN` of node `1.1 TASK SETTINGS`. Nothing is written until you set a table to `false` and deploy |

## 1. Import and prepare (once)
1. The Config tab must be deployed (`flows/vfc-config.json`, real credentials in your local copy). The new flow only needs its global settings, it makes no API call.
2. Import `flows/vfc-pbi-report.json` as a new tab (replace the older copy of the tab). It is generated: never edit the JSON, change `scripts/vfc/b*.js` or `scripts/build-vfc-pbi-report-flow.js` and rebuild (`node scripts/build-vfc-pbi-report-flow.js`).
3. Open node `1.1 TASK SETTINGS (edit here)`: the three folders (`IN_REFERENCE`, `IN_SOURCE`, `OUT_ROOT`), `ALL_SITES` and `DRY_RUN` per table are the settings.
4. Look at the debug sidebar: the node `Run log` shows every log line (the same lines go to a CSV in the lake under `<root>/logs/pbi-report/`, `root` = the Config setting).

## 2. The job (inject payload)
`{"tables": [...], "sites": [...], "from": "YYYY-MM", "to": "YYYY-MM"}`. Everything is optional: no tables = all six, no sites = Hull, Nottingham, Weinheim, no months = last month and this month. A table name or site that is not known, or `from` after `to`, is refused before anything runs.

## 3. Test order
| # | Payload | DRY_RUN | You should see |
|---|---|---|---|
| 1 | `{"tables":["pbi_machine_names","pbi_shift_naming","pbi_calendar"]}` | any | Checked on 2026-10-15: 60 machines, 7 shifts, 14,610 dates (already written, week numbers fixed) |
| 2 | `{"tables":["pbi_plan_opt","pbi_time_utilisation"],"sites":["Hull"],"from":"2026-09","to":"2026-09"}` | true | log lines `CHECK Hull 2026-09: read 967 rows, plan 823 (left out 144), time utilisation 435 machine-days ...` and two `DRY RUN: ... rows`. No error. Node status under `Build plan rows` and `Pick the file` shows the paths it reads |
| 3 | same, `DRY_RUN` of the two tables `false` | false | two files `pbi_plan_opt/site=Hull/pbi_plan_opt_2026-09.parquet` and `pbi_time_utilisation/...`; log `WRITING pbi_plan_opt 823 rows` |
| 4 | `{"tables":["pbi_daily_losses"],"sites":["Hull"],"from":"2026-09","to":"2026-09"}` | true | `CHECK Hull 2026-09: read 16048 rows, kept 10493 (...) no loss units 17, no equipment 753, no target 1121` and `DRY RUN: pbi_daily_losses 10493 rows` (numbers of 2026-10-15; the current month file changes every hour, so they differ a little) |
| 5 | same, `DRY_RUN` of `pbi_daily_losses` `false` | false | one file `pbi_daily_losses/site=Hull/pbi_daily_losses_2026-09.parquet`. **Watch the memory and the time of this node: it holds about 10,000 rows with 29 columns** |
| 6 | all three sites, `from 2026-08 to 2026-09`, all tables | false | 18 month files. Nottingham has the biggest loss month (about 19,000 rows) |
| 7 | the backfill: all tables, all sites, `from 2024-12 to 2026-10` | false | one month per second per site (a month message is delayed 1 s), about 70 months: plan 70 + time utilisation 70 + losses 70 files. Weinheim starts in 2025-01. Expect a few minutes. Months without a source file are logged `no plan_opt file for ... skipped` |

Between runs you can write only one table: set its `DRY_RUN` to `true` and the others to `false`, or give one table in the job.

## 4. Check the files in the lake (from the laptop)
```
node scripts/datalake-download-tree.js eu_report/pbi_report/report/      (read-only, skips files of the same size)
python -I scripts/helper-check-pbi-report.py                              (downloads/eu_report/pbi_report/report)
```
The checker prints per table: files, rows, schema (names and types), empty shares of the key columns, duplicates, rows per month and site; machine names and plan OPT are compared with the report's own tables (`C:\WORK\IBM-RECKITT\ReportReplica\Seguns\`). Expected: `problems: 0`, plan OPT about 99.8 % identical rows for the months the report has (it stops on 18 Sep 2026, so September differs), loss unit and equipment shares like in the real-data run (units 99.8 to 100 %, equipment 84 to 99 %, targets 80 to 99 %).

Offline, without the VFC (data of the laptop, no network): `node scripts/test-vfc-pbi-report.js platform=xcelerator` (77 checks on small synthetic files) and, with the real local files, `... real plan dir=<dir>` and `... real loss from=2026-08 to=2026-09 dir=<dir>` (they write json files that can be compared with the report, see the commands in the doc of the script).

## 5. What is not proven yet (say if one of them goes wrong)
- Plan OPT, time utilisation and daily losses in the VFC: flow context between nodes (lookups are stored with `flow.set` and read by the nodes after them), `list objects` on the month folders, one month per second, the size of a loss month (Hull Dec 2024 has about 30,000 rows in the source; the daily loss table of a month has up to 19,000 rows).
- The loss table has no sample in the report folder: the rules come from the report's queries (Daily Line Losses H, N, W, Volume Loss Correction, Equipment Coding, Targets). It was checked for plausibility, not against the report.
- Mira: no files, no table.

## 6. What to send back when something fails
The `Run log` lines (copy the red or FAILED ones and the `CHECK` lines of the run), the node name and its status text, the payload of the inject, the number of the month. If a node stops without a log line: the node status of the last node that turned green. For a wrong value: table, site, month, machine and the value you expect.

## 7. Notes for remote work (the laptop stays in the office)
Things Claude can do on the laptop while you are away, and where everything is:
- **Look at the lake:** list/download/verify (`datalake-download-tree.js`, `datalake-verify-tree.js`, `datalake-download.js list <folder/>`), nothing is written by these.
- **Check the new files:** `helper-check-pbi-report.py` after a VFC run (download first). Also the offline tests above. The comparison of plan OPT with the report is the strongest check we have.
- **Analyses that are open** (ask for any of them):
  1. Compare `pbi_daily_losses` of one month with the report's own numbers once you have an export of its Daily Losses EU or the Top 5 Loss Categories page for a known filter (the file `Top 5 Loss Categories.xlsx` has the loss shares per subgroup for the EU, the filter is not known).
  2. Explain every difference between our plan OPT and the report's (99.8 % identical; the rest is data after the report snapshot and the Hull December 2025 gap).
  3. Look for loss rows without loss units, equipment or target and list the names that need a mapping (the `CHECK` lines count them; the lists of names are in the data).
  4. The Hull Plan OPT gap of 16 Dec 2025 and the 17 Dec 2025 conflict between two daily files (see [sharepoint-files.md](sharepoint-files.md)).
  5. Normalizer and upload refresh: `python -I scripts/normalize-sharepoint-source.py` then `node scripts/datalake-upload-tree.js sharepoint/source eu_report/pbi_report/source --only sharepoint/normalize-changed.txt --overwrite` (only when new downloads arrived; the download watcher is off, see NOTES).
- **Not for remote work:** deleting in the lake, a change of the Config or credentials, running the flow in the VFC (only you can).
- **Where the rules came from:** the report's load queries, read with `node scripts/helper-pbit-outline.js "<the .pbit>" --table "<table>"` (the files are outside the repo in `C:\WORK\IBM-RECKITT\ReportReplica\`). Every mismatch with the report found a rule: use the same method for the loss table when a sample exists.
- **Bugs and the written report:** planned after your tests; send the lines from section 6.

## 8. Test of the lake watcher (step 4)
Two tabs: import `flows/vfc-pbi-report.json` (replaces the report tab: your hand-made `JOB DONE` nodes are gone from it, they now live in the listener tab) and `flows/vfc-pbi-listener.json` (new tab). Then:
1. **With every table `DRY_RUN` = true in node 1.1:** upload one changed file, for example `node scripts/datalake-upload-tree.js sharepoint/source eu_report/pbi_report/source --only <list with one plan_opt month> --overwrite`. In the listener tab the node `Read source event` shows a green status within seconds and `Collect events` shows `1 waiting`. After 2 to 2.5 minutes `Listener log` shows `[listener] JOB Hull source files changed: {"tables":[...],"sites":["Hull"],"from":"2026-09","to":"2026-09"}`; within 10 s the report tab takes it (status of `1.0 Take queued job`) and the `Run log` shows the dry-run lines of that month. `JOB DONE` follows about 30 s after the last line.
2. **With the three month tables `false`:** the same upload, and the three month files of that site and month are replaced (the lake time stamp changes).
3. **Reference:** overwrite one Glidepaths file; after 5 to 5.5 minutes one job for that site with the months `REFERENCE_MONTHS_BACK` back.
4. **Switch:** set `LISTENERS_ON = false` in `Collect events`, upload a file: the status says `listeners OFF` and no job follows.
Send back: the `Listener log` lines, the node status of `Collect events`, `Release due events` and `1.0 Take queued job`, and whether an event arrived at all (the subscribe nodes are untested with an `--overwrite` upload; the UI replace gave `MODIFY`, see [datalake-files.md](datalake-files.md)).

## 9. After the rename to the Tableau column names (2026-10-17)
The tables now have the names and types of the Tableau workbook (see [pbi-report-build.md](pbi-report-build.md) "Step 5"). The files in the lake still have the old names until the flow runs again.
1. **Import** `flows/vfc-pbi-report.json` (replaces the report tab; the node count stays 195). The listener tab does not change. Do not open the parquet nodes of the month tables in the editor afterwards (a DATE column may reset to text).
2. **Run the backfill again** (the old files are replaced, the file names do not change), for example in three jobs: `2026-08` to `2026-10`, `2025-01` to `2026-07`, `2024-12` to `2024-12`, all tables and sites, `DRY_RUN` false. The three small tables: machine names has the new names; shift naming and calendar are unchanged.
3. **Download and check:**
```
node scripts/datalake-download-tree.js eu_report/pbi_report/report/
node scripts/datalake-download-tree.js Sandbox/report_test/ --out downloads/sandbox-report-test
python -I scripts/helper-check-pbi-report.py
```
Expected: `problems: 0` (schemas equal to the workbook), machine names identical sets, plan OPT about 99.8 % identical rows, time utilisation and daily losses compared with Segun's tables (the percentages in "Step 5"). The offline version of the loss comparison: `node scripts/test-vfc-pbi-report.js platform=xcelerator real loss from=2025-01 to=2026-09 dir=downloads/offline-cmp` writes `loss.json` with the Tableau names.
4. **Tableau:** Replace Data Source on a copy of the workbook; the first things to look at are the date fields (real dates), `Value` (text) and `Time` / `Duration` (1970-01-01 instead of 1899-12-30).
