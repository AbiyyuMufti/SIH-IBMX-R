# Shift (management) report: what data we have for it

| At a glance | |
|---|---|
| **What** | The existing B2 shift report (also called the management report) is to be rebuilt in Tableau: viewed live, downloaded as PDF, and sent by email. This page maps every part of it to the data we can get from Insights Hub, and lists what is missing |
| **Example used** | One PDF of the existing report: B2 Line, one production day in September 2026, 6 pages. Kept outside the repo (it holds batch numbers, operator comments and costs). No values from it are copied here |
| **Diagram** | Page 1 now shows 3 flow bands (calls to table) and a matrix (report block to table). `diagrams/shift-report-data-map.drawio`, made by `node scripts/build-drawio-shift-report.js`, checked by `node scripts/validate-drawio.js diagrams/shift-report-data-map.drawio` |
| **Result in one line** | The line figures are there already. The machine figures are in the API but not in our flows (7 machine assets, to test first). Missing: per-head fill weight and cap torque, costs, batch targets and work order, changeover and clean targets, product dumped, and the comment text until tested |
| **Status** | Analysis only. Nothing built. No API call was made for this page |
| **Checked** | 2026-10-19 against master `4dcee16` (PBI report build, platform switch, product and order columns, logging are all in). Changes are listed at the end under "Changes after the check". The graphify graph (built from `13b64f5`; master has only a `.gitignore` commit since) was used first for the rows on hourly KPIs, product and order, stops and comments, micro stops and time model, and the flow builder; every answer was then confirmed in the real files |

## Legend (also the diagram colours)
| Level | Meaning |
|---|---|
| **Have now** (green) | Our flows already read it (Power BI daily flow, fact flows). Only a new table or a new calculation is needed |
| **In the API, new flow** (yellow) | Insights Hub has it and the call is tested, but no flow reads it for this purpose yet |
| **Test first** (orange) | Probably in Insights Hub, but the call or the field was never tested for this (mostly the 7 machine assets of B2 Line) |
| **New source** (blue) | Not in Insights Hub. Needs a file or a rule from Reckitt (SAP, costing sheet, targets) |
| **Not available** (red) | Not in Insights Hub and no source known. Leave out, or ask Reckitt |

## What the report is
- One report per line and production day (06:00 to 06:00 local time). The title says "shift", but the example covers the whole day. **To ask: per shift, per day, or both.**
- Six pages, eight blocks: how the line did, the day in bottles, output and speed by hour, the last 30 days, the machines, what ran (batches, cleans, changeovers), what the operators wrote, what it measured (filler heads), what stopped it, machine performance, what it threw away.
- Today it is built from other systems: the OEE booking system (Provideam), the machine counters (PLC), the batch system (Antares) and SAP routing targets. In the new set-up Insights Hub is the source.

## Mapping, block by block

### Header
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Line, date, production day window | Have now | Config tab (`sites[].dayStartHour`, `assetIds`) | The Config day starts at a fixed 06:00 UTC for Hull. The report day is 06:00 **local** time: in summer (BST) that is 05:00 UTC, so a shift report cannot take `dayStartHour` as it is. The day start rule for the `rpt_*` flow is a decision (see risks) |
| Times shown in local time | Have now | `pbi_daily_losses` already has local date and time (Europe/London offset rule, UK sites only) | The rule exists in `scripts/vfc/d5-loss-rows.js` and `p3-daily-losses.js`. For the `rpt_*` tables: UTC timestamps plus local text columns with the same rule, or convert in Tableau |

### How the line did
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| OEE, availability, performance, quality of the line | Have now | `evaluateKPIs` on the line | Already in our daily flow |
| Hours of stops in planned time | Have now | KPIs `Availability losses`, `Operational time` | |
| Short stops time | Have now | KPI `Micro stops (duration)` | Rule of a micro stop: `/microStops` (presumably under 5 minutes) |
| Time under target with no stop booked | Test first | `timeModelCategoryDistribution` on the line (segments) or the KPI `Performance losses` | Needs a rule: performance loss minus micro stops. Both KPIs are already in the hourly pivot (`s3-pivot-kpi.js`: `performance_losses_ms`, `micro_stops_ms`), so only the rule is missing |
| Rejected of total | Have now | KPIs `Rejected parts`, `Total parts` | |
| The old system's own OEE figure, shown as a check | Not available | None | Only a comparison with the old system. Drops out when Insights Hub is the source |

