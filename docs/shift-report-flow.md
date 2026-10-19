# Shift report flow (line and machines)

| At a glance | |
|---|---|
| **What** | One VFC tab per site that writes three tables for the shift (management) report: `rpt_window`, `rpt_hour`, `rpt_event`. For every report line of the Config tab (B2 Line) it writes the line rows (phase 1) and the rows of its machines (phase 2). Both phases ran in the VFC for 14 and 15 Sep 2026 and were checked against the OEE app |
| **Flow** | `flows/vfc-rpt-hull.json` (tab `Hull shift report`). Generator `scripts/build-vfc-rpt-flows.js`, code `scripts/vfc/q*.js` plus the `s*` and `d*` nodes of the Power BI daily flow, columns `scripts/lib-rpt-schemas.js` |
| **Status** | Phases 1 and 2 done and checked (2026-10-19). Mock tests pass (`node scripts/test-vfc-rpt.js platform=legacy` and `platform=xcelerator`, 74 checks). `dryRun` is true by default. What is left: `docs/shift-report-flow.md` section "Open points and next steps" and the handover note `session_handover/shift-report-handover.md` (local, git-ignored) |
| **Needs** | The Config tab, re-imported: sites have `dayStartLocal`, `timeZone`, `reportLineIds` and `reportExcludeNames` |
| **Design** | `prompt-response/shift-report-data-map.md` (3 tables, data lake layout, test results) |

## Tables and files
One file per table, site and production day, `<root>/shift_report/<table>/site=<site>/<table>_YYYY-MM-DD.parquet`. A rerun replaces the file. Log: `<root>/logs/rpt-hull/log_YYYY-MM.csv`. Every table starts with `site`, `line_id`, `line_name`, `asset_id`, `asset_name`, `asset_level` (`line`; `machine` from phase 2), `production_day` (text). Times are epoch milliseconds (TIMESTAMP_MILLIS, UTC); local date and time are extra text columns.
| Table | One row is | Notes |
|---|---|---|
| `rpt_window` | asset x window: the production day (`window_kind` = `day`) and every run of hours in one shift (`shift`) | KPIs summed from the hourly values; the ratios are calculated again from the sums with the formulas of the OEE app (availability = net production time / operational time, performance = total / theoretical output, quality = good / total, OEE = the three multiplied). Capacity and loss units = design speed per minute x minutes, per hour. `ran_min`, `fault_min`, `operator_min`, `waiting_min`, `planned_min`, `other_min` are null in phase 1 (machine rows, phase 2) |
| `rpt_hour` | asset x hour | shift, product, order (`batch_id`), parts, minutes, speed per minute, capacity |
| `rpt_event` | one stop | `event_kind` = `microstop`, `planned` (reason root in Config `plannedRoots`) or `unplanned`; reason, reason path, minutes, comment count, product and order of its hour, loss units. About 300 rows per line and day (machines will add about 1,500) |

## Settings
- Config tab, per site: `reportExcludeNames` (names of machines to leave out, empty; the commented line `// '05 Antares'` shows how), `dayStartLocal` (whole hour from 2 to 23, local clock), `timeZone` (only `Europe/London` so far; any other value stops the flow with an error), `reportLineIds` (the lines of the report). `dayStartHour` stays for the UTC day of the Power BI and fact flows.
- Tab node `1.1 SITE SETTINGS`: `SITE_NAME`, `DRY_RUN`, `REBUILD_DAYS`, `REPORT_FOLDER`, `FOLDER_PREFIX`.
- Schedule: daily 08:00 UTC, builds the days that ended at least two hours before (`GRACE_HOURS` in `1.2`) and the `REBUILD_DAYS` days before. Backfill: edit the inject payload.

