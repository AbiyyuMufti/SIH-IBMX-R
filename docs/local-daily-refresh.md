# Local daily refresh of EU_OEE_Fact

| At a glance | |
|---|---|
| **What** | A task on this PC that fetches the Provideam data of the last 4 production days after 07:10 UTC (07:10 UK in winter), builds the report tables with the VFC flow code, builds `EU_OEE_Fact` (65 columns) and uploads the changed month files of Hull, Nottingham and Weinheim. Used while the VFC flows ([eu-oee-fact-flows.md](eu-oee-fact-flows.md)) are not imported |
| **Script** | [scripts/local-daily-refresh.js](../scripts/local-daily-refresh.js), guard [scripts/eu_oee_fact_refresh_guard.py](../scripts/eu_oee_fact_refresh_guard.py) |
| **Run** | `node scripts/local-daily-refresh.js` = dry run (everything but the lake write); `--upload` writes; `--force` ignores the 07:10 UTC rule; `--end=YYYY-MM-DD`, `--days=4` |
| **Task** | Windows Task Scheduler `EU OEE Fact refresh`, once, 2026-11-13 14:15 local (= 07:15 UTC; this PC is UTC+7). Runs only while the user is logged on and the PC is on |
| **Folder** | `parquet/daily_refresh/` (git-ignored): `parts/` working copy of the lake tables, `lake/` reference files and fetched day files, `build_*`, `out_*`, `backup_*` (the live fact files before the upload), `upload_*`, `logs/`, `last-run.txt` |
| **Status** | Dry run passed 2026-11-13 06:07 UTC (Hull 4,243 to 4,583 rows, Nottingham 10,016 to 11,031, Weinheim 433 to 503). The 14:15 run uploads |

## Steps and guards
1. Refresh `eu_report/reference/` and `report/Dim/` from the lake (read only), fetch the window from the real Provideam API (key from `.env`), build the 8 report tables for the window with `local-report-build.js`, overlay them on `parts/`.
2. `eu_oee_fact_rr_build.py build` and `check`: stops on any `FAIL` (stacking parity, targets, Run Rate vs Plan).
3. Download the live `EU_OEE_Fact` files into `backup_<stamp>/`, then the guard: schema equal to the live file, no Null-typed column, same row count per record type before the window, rows on or after the window start. Any failure: nothing is uploaded.
4. Upload the month files of the window's months (Hull, Nottingham, Weinheim only; Chartres is never touched), then `datalake-verify-tree.js` with 3 byte-compared samples.

The result is in `parquet/daily_refresh/last-run.txt` (`OK`, `FAILED`, `SKIPPED`) and the log of the run.

## Roll back
Upload the backup of that run: `node scripts/datalake-upload-tree.js parquet/daily_refresh/backup_<stamp>/eu_report/report/EU_OEE_Fact eu_report/report/EU_OEE_Fact --overwrite`.

## Daily
Replace the one-time task with a daily one: `schtasks /create /tn "EU OEE Fact refresh" /sc daily /st 14:15 /f /tr "cmd /c cd /d C:\WORK\IBM-RECKITT\SIHExplorationAPI && \"C:\Program Files\nodejs\node.exe\" scripts\local-daily-refresh.js --upload"`. 14:15 local is 07:15 UTC only while the UK is on winter time and this PC stays on UTC+7; the script itself waits for 07:10 UTC. Remove: `schtasks /delete /tn "EU OEE Fact refresh" /f`.

## Limits
- The lake tables of the report (`Plan_OPT_EU` and the others) are not updated, only `EU_OEE_Fact`: `parts/` keeps the days between runs.
- The first run seeds `parts/` from `parquet/rr_20261112/parts`.
- Days the window no longer covers keep what an earlier run built. A late correction older than 4 days is not picked up (`--days`).
- Once the VFC flows run, stop this task, or the month files are rewritten twice: see the cutover in [eu-oee-fact-flows.md](eu-oee-fact-flows.md).
