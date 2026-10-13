# Shift (management) report: what data we have for it

| At a glance | |
|---|---|
| **What** | The existing B2 shift report (also called the management report) is to be rebuilt in Tableau: viewed live, downloaded as PDF, and sent by email. This page maps every part of it to the data we can get from Insights Hub, and lists what is missing |
| **Example used** | One PDF of the existing report: B2 Line, one production day in September 2026, 6 pages. Kept outside the repo (it holds batch numbers, operator comments and costs). No values from it are copied here |
| **Diagram** | `diagrams/shift-report-data-map.drawio`, made by `node scripts/build-drawio-shift-report.js`, checked by `node scripts/validate-drawio.js diagrams/shift-report-data-map.drawio` |
| **Result in one line** | The line figures are there already. The machine figures are in the API but not in our flows (7 machine assets, to test first). Missing: per-head fill weight and cap torque, costs, batch targets and work order, changeover and clean targets, product dumped, and the comment text until tested |
| **Status** | Analysis only (2026-10-13). Nothing built. No API call was made for this page |

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
| Line, date, production day window | Have now | Config tab (site, assets, day start) | Our day is 06:00 UTC. The report uses local time (BST). Same open point as the Power BI tables (daylight saving) |
| Times shown in local time | Have now | Conversion in the flow or in Tableau | Decide where the conversion happens |

### How the line did
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| OEE, availability, performance, quality of the line | Have now | `evaluateKPIs` on the line | Already in our daily flow |
| Hours of stops in planned time | Have now | KPIs `Availability losses`, `Operational time` | |
| Short stops time | Have now | KPI `Micro stops (duration)` | Rule of a micro stop: `/microStops` (presumably under 5 minutes) |
| Time under target with no stop booked | Test first | `timeModelCategoryDistribution` on the line (segments) or the performance loss KPI | Needs a rule: performance loss minus micro stops |
| Rejected of total | Have now | KPIs `Rejected parts`, `Total parts` | |
| The old system's own OEE figure, shown as a check | Not available | None | Only a comparison with the old system. Drops out when Insights Hub is the source |

### The day in one picture and in bottles
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Line capacity in units | Have now | Product design speed x planned time (our `capacity`) | The report uses the SAP routing target. To confirm it is the same as the design speed in the product collection |
| Made, lost to downtime, to short stops, to rejects (units and share) | Have now | KPIs (loss times) x design speed | A new calculation, no new call |
| Running rate against target | Have now | `Total parts` / `Net production time` | |

### Output and speed by hour, last 30 days
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Output per hour | Have now | Hourly `evaluateKPIs` (`groupedByDateTime`) | Our daily flow reads it but does not store it per hour |
| Running speed per hour | Have now | Hourly `Total parts` / hourly `Net production time` | Same call |
| This day against the last 30 days | Have now | History of the daily line files (`pbi_plan_opt` good parts / capacity) | Needs 30 days of files (backfill) |

### Machines (one row per machine)
B2 Line has 7 machine assets in Insights Hub, all OEE-configured, each with its own reason tree and status mapping (`docs/assets.md`). None was used for KPIs or stops so far.
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Availability, quality, rate against target, speed per machine | Test first | `evaluateKPIs` per machine asset | Only `/config` and the time series were tested on a machine |
| Counted, rejects per machine | Test first | KPIs `Total parts`, `Rejected parts` per machine | The palletiser and depalletiser have no counters (the report shows availability only for them, which fits) |
| Down time and stops per machine | Test first | `downtimeReasons` per machine | |

### What ran
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Batch and product of each block | Have now | Order and product per hour (`filterValues` + filtered hourly KPIs) | Already in the daily flow (`batch_id`, `part_name`, `product_key`) |
| Exact start and end of each run block, changeovers measured last good to first good | Test first | `timeModelCategoryDistribution` segments, or the counter time series (about 1 record per second) | Hourly is too coarse for changeovers. The time series has a 2000 records per call limit |
| Made in the window per batch | Have now | `evaluateKPIs` filtered on the order | |
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
| Time, reason, duration of each booking | Have now | `downtimeReasons` (line) | Already in `pbi_daily_losses` |
| Comment text | Test first | `commentCount` on each stop; the comment read per stop or `/assets/{id}/comment` | Only the count was read so far (always 0 on the days checked). The comment text was never read |