### The day in one picture and in bottles
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Line capacity in units | Have now | Product design speed x planned time (our `capacity`) | Checked on the real tenant (2026-09-15): B2 Line 136,800 = 190 per minute x 720 min. The report uses the SAP routing target. Still an assumption that it equals the design speed of the product collection |
| Made, lost to downtime, to short stops, to rejects (units and share) | Have now | KPIs (loss times) x design speed | A new calculation, no new call. The daily flow already does design speed x minutes for each stop (`loss_units`) and for downtime (`downtime_units`). Planned stops are not separated yet (Config `plannedRoots`; the real Plan OPT shows planned time below the day length, ours does not) |
| Running rate against target | Have now | `Total parts` / `Net production time` | |

### Output and speed by hour, last 30 days
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Output per hour | Have now | Hourly `evaluateKPIs` (`groupedByDateTime`) | Still true for the Power BI daily flow: it reads the hours (with product and order per hour, `d7-assign-hours.js`) but keeps only sums per shift and product. The older fact flow (`vfc-site-hull.json`) does write one row per asset and hour (`fact_kpi`); its dry run was checked in the VFC, the file content was not. Both use `s3-pivot-kpi.js` |
| Running speed per hour | Have now | Hourly `Total parts` / hourly `Net production time` | Same call |
| This day against the last 30 days | Have now | History of the daily line files (`pbi_plan_opt` good parts / capacity) | The lake holds Hull days from 2026-08-31 (data depth of both lines), so 30 days exist. Caveats: B2 good parts are 96.6 % of the real Plan OPT files, GT4 only 43.6 % (manual entries), capacity is higher than the real one on planned-stop days. Do not mix it with the `eu_report/pbi_report/report` table, which is built from the Provideam CSV files |

### Machines (one row per machine)
B2 Line has 7 machine assets in Insights Hub, all OEE-configured, each with its own reason tree and status mapping (`docs/assets.md`, counted on 2026-10-02). None was used for KPIs or stops so far, and no flow can read them yet: the Config tab lists only the two lines (B2 Line, GT4) as `assetIds`. The OEE asset list is now 55 assets, not 44, Checked 2026-10-19: 7 machines, all OEE-configured (the OEE list has 56 assets now).
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Availability, quality, rate against target, speed per machine | In the API, new flow | `evaluateKPIs` per machine asset | Tested 2026-10-19 (day 2026-09-15): all 7 machines answer with 30 KPIs (05 Antares, a track and trace asset: 28). No flow reads them yet. Operational time is the full 24 h on every machine, so check the planned time rules before using availability |
| Counted, rejects per machine | In the API, new flow | KPIs `Total parts`, `Rejected parts` per machine | Tested: DePalletiser, Palletiser and Antares have counts too (99,609 total, 0 rejected); rejected: filler 326, labeller 1,037, cartoner 321. The earlier note that the palletisers have no counters was wrong |
| Down time and stops per machine | In the API, new flow | `downtimeReasons` per machine | Tested: rows on 2026-09-15: DePalletiser 18, Filler 210, Labeller 401, Cartoner 506, CasePacker 640, Palletiser 10, Antares 0. DePalletiser and Palletiser only carry the reason `Other` |