## Phase 2: the machines of a line
- **Found automatically.** For every report line the flow asks Asset Management for its children (`GET /assets?filter={"parentId":...}`, tested on B2 Line: 7 children) and keeps those that are configured OEE assets (from the OEE asset list of the same run). A machine added to the line comes in at the next run. Nothing is listed in Config except the exclusions (`reportExcludeNames`). The machine rows have `asset_level` = `machine`, and `line_id` and `line_name` of the line.
- **Same lanes as the line.** A machine goes through the same steps (KPIs per hour, calendar, products and orders, stops). The probe of 2026-10-19 (step G) showed that every machine of B2 Line has the same calendar and the same product collection as the line, and its own `filterValues`: on 15 Sep the line had no order, `05 Antares` and `07 Palletiser` had 2 orders each. So the orders of a day are found on machines, not always on the line.
- **Group minutes** (`ran_min`, `fault_min`, `waiting_min`, `planned_min`, `other_min`, machine rows only): one `POST /assets/{id}/timeModelCategoryDistribution` per machine and day, the segments cut to each window. `Run` = ran, `Unplanned Downtime` = faults, `Lack of resources` = waiting, `Planned Downtime` = planned, everything else and segments without a category = other. They add up to the length of the window. The line rows keep them empty (the line has hours without a category).
- **Operator stops are not separated** (`operator_min` is empty, they stay in the groups above; decision of the user 2026-10-19, "others first"). Why: there is no field for it. The stop list is `GET /assets/{id}/downtimeReasons`; the reason of every stop comes from the machine status mapping (`GET /stateTables/{id}/states` maps a PLC state code to a reason of the reason tree `GET /reasontrees/{id}/reasons`), and the time category comes from the segments. A person only enters the picture when they overwrite a reason (`userId`, `overwritten`, `changedAt` on the row): on 15 Sep none of the 1,785 stops of the 7 machines had any of the three. So the data cannot tell an operator stop from a machine fault; Hull or Reckitt must say which reasons of the tree count as operator stops, and then it is a rule on the reason (or a branch of the tree).
- **Waiting for all assets.** The number of assets of a day is known only after the machines of every line are found. A first join waits for the machine lists of all lines (small answers), node 2.7 then sends one message per asset with `msg.parts` for the whole day, and the join of stage 10 collects the results as in the Power BI flows. A day is written once, with every line and machine; a failed machine list or machine fails the day (no half days). **The rows are never kept in the flow context**: the VFC refuses a context value over 2 MB (error `Maximal size of 2097152 bytes is exceeded`), which a busy day of 8 assets (about 1,800 stops for the line and its machines) goes over. The test runner has the same limit, and `test-vfc-rpt.js` runs a day with 3 x 1,800 stops.
- **Cost.** About 10 calls per machine and day plus one filtered KPI call per product and order of the machine; one call per second. B2 Line with 7 machines is about 8 times the calls of phase 1.

## The production day
Starts at `dayStartLocal` local time, so it is 23, 24 or 25 hours long. Node `1.2 Build day list` puts the exact window on every message (`dayFromMs`, `dayToMs`). The reused request nodes (`s3-kpi-request`, `d7-value-request`, `d7-values-request`, `d4-events-request`, `s4-stops-request`) use them when present and otherwise keep their old rule (day start hour in UTC, 24 hours), so the Power BI and fact flows are unchanged (proof: `test-vfc-pbi-direct`, `test-platform-switch`). Hours are the hours of that window, one KPI hour per UTC hour.

## Phase 2 tests (offline)
`node scripts/test-vfc-rpt.js platform=legacy|xcelerator` (74 checks): the line and its two OEE machines are found, a child that is no OEE asset is not, the exclusion line works, group minutes add up to the window (day and shift), the line has none, time segments are asked for machines only, machines have their own orders, two lines are written once, a failed machine list or failed segments write nothing. Also a busy day (3 x 1,800 stops) with the 2 MB context limit of the VFC. The real API for the machines was checked afterwards, see the next section.

## Checked on real data, phase 2 (15 Sep 2026, 2026-10-19)
The tab was run for 14 and 15 Sep with write on (files in `reports/shift_report/`, downloaded with `node scripts/datalake-download-tree.js reports/shift_report/ --out downloads/<new folder>`; the downloader skips files of the same size, so use a new folder for every check).
| Check | Result |
|---|---|
| Files | 8 assets (the line and 7 machines): 24 window rows, 192 hour rows, 1,952 event rows. Line rows `asset_level` = `line`, machine rows `machine`, one `line_id` and `line_name` |
| Day window against the OEE app, per asset | Availability, performance, quality, OEE, total and good parts, theoretical output and downtime equal for the line and all 7 machines (Antares has 28 KPI values and also matches) |
| Group minutes against the time segments of the app | Equal for every machine; the groups add up to 1,440 min per day and 720 min per shift; the line rows are empty |
| Shifts | Two windows per asset, Gold (05:00 to 17:00 UTC) and Green (17:00 to 05:00 UTC) |
| Events | No duplicates, no negative minutes. Stop minutes equal the KPI downtime for the line, DePalletiser, CasePacker, Palletiser and Antares. Filler, Labeller and Cartoner are 15 to 20 min lower: one stop each starts before the window and is dropped whole (same rule as `pbi_daily_losses`) |
| Orders | The line has none; `05 Antares` and `07 Palletiser` carry the same two orders |
| Event kinds | All `unplanned`: no planned reason occurred that day (planned stops are untested) |

## Open points and next steps
Decisions for the user:
1. **Stop that starts before the window.** Cut it at the window start (its minutes inside the window count) instead of dropping it. Recommended: cut. Then the events add up to the KPI downtime per day and per shift. Change in `scripts/vfc/q8-event-rows.js` (and its mock test).
2. **Order of the line.** The line has no order on 15 Sep, its machines Antares and Palletiser have. Decide whether the line rows show the order of the machines (a rule such as "the line takes the order of its machines").
3. **Antares.** Keep it (it has no stops, but it is the order source), or exclude it with `reportExcludeNames`.

Waiting on Hull or Reckitt: the rule for operator stops (which reasons of the tree), costs, batch targets, changeover and clean targets, comment text (Provideam), the Power BI summer time shift question (the Power BI flows still read the calendar rules as UTC; left unchanged on purpose).