### What it measured (filler heads)
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Fill weight per head (mean, spread) | Not available | Not seen | The filler aspect has speed, states and reject counters, no per-head values. Check the aspect types (`/assettypes` returns 200 since 2026-10-13) for variables we did not see |
| Cap torque per head, flagged heads | Not available | Not seen | Same |

### What stopped it, machine performance
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Good and reject per machine | Test first | KPIs per machine | |
| Worst own alarm per machine (code and text) | Test first | `topDowntimeReasons` / `downtimeReasons` per machine | The status mapping turns machine states into reasons. To check that the reasons carry the alarm text |
| Waiting on the line (starved, blocked, low supply) | Test first | Reasons per machine | Needs the reasons to be split into own faults and waiting |
| Time split per machine: ran, faults, operator, waiting, planned, other | Test first | `statusDistribution` or `timeModelCategoryDistribution` per machine, plus a mapping | A mapping from reason (or reason tree branch) to these 6 groups is needed. Reckitt to confirm the groups |
| Top 3 faults and top 3 waits with counts | Test first | `downtimeReasons` per machine | |

### What it threw away
| Item | Level | Insights Hub source | Note |
|---|---|---|---|
| Counted and rejects per machine | Test first | KPIs per machine | |
| Cost per reject and total cost | New source | None | The report itself uses an assumed rate until a costing sheet arrives |
| Why the filler rejected (bad cap, torque, weight, no insert, insert) | In the API, new flow | Filler aspect reject counters (time series) | Counters are cumulative: read the first and the last value of the window (2 small calls per counter group) |
| Why the cartoner rejected | Test first | Cartoner aspects (not looked at yet) | List the aspects of the cartoner first |
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
**A separate flow and separate files.** A new tab per site (`Hull shift report`) that writes its own `rpt_*` tables, detached from the Power BI tables. It reuses the day set-up nodes (token, assets, shifts, products and orders) that the Power BI daily flow already has.

Why separate and not more lanes in the Power BI daily flow:
- Different schedule: shortly after each shift end, not once a day.
- About 50 more calls per day (7 machines x 3 or 4 calls, plus time series counters). A failure there should not stop the Power BI tables.
- Easier to read in the VFC (the daily flow has 121 nodes already).

The cost: some calls twice (token, assets, line KPIs). Small.

Every table has a `window` column: the production day and each shift (shift name from the calendar), so Tableau can show either.
| Table | One row is | Main columns |
|---|---|---|
| `rpt_line_window` | line x window | OEE, availability, performance, quality, total, good and rejected parts, capacity, losses in units (availability, performance, quality), micro stop minutes, unbooked minutes, design speed, running rate |
| `rpt_line_hour` | line x hour | shift, product, order, total and good parts, running minutes, speed per minute |
| `rpt_machine_window` | machine x window | availability, quality, rate against target, counted, good, rejects, down minutes, stops, minutes per group (ran, faults, operator, waiting, planned, other) |
| `rpt_machine_reason` | machine x window x reason | group, minutes, count, rank |
| `rpt_booking` | one booked stop or activity | from, to, machine, reason path, group, minutes, comment text (if the test shows it can be read) |
| `rpt_batch` | order x window | product code, name, description, minutes in the window, made in the window, made over the whole batch, first and last hour |
| `rpt_reject_counter` | machine x window x counter | count in the window |

The 30-day trend reads the history of `rpt_line_window` (or `pbi_plan_opt`). Per-head measurements, costs and targets are left out until there is a source.

## Tests before any build (read-only, GET plus the approved read-style POSTs)
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
