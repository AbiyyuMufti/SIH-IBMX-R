# Shift report flow (phase 1: the line)

| At a glance | |
|---|---|
| **What** | One VFC tab per site that writes three tables for the shift (management) report: `rpt_window`, `rpt_hour`, `rpt_event`. Phase 1 reads the report lines of the Config tab (B2 Line only), no machines yet |
| **Flow** | `flows/vfc-rpt-hull.json` (tab `Hull shift report`). Generator `scripts/build-vfc-rpt-flows.js`, code `scripts/vfc/q*.js` plus the `s*` and `d*` nodes of the Power BI daily flow, columns `scripts/lib-rpt-schemas.js` |
| **Status** | Mock tests pass (`node scripts/test-vfc-rpt.js platform=legacy` and `platform=xcelerator`). Not run in the VFC yet. `dryRun` is true by default |
| **Needs** | The Config tab, re-imported: sites now have `dayStartLocal`, `timeZone` and `reportLineIds` |
| **Design** | `prompt-response/shift-report-data-map.md` (3 tables, data lake layout, test results) |

## Tables and files
One file per table, site and production day, `<root>/shift_report/<table>/site=<site>/<table>_YYYY-MM-DD.parquet`. A rerun replaces the file. Log: `<root>/logs/rpt-hull/log_YYYY-MM.csv`. Every table starts with `site`, `line_id`, `line_name`, `asset_id`, `asset_name`, `asset_level` (`line`; `machine` from phase 2), `production_day` (text). Times are epoch milliseconds (TIMESTAMP_MILLIS, UTC); local date and time are extra text columns.
| Table | One row is | Notes |
|---|---|---|
| `rpt_window` | asset x window: the production day (`window_kind` = `day`) and every run of hours in one shift (`shift`) | KPIs summed from the hourly values; the ratios are calculated again from the sums with the formulas of the OEE app (availability = net production time / operational time, performance = total / theoretical output, quality = good / total, OEE = the three multiplied). Capacity and loss units = design speed per minute x minutes, per hour. `ran_min`, `fault_min`, `operator_min`, `waiting_min`, `planned_min`, `other_min` are null in phase 1 (machine rows, phase 2) |
| `rpt_hour` | asset x hour | shift, product, order (`batch_id`), parts, minutes, speed per minute, capacity |
| `rpt_event` | one stop | `event_kind` = `microstop`, `planned` (reason root in Config `plannedRoots`) or `unplanned`; reason, reason path, minutes, comment count, product and order of its hour, loss units. About 300 rows per line and day (machines will add about 1,500) |

## Settings
- Config tab, per site: `dayStartLocal` (whole hour from 2 to 23, local clock), `timeZone` (only `Europe/London` so far; any other value stops the flow with an error), `reportLineIds` (the lines of the report). `dayStartHour` stays for the UTC day of the Power BI and fact flows.
- Tab node `1.1 SITE SETTINGS`: `SITE_NAME`, `DRY_RUN`, `REBUILD_DAYS`, `REPORT_FOLDER`, `FOLDER_PREFIX`.
- Schedule: daily 08:00 UTC, builds the days that ended at least two hours before (`GRACE_HOURS` in `1.2`) and the `REBUILD_DAYS` days before. Backfill: edit the inject payload.

## The production day
Starts at `dayStartLocal` local time, so it is 23, 24 or 25 hours long. Node `1.2 Build day list` puts the exact window on every message (`dayFromMs`, `dayToMs`). The reused request nodes (`s3-kpi-request`, `d7-value-request`, `d7-values-request`, `d4-events-request`, `s4-stops-request`) use them when present and otherwise keep their old rule (day start hour in UTC, 24 hours), so the Power BI and fact flows are unchanged (proof: `test-vfc-pbi-direct`, `test-platform-switch`). Hours are the hours of that window, one KPI hour per UTC hour.

## First run in the VFC
1. Re-import the Config tab and run it (fill client, secret, platform, tenant ID as before).
2. Import `flows/vfc-rpt-hull.json`, run the backfill with one day and `DRY_RUN` true. The log line gives windows, hours and events per asset.
3. Compare the day row of `rpt_window` with the OEE app for the same window (OEE, availability, performance, quality). This checks the recalculated ratios against the app; if they differ, the sums are not linear for that KPI and the window needs its own `evaluateKPIs` call.
4. Set `DRY_RUN` false, write one day, read the three files.

## Limits and open points
- Phase 1: line rows only. Machines (7 on B2 Line, all OEE assets) need their ids in Config and a per-line list.
- GT4 is a manual asset: product and order, stops and segments differ. Same concept, to test later.
- Shift windows come from whole hours (shift changes at whole hours). A shift that starts at a half hour is rounded to the hour grid.
- Not in phase 1: time per group per machine, reject counters (`rpt_counter`, needs a time series address in Config), comment text (source is Provideam), batch targets and costs.
