# Provideam fetch: the daily source files from the Provideam API

| At a glance | |
|---|---|
| **What** | VFC tab `Provideam fetch` (`flows/vfc-provideam-fetch.json`, 50 nodes): every day it calls the Provideam report API for each site, report type and production day, writes the source CSV of the day to `<root>/pbi_report/source/<type>/site=<Site>/<type>_<YYYY-MM-DD>.csv`, then sends one job `{sites, days}` to `PBI report build` and `PBI report build 2`, which write the report tables as day files |
| **Replaces** | The SharePoint exports (Power Automate, normalizer, upload by hand) and the lake watcher tab `PBI report listener` (removed 2026-11-02) |
| **Schedule** | Every day 07:00 UTC; the last 3 production days, fetched again every day so late corrections arrive (`DAYS_BACK` in node 1.1). Backfill: inject `{"start","end"}` or the Run monitor (flow `provideam-fetch`), 14 days at most |
| **Days** | From `FIRST_DAY` = 2026-11-01 on. The months up to October 2026 are month files and are never touched by this tab (October 2026 was rebuilt from the API once, [provideam-reports.md](provideam-reports.md)) |
| **Sites** | `SITES` in 1.1: Hull, Nottingham. Weinheim is left out (no rows since 23 Oct 2026). A site also needs `reportSource: 'provideam'` in `1.1 CONFIG` and its four body files |
| **Settings** | API key: `provideam: {baseUrl, apiKey}` in `1.1 CONFIG` (Config tab, placeholder in the committed flow; the Run monitor hides it). Report bodies: `<root>/reference/provideam_reports/site=<Site>/<type>.json` |
| **Dry run** | `DRY_RUN = true` in 1.1 by default: calls and converts, writes no file, starts no build; the log shows the row counts |
| **Test** | `node scripts/test-vfc-provideam-fetch.js` (fake API, made-up rows). Real-data proof 2026-11-02: see Checks |