To build or test:
- `rpt_counter` (filler reject counters; needs a time series address `tsBase` in Config, sparse and cumulative counters, see the data map).
- GT4 (manual asset: product, order, stops and segments differ; `timeModelCategoryDistribution` is refused for manual assets).
- Probe tests not done: changeover exactness (`node scripts/test-shift-report.js 2026-10-08 steps=D`) and a day with planned stops.
- Backfill about 30 days for the trend, then the schedule (08:00 UTC) live. Runtime of a long backfill not measured.
- Tableau: how it reads the `site=` folders, the report layout, PDF and email.

## First run in the VFC
1. Re-import the Config tab and run it (fill client, secret, platform, tenant ID as before).
2. Import `flows/vfc-rpt-hull.json`, run the backfill with one day and `DRY_RUN` true. The log line gives windows, hours and events per asset.
3. Compare the day row of `rpt_window` with the OEE app for the same window (OEE, availability, performance, quality). This checks the recalculated ratios against the app; if they differ, the sums are not linear for that KPI and the window needs its own `evaluateKPIs` call.
4. Set `DRY_RUN` false, write one day, read the three files.

## Checked on real data (14 and 15 Sep 2026, B2 Line, 2026-10-19)
Files downloaded with `node scripts/datalake-download-tree.js reports/shift_report/` (the user's root is `reports`).
| Check | Result |
|---|---|
| Files and rows | Per day 4 window rows, 24 hour rows, 246 and 183 event rows; all columns and types as in the schema; no duplicate stops, no negative minutes |
| Day window against the OEE app (`evaluateKPIs` for the same window) | 15 Sep: availability 0.7028, performance 0.8495, quality 0.9968, OEE 0.5951, theoretical output 118,226.2 and net production time 1,012.0 min all equal. 14 Sep: availability, quality, parts, downtime and micro stops equal. So summing the hours and recalculating the ratios gives the app values |
| Against the Provideam Plan OPT files | Day totals of good parts: 14 Sep 114,339 equal; 15 Sep 100,112 against 99,812 (0.3 %, the real file may be older or edited) |
| Days without a product | 14 Sep has no product (as in the Power BI tables): product columns, capacity, performance and OEE are null, in the app too (theoretical output 0) |
| Events | Minutes of the stops add up to the KPI downtime (303.71 against 303.76 min; one stop that starts before the day is dropped, the same rule as `pbi_daily_losses`) |
| Order | No order on these days: `batch_id` null everywhere |

**Found and fixed: the shifts were one hour late in summer.** The real shifts run 06:00 to 18:00 local (05:00 to 17:00 UTC in BST): the good parts of 05:00 to 17:00 UTC equal the Provideam day shift (70,182 and 55,487). The calendar rules hold the local wall clock time written with a Z (`dtstart` 18:00:00Z for the night shift), and the first version read them as UTC, so the shift windows were 06:00 to 18:00 UTC and left a 1 hour piece at each end of the day. Now the shift of an instant is looked up on its local time (`q7-tag-hours.js`, `q8-event-rows.js`). **The Power BI flows (`pbi_plan_opt`, `pbi_daily_losses`) still read the rules as UTC**, so in summer their shift of one hour per shift change is wrong (left as it is on purpose, see the decision below).

**Second run (2026-10-19, after the fixes, 14 and 15 Sep written again).** Two shift windows per day, 05:00 to 17:00 and 17:00 to 05:00 UTC (06:00 to 18:00 and 18:00 to 06:00 local), 12 hours each. Every shift window and the day window equal the OEE app for the same window, in all columns that were compared: parts, availability, performance, quality, OEE, theoretical output, downtime, performance loss, quality loss, net operational and used operational time (to 4 decimals, 15 Sep day window and both shifts, 14 Sep day shift). The good parts of the two shifts equal the Provideam file on 14 Sep (70,182 and 44,157) and for the day shift of 15 Sep (55,487); the night shift of 15 Sep is 44,625 in the app and ours against 44,325 in the file (the file is older or edited). Shift names: Gold and Green in the calendar, Blue in the Provideam file.

**Decision (user, 2026-10-19):** the Power BI flows are not changed for the summer time shift yet: the Power BI tables are regional and it is not clear whether a time distinction is needed there.

**Found and fixed: loss times of a window.** The first version summed the hourly performance and quality losses, which differs from the app (performance loss 132.8 against 152.3 min on 15 Sep) because the formula is not linear. Now they are worked out from the window ratios as in the app.

Not explained: the crew names. The Provideam file says `Blue` for both shifts of 14 and 15 Sep, the calendar rotates Red, Gold, Blue, Yellow, Green. Names may differ (accepted before), the structure is the same.

## Limits and open points
- `operator_min` is empty until the operator stop rule is defined. The line rows have no group minutes.
- Each machine repeats the calendar and product calls although it shares them with the line (simple, more calls); the product and order of the line could be reused later.
- GT4 is a manual asset: product and order, stops and segments differ. Same concept, to test later.
- Shift windows come from whole hours (shift changes at whole hours). A shift that starts at a half hour is rounded to the hour grid.
- Not built: reject counters (`rpt_counter`, needs a time series address in Config), comment text (source is Provideam), batch targets and costs.