### What ran
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Product of each block | Have now | Product per hour (`filterValues` + filtered hourly KPIs) | In the daily flow (`part_name`, `product_key`), checked on the real tenant for B2 Line and GT4 (2026-09-15) |
| Batch (order) of each block | Have now | Order per hour (same calls) | Checked 2026-10-19: B2 Line had no order at all on 2026-09-15 (0 orders, 1 product), so the empty `batch_id` is right. On 2026-10-08 it has 2 orders and 2 products. The batch is empty on days without an order. `05 Antares` (track and trace) may hold batch data: not looked at |
| Exact start and end of each run block, changeovers measured last good to first good | Test first | `timeModelCategoryDistribution` segments, or the counter time series (about 1 record per second) | Hourly is too coarse for changeovers. The time series has a 2000 records per call limit Segments have exact times (checked 2026-10-19); the changeover test was skipped because 2026-09-15 had one product. Run `steps=D` on 2026-10-08. |
| Made in the window per batch | Have now | `evaluateKPIs` filtered on the order | The call is already made once per order of the day (`d7-value-request.js`, at most 30 values per asset) and read, but not stored per order. Same B2 Line order question as above |
| Made over the whole batch (also outside the day) | In the API, new flow | Same call over the batch window | Needs the batch start and end first (search a wider window) |
| Work order number | Not available | Not seen | The order source gives one value (the batch). To ask where the work order comes from |
| Batch target quantity | New source | SAP order quantity | Not in Insights Hub |
| Planned maintenance and cleans (when, what, how long) | Test first | `downtimeReasons` rows with a planned reason | Needs the list of reasons that count as clean, maintenance, changeover |

### Planned work against its target
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Booked time per activity | Test first | `downtimeReasons` (planned reasons) | As above |
| Target per changeover or clean | New source | None | Not in Insights Hub. A target table from Reckitt |
| Actual (last good to first good) and the difference in units | Test first | As for the run blocks | Depends on the exact run block times |