## Flow
| Lane | Nodes |
|---|---|
| 1 TRIGGERS & FETCH SETTINGS | clock 07:00 UTC, backfill inject, link in `provideam-fetch BACKFILL` -> `1.1 FETCH SETTINGS (edit here)`: one task `{site, type, day}` per day, site and type |
| 2 CALLS | split, one call per 2 s, `Set body file`, read object, `Build Provideam request` (day as `pdDay`, header `apiKey`, `application/json-patch+json`), http request, `Make source CSV` |
| 3 WRITE SOURCE FILE | write object (a rerun of the day replaces it) |
| 4 RUN DONE | join (sends on the last task, `msg.complete`, or after 10 min), `Build the build job`, wait 30 s, link outs `to pbi-report BACKFILL` and `to pbi-report-2 BACKFILL` (connect them by hand after import, as the Run monitor's) |
| 5 to 7 ERRORS, LOG, LOG WRITE | the shared log lanes, `logs/provideam-fetch/log_YYYY-MM.csv` |

A day goes to the build when all four types of at least one site came back. The build tabs list the source folder and read only the files that exist, so a missing file is logged and skipped there. A lost call (no answer, missing body file) holds the join until its 10-minute timeout; the log counts it and the next day's run fetches the day again.

## Report types and calls
| Type | Path | Body (lake file) | Rows kept |
|---|---|---|---|
| `plan_opt` | `/api/v1/Report/ObjectByPeriod` | daily report 23 (Hull) / 28 (Nottingham) | all but the grand total |
| `run_rates` | `/api/v1/Report/ObjectByPeriod` | daily report 30 / 27 | all (hours 06:00 to 05:00 of the production day) |
| `line_losses` | `/api/v1/report/objectmodelog` | Mode Log body built 2026-11-02 (`fdPartDesc` as part) | all but `Run` events |
| `volume_loss_correction` | `/api/v1/report/periodbyobjectandloss` | loss body built 2026-11-02 (`losses` parameter required) | the groups in `keepTypes` of the body file |

Body file: `{"note": ..., "body": <Provideam request>, "keepTypes": [...]}` (`keepTypes` only for the correction). The flow only sets `periods`. Machines: the ids of every machine that appears in the SharePoint exports of that type from 2024-12 to 2026-10 (machine ids mapped to names with `machine/get`); machines the exports never had (`GT4 - Auto` in losses, `N11 Auto`, Nottingham manufacturing lines) are left out. To add a machine: add its id to the body file in the lake, no flow change. The files are kept locally in `sharepoint/reference/provideam_reports/` (git-ignored, they hold customer machine ids).

The CSV text rules are those of the October check ([provideam-reports.md](provideam-reports.md), "Source CSV rules"), with one change: run rates keep the hours of the production day (06:00 to 05:00 the next morning), not calendar hours. The October 2026 run rates month file got the hours 1 Nov 00:00 to 05:00 (production day 31 Oct) once, so the two meet without gap or overlap.

## Build tabs with days
`PBI report build` and `PBI report build 2` accept `{"tables", "sites", "days": ["YYYY-MM-DD", ...]}`: a day is used where a month is used, `plan_opt_2026-11-01.csv` in, `Plan_OPT_EU_2026-11-01_provideam.parquet` out. Changed nodes: `1.1 TASK SETTINGS` (days), `Store ... months` (recognise day files). Every job also rewrites the per-site files (`Format_List_EU`, `Site_PDT_Targets`, `Site_UPDT_Targets`) from the reference files. The job queue nodes of the removed listener are gone (2 nodes per tab).

## Checks (2026-11-02)
- The 8 lake bodies called live for 1 Nov 2026: HTTP 200, 1.6 to 5 s each.
- The tab run offline on those real answers: the 8 day files are line for line the text of the converter proven on October (only difference: `GT4 - Auto` and `N11 Auto` plan rows, kept because they are in earlier exports; the build drops them as before).
- Both build tabs run offline (`scripts/local-report-build.js days=2026-11-01 root=<copy>`) on those files: 0 errors, `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU`, `Run_Rates_EU`, `Volume_CoV_EU` written as day files for Hull and Nottingham.
- Not run in the VFC yet.

## Import (VFC)
First run `node scripts/make-local-config.js`: it writes [flows/vfc-config.local.json](../flows/vfc-config.local.json), the committed Config with platform, tenant, technical user and Provideam key filled from `.env` (git-ignored). The other files hold no secret: import them straight from `flows/`. Do not use the older `flows/*.local.json` copies of the other tabs (2026-10-20, old schema).

| # | Import this file | Replaces tab | After import |
|---|---|---|---|
| 1 | [flows/vfc-config.local.json](../flows/vfc-config.local.json) | `Config` | nothing to fill; click Apply |
| 2 | [flows/vfc-pbi-report.json](../flows/vfc-pbi-report.json) | `PBI report build` | node `1.1 TASK SETTINGS (edit here)`: `DRY_RUN` of the 3 tables to false |
| 3 | [flows/vfc-pbi-report-2.json](../flows/vfc-pbi-report-2.json) | `PBI report build 2` (new tab) | node `1.1 TASK SETTINGS (edit here)`: `DRY_RUN` of the 5 tables to false |
| 4 | [flows/vfc-provideam-fetch.json](../flows/vfc-provideam-fetch.json) | `Provideam fetch` (new tab) | connect link out `to pbi-report BACKFILL` to link in `pbi-report BACKFILL` (tab 2) and `to pbi-report-2 BACKFILL` to `pbi-report-2 BACKFILL` (tab 3) |
| 5 | [flows/vfc-run-monitor.json](../flows/vfc-run-monitor.json) | `Run monitor` | node `2.1 Build monitor page`: `COMMAND_KEY` again; connect its 5 `to <flow> BACKFILL` link outs |
| 6 | (none) | `PBI report listener` | delete the tab |

Then Deploy, and in `Provideam fetch` click `Backfill (edit payload)` (1 to 2 Nov) with `DRY_RUN = true` in node `1.1 FETCH SETTINGS (edit here)`: the debug `Run log` shows the row count per site and type. If it looks right, set `DRY_RUN = false` and click it again.