### What the operators wrote
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Time, reason, duration of each booking | Have now | `downtimeReasons` (line) | Already in `pbi_daily_losses` (and `fact_loss`), with local date and time, shift, loss group, product and order. A micro stop is one row with the reason `##MICROSTOPS##` |
| Comment text | New source | Provideam Mode Log (the old report's own source) | Checked 2026-10-19: 0 of 1,997 stops of B2 Line had `commentCount` above 0 over 7 days, so Insights Hub comments are not used. The comment call itself was not exercised (nothing to read). To confirm with Reckitt |

### What it measured (filler heads)
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Fill weight per head (mean, spread) | Not available | Not seen | The filler aspect has speed, states and reject counters, no per-head values. Check the aspect types (`/assettypes` returns 200 since 2026-10-13) for variables we did not see |
| Cap torque per head, flagged heads | Not available | Not seen | Same |

### What stopped it, machine performance
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Good and reject per machine | In the API, new flow | KPIs per machine | Tested (see Machines) |
| Worst own alarm per machine (code and text) | In the API, new flow | `topDowntimeReasons` / `downtimeReasons` per machine | Tested: the reason is the alarm with its code (Filler `194 MAX OUTFEED ACCUMULATION`, CasePacker `87 - Squaring unit drive faulty`, Labeller `3 - Head 2 end of reel`). DePalletiser and Palletiser only give `Other` |
| Waiting on the line (starved, blocked, low supply) | In the API, new flow | Reasons per machine and the time category `Lack of resources` | Tested: Filler reasons sit under `Lack of resources / Infeed / Outfeed - Starved or Blocked`, and the segments of Filler, Labeller and Cartoner have the category `Lack of resources` (8.3 to 10 h on 2026-09-15). The category of Cartoner `Holding for upstream machine` and Labeller `Standby, awaiting work` still has to be checked |
| Time split per machine: ran, faults, operator, waiting, planned, other | In the API, new flow | `timeModelCategoryDistribution` per machine | Tested: the segments cover 24 h per machine with the categories `Run`, `Lack of resources` (waiting), `Unplanned Downtime` (faults), `Other`; `Planned Downtime` is known from earlier tests. Missing: a rule for operator stops (for example `STOP AUTOMATIC CYCLE BY OPERATOR`). The line itself has 7.4 h without a category that day |
| Top 3 faults and top 3 waits with counts | In the API, new flow | `downtimeReasons` per machine | Tested (reason and reason path per row); a ranking in Tableau |

### What it threw away
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Counted and rejects per machine | In the API, new flow | KPIs per machine | Tested (see Machines) |
| Cost per reject and total cost | New source | None | The report itself uses an assumed rate until a costing sheet arrives |
| Why the filler rejected (bad cap, torque, weight, no insert, insert) | In the API, new flow | Filler aspect `B2_Line_Filler_OEE_Automatic`, counters `Filler_Reject_BadCap`, `_Insert`, `_NoCap`, `_NoInsert`, `_Torque`, `_Weight` (tested on `02 Filler`) | Counters are cumulative: read the first and the last value of the window. Records are sparse (a record holds only the variables that arrived), so the first record may not hold the counter: read a few records. No flow reads the time series yet and the Config tab has no time series address (see risks) Checked again 2026-10-19: the aspect holds all six counters; no per-head variables in the aspects or the aspect types. |
| Why the cartoner rejected | Not available | Cartoner aspect `Reject_Event` (variable `RejectBoolean`) | Looked at 2026-10-19: the cartoner has a reject flag but no reason variable. The count per machine is in the KPI `Rejected parts` (321 on 2026-09-15) |
| Product dumped by a clean | Not available | Filler CIP state and a tank sensor exist, no rule | Needs the rule from Reckitt |

## What is not available (to raise with Reckitt)
1. Fill weight and cap torque per head (unless the aspect types show variables we did not see).
2. Cost per reject (costing sheet).
3. Batch target quantity (SAP) and the work order number.
4. Targets for changeovers and cleans.
5. Product dumped by a clean (the rule).
6. The old system's own OEE figure (only a cross-check; not needed once Insights Hub is the source).
7. Inputs we need from Reckitt even where the data exists: which reasons are cleans, maintenance and changeovers; how reasons split into faults, operator, waiting, planned.

## Proposed data design (for approval, not built)
**A separate flow and separate files.** A new tab per site (`Hull shift report`) that writes its own `rpt_*` tables, detached from the Power BI tables. It reuses the nodes of the Power BI daily flow that exist as `scripts/vfc/*.js` and builder helpers: token (`s2-token-request.js`), asset list and choice (`s2-*`), hierarchy and KPI pivot (`s3-*`), shift rules (`d4-shift-rules.js`), products and orders (`d7-*`), stops (`s4-*`, `d5-loss-rows.js`), log lanes (`addLogLanes`, folder `logs/rpt-hull/`), layout (`compactLanes`). Settings come from `1.1 CONFIG` (`platform`, `oeeBase`, `amBase`, `tokenUrl`), so the platform switch works without change for every OEE and Asset Management call.

Why separate and not more lanes in the Power BI daily flow:
- Different schedule: shortly after each shift end, not once a day.
- About 50 more calls per day (7 machines x 3 or 4 calls, plus time series counters). A failure there should not stop the Power BI tables.
- Easier to read in the VFC (the daily flow has 121 nodes already).

The cost: some calls twice (token, assets, line KPIs). Small.

Every table has the columns `window_kind` (`day` or `shift`), `window_name` (the day as text `YYYY-MM-DD`, or the shift name from the calendar) and `window_start`, `window_end` (UTC, TIMESTAMP_MILLIS), so Tableau can show either. (Not called `window`: a reserved word in SQL.) Same conventions as the `pbi_*` tables: snake_case names, `asset_id` as the machine key with `asset_name` next to it, `product_key` = product code, `part_name` = description else name, days as text (the parquet node has no DATE type), a rerun replaces the file.
| Table | One row is | Main columns |
|---|---|---|
| `rpt_window` | asset x window (day or shift), asset = line or machine | OEE, availability, performance, quality, total, good and rejected parts, capacity, losses in units, micro stop minutes, unbooked minutes, design speed, running rate, down minutes, stops, minutes per group (ran, faults, operator, waiting, planned, other). Group columns stay empty on line rows |
| `rpt_hour` | asset x hour | shift, product, order, total and good parts, running minutes, speed per minute |
| `rpt_event` | one booked stop or planned activity | from, to, asset, reason path, group, minutes, comment text (if the test shows it can be read) |
| `rpt_counter` (later) | asset x window x counter | count in the window. Built after test 4 and a time series address in Config |

Decided 2026-10-19 (user): 3 tables, not 7. Made-in-batch and the batch table are `rpt_hour` grouped by order in Tableau, the top 3 faults and waits are a ranking of `rpt_event`, line and machine rows share `rpt_window`. Every table has `site`, `line_id`, `line_name`, `asset_id`, `asset_name`, so one set of tables serves every line and site and Tableau filters by line. Size is small (about 190 rows per line and day in `rpt_hour`), so the filter costs nothing.

### Data lake layout
One file per table, site and production day, the same pattern as the `pbi_*` tables. A rerun replaces the file. A run per shift rewrites the same day file.
```
<root>/shift_report/rpt_window/site=Hull/rpt_window_2026-09-30.parquet
<root>/shift_report/rpt_hour/site=Hull/rpt_hour_2026-09-30.parquet
<root>/shift_report/rpt_event/site=Hull/rpt_event_2026-09-30.parquet
<root>/logs/rpt-hull/log_2026-09.csv
```
A new line is one entry in the Config list (no new table or folder). A new site is a new `site=` folder and a new tab. The lines of a site come from a list in Config (machine ids per line, see risks).

The 30-day trend reads the history of `rpt_window` (or `pbi_plan_opt`). Per-head measurements, costs and targets are left out until there is a source.

## Tests before any build (read-only, GET plus the approved read-style POSTs)
Covered on master (checked 2026-10-19): see the table at the end of this page. In short: none of the 6 is fully covered, 4 and 6 and 3 are partly.
1. `evaluateKPIs` on each of the 7 machine assets for one day: which KPIs have values.
2. `downtimeReasons` and `topDowntimeReasons` per machine: do reasons carry the alarm text, and are waiting states separate.
3. `statusDistribution` and `timeModelCategoryDistribution` per machine.
4. Aspects of every machine (`/assets/{id}/aspects`) and the aspect types (`/assettypes`, now 200): reject counters of the cartoner, any per-head values.
5. The comment text: one stop with `commentCount` above 0, read its comment.
6. Run blocks: are `timeModelCategoryDistribution` segments exact enough for changeovers (last good to first good).

## Delivery questions
- Tableau: live view, PDF download and email. As far as we know Tableau Server and Tableau Cloud can email a view on a schedule (subscriptions), with an image or PDF. To confirm with Reckitt's Tableau set-up, and how Tableau reads the data lake files (the same question as for Power BI).
- Shift or day window, or both.
- Local time and daylight saving.
- Is the SAP routing target the same as the design speed in the Insights Hub product collection?

## Risks for the flow (found in the check, 2026-10-19)
1. **Machines are not in Config.** `sites[].assetIds` holds the two lines. The shift flow needs the machine ids: add a list per line (or read the children of the line from the Asset Management hierarchy). The 55 OEE assets (was 44) must be read again to confirm the 7 machines of B2 Line.
2. **No time series address in Config.** `1.1 CONFIG` builds `tokenUrl`, `oeeBase` and `amBase` only. The reject counters need a `tsBase` (`iottimeseries/v3` on legacy, `iottimeseries-1000001700/v3` on xcelerator, both tested in the smoke check). It must be added to `c1-config.js` and to the platform test before the counter table.
3. **Production day start.** Config has a fixed UTC hour (06:00 for Hull); the report day is 06:00 local (05:00 UTC in summer). User decision: which window the `rpt_*` tables use. The Power BI tables stay on the UTC day.
4. **B2 Line orders.** Settled 2026-10-19: no order on 2026-09-15, orders exist on other days. An empty batch is normal on days without an order.
5. **Load and schedule.** The daily flow already makes one filtered call per product and order each second. The shift flow adds about 50 calls per day; run it at another time than 07:00 UTC (proposed 08:00 UTC). Large answers (about 470 segments per line and day, more per machine) can give HTTP 413: the window split is still open in `NOTES.md`.
6. **Not run in the VFC yet.** The rebuilt Power BI daily flow and the platform switch are not yet re-checked in the VFC. A new flow built on them inherits that.
7. **Counters are sparse.** First and last record of the window may not hold a given counter.
8. **Size of `rpt_event`.** One line and day gave about 1,800 event rows (7 machines; CasePacker 640, Cartoner 506, Labeller 401). That is about 650,000 rows per line and year, the biggest of the three tables. Fine for one site; with many lines and sites decide on compaction (monthly files) or dropping tiny stops before it grows.

## Changes after the check
Checked 2026-10-19. Rows still valid are not listed.
| Row | Change |
|---|---|
| Header, day window | Note: Config day start is a fixed UTC hour, the report day is local. New decision for the user |
| Header, local time | Note: local date and time already exist in `pbi_daily_losses` (UK rule) |
| Time under target | Note: both KPIs are already in the hourly pivot; only the rule is missing. Level unchanged |
| Made, lost (units) | Note: `loss_units` and `downtime_units` already computed in the daily flow; planned stops not separated |
| Line capacity | Note: checked on the real tenant. Level unchanged |
| Output per hour | Note: still not stored by the Power BI daily flow; `fact_kpi` of the older fact flow does store it. Level unchanged |
| Last 30 days | Note: history exists from 2026-08-31; accuracy caveats. Level unchanged |
| Batch and product of each block | **Split.** Product stays "Have now". Batch (order) is now "Test first": empty for B2 Line on 2026-09-15 |
| Made in the window per batch | Note: call exists, result is not stored per order. Level unchanged |
| Machines intro | Note: Config has no machine ids; OEE assets now 55 (was 44) |
| Operators' bookings | Note: columns now in `pbi_daily_losses` and `fact_loss` |
| Why the filler rejected | Counter names added (tested on `02 Filler`); no time series base in Config |
| Proposed tables | **7 became 3** (see Decided 2026-10-19). `window` replaced by `window_kind`, `window_name`, `window_start`, `window_end`; conventions of the `pbi_*` tables written down |
| Proposed design | Reuse list and platform switch added |
| Whole page | Risks section added |

## Tests before any build: already covered on master?
| # | Test | Covered | By what |
|---|---|---|---|
| 1 | `evaluateKPIs` on each of the 7 machines | No | The KPI POST was only run on B2 Line and GT4 (and the smoke check on one asset). Needs the 7 machine ids first |
| 2 | `downtimeReasons` and `topDowntimeReasons` per machine | No | Only the two lines. Reason trees were read as master data (`/reasontrees`), not per machine stops |
| 3 | `statusDistribution` and `timeModelCategoryDistribution` per machine | Partly | Both tested on B2 Line (`docs/kpis.md`, 469 segments for 24 h, exact `from` and `to`, GT4 refused with 400). Not on its machines. The note about 506 machine segments on 2026-10-08 does not say which asset |
| 4 | Aspects of every machine and the aspect types | Partly | `02 Filler` has its 6 aspects listed (`docs/timeseries.md`) including the six reject counters. `/assettypes` answers 200 since the smoke check but its content was never read. The other 6 machines and the cartoner were not listed |
| 5 | Comment text of one stop | No | Count only (`commentCount`, 0 on the days checked); `/comment` gave `[]` on GT4. The shape of a comment was never seen |
| 6 | Run blocks exact enough for changeovers | Partly | Segment shape known (`from`, `to`, `realFrom`, `realTo`, category); whether last good to first good can be read from them was not tested |

## Test plan (2026-10-19, nothing run yet; every call is read-only)
One script `scripts/test-shift-report.js` (to write after your yes), one call per second, redacted samples to `samples/`. Machine ids come from step A, so A runs first. Day used: 2026-09-15 (the day of the earlier real run), plus 2026-10-08 for orders.
| Step | Calls | Answers test | Needed for |
|---|---|---|---|
| A | GET OEE asset list; GET the Asset Management children of B2 Line (names, ids, manual or not) | machine ids and count (55 OEE assets now) | Config machine list, steps B to E |
| A2 | GET `filterValues` for B2 Line on 2026-09-15 and 2026-10-08 | does B2 Line have orders (the `batch_id` question) | `rpt_hour` order column, line-only phase |
| B | POST `evaluateKPIs` per machine (7), day window | 1: which KPIs have values per machine | `rpt_window` machine rows |
| C | GET `downtimeReasons` and `topDowntimeReasons` per machine (14) | 2: alarm text, waiting reasons separate | `rpt_event` machine rows, group mapping |
| D | POST `timeModelCategoryDistribution` and GET `statusDistribution` per machine (14); on B2 Line also the segments around one product change, next to a few `OEE_Prerequisites` records at that time | 3 and 6: time per group, exact run blocks | time per group, changeovers |
| E | GET `/assets/{id}/aspects` per machine (7); GET `/assettypes` and `/aspecttypes` (read the content); one small time series read of a cartoner reject counter | 4: aspects, per-head values, cartoner rejects | `rpt_counter`, the red rows |
| F | GET `downtimeReasons` on B2 Line over 7 days to find a stop with `commentCount` above 0, then read its comment (`/assets/{id}/comment` or the stop) | 5: comment text | `comment` column of `rpt_event` |
About 55 calls. The first flow phase (line rows only) needs only A2 and the decision on the day start; machine rows need A to D; `rpt_counter` needs E.

## Flow design (proposal, not built)
Tab `Hull shift report`, built by a new `scripts/build-vfc-rpt-flows.js` in the same way as the Power BI daily flow. Reused unchanged: token, asset list and choice, hierarchy, KPI pivot, shift rules, products and orders, stops, logging (`logs/rpt-hull/`), layout. New function nodes: window rows (one `evaluateKPIs` per shift plus one for the day, per asset), hour rows, event rows, and the three table messages. Phase 1 writes line rows only, all three tables, with the machine columns empty; phase 2 adds the machine ids to Config and the machine rows.

## Decisions (user, 2026-10-19)
1. 3 tables (`rpt_window`, `rpt_hour`, `rpt_event`), `rpt_counter` later. Layout under `<root>/shift_report/`.
2. Day start 06:00 **local** time, as a setting in Config per site (`dayStartHour` stays for the UTC Power BI tables, a new local setting and the time zone rule per site, because the other sites (Germany, France, Turkey) have other rules than the UK one).
3. Phase 1: B2 Line only. GT4 later.
4. Test script written: `scripts/test-shift-report.js` (run by the user, output in `samples/shift-report-summary.txt`).


## Probe results (2026-10-19, `scripts/test-shift-report.js`, day 2026-09-15)
| Test | Result |
|---|---|
| 1. `evaluateKPIs` per machine | Passed: all 7 machines give 30 KPIs (Antares 28). |
| 2. `downtimeReasons` per machine | Passed: reason text is the alarm with a code; waiting is separate (`Lack of resources`). DePalletiser and Palletiser only give `Other`. |
| 3. Segments and `statusDistribution` per machine | Passed: 24 h per machine with categories; the line itself has 7.4 h without a category. |
| 4. Aspects and aspect types | Done: no per-head fill weight or cap torque anywhere; the filler counters are confirmed; the cartoner only has a reject flag (`Reject_Event`). |
| 5. Comment text | No stop with a comment in 7 days: the source is Provideam, not Insights Hub. |
| 6. Changeover exactness | Not done: one product that day. Needs `node scripts/test-shift-report.js 2026-10-08 steps=D`. |
| A2. Orders | 2026-09-15: 0 orders; 2026-10-08: 2 orders, 2 products. |
Run count: OEE assets 56 (55 on 2026-10-13). Levels on page 2 of the diagram were changed to match.
