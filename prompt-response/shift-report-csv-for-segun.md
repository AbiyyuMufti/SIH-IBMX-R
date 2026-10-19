# Shift report data: the three CSV files (for the Tableau visual)

| At a glance | |
|---|---|
| **For** | Segun, who builds the shift (management) report visual in Tableau |
| **Files** | `shift_rpt_window.csv` (54 rows), `shift_rpt_hour.csv` (432 rows), `shift_rpt_event.csv` (4,653 rows). Exports of the data lake tables `rpt_window`, `rpt_hour`, `rpt_event` (folder `shift_report/`), made on 2026-10-19 |
| **Line** | B2 Line (Hull) and its 7 machines |
| **Day to design on** | **2026-09-15** (see "Which day to use") |
| **Which block needs which column** | `diagrams/shift-report-data-map.drawio`, page "Columns per block" |
| **Not final** | Some fields are empty on purpose (listed below). The same tables will be refreshed daily in the data lake |

## How the three tables fit together
- **One report = one line and one production day** (06:00 to 06:00 local time). Filter on `line_name` (`B2 Line`) and `production_day`. A site has many lines later, all in the same tables.
- Every table starts with the same keys: `site`, `line_id`, `line_name`, `asset_id`, `asset_name`, `asset_level`, `production_day`.
- `asset_level` is `line` (the line as a whole, `asset_name` = `B2 Line`) or `machine` (`01 DePalletiser`, `02 Filler`, `03 Labeller`, `04 Cartoner`, `05 Antares`, `06 CasePacker`, `07 Palletiser`). Do not add line and machine rows together: the machines are parts of the line, not extra output.
- **Times:** `window_start`, `window_end`, `hour_start`, `hour_end`, `event_start`, `event_end` are **UTC** (no time zone in the text). `local_date` and `local_time` (hour and event tables) are the **local clock** (UK, summer time). For the report use the local columns. The production day starts at 06:00 local, which is 05:00 UTC in summer.
- **Shifts:** `shift_name` is the crew name of the Insights Hub calendar (Gold, Green, ...). Two shifts of 12 hours per day (06:00 to 18:00 and 18:00 to 06:00 local). The old report used other crew names: expect the names to differ.

### `shift_rpt_window.csv`: one row per asset and window
- `window_kind` = `day` (the whole production day, `window_name` = the date) or `shift` (one row per shift, `window_name` = the crew name). **Do not add a day row to its shift rows.**
- Ratios: `oee`, `availability`, `performance`, `quality` are fractions (1 = 100 %). They equal the OEE app for the same window (checked). `performance` can be above 1 (a wrong or different design speed); `oee` can then be above 1 as well.
- Counts: `total_parts`, `good_parts`, `rejected_parts`, `theoretical_output` (parts at design speed).
- Minutes (`*_min`, decimals): `operational_min` (planned running time), `net_production_min`, `availability_loss_min`, `performance_loss_min` (can be negative), `quality_loss_min`, `used_operational_min`, `downtime_min`, `micro_stop_min`, `macro_stop_min`, `planned_stop_min`, `total_min`. Counts of stops: `downtime_count`, `micro_stop_count`, `macro_stop_count`.
- Units (`*_units`, parts at design speed): `capacity_units`, `availability_loss_units`, `performance_loss_units`, `quality_loss_units`; `design_speed_per_min`; `running_rate` (parts per minute of net production time).
- **Machine rows only:** time split of the 24 hours (or 12 hours of a shift): `ran_min`, `fault_min`, `waiting_min` (starved or blocked: category "Lack of resources"), `planned_min`, `other_min`. They add up to the length of the window. `operator_min` is **empty** (no source yet). The line rows have no split.

### `shift_rpt_hour.csv`: one row per asset and hour (24 per asset and day)
`hour_start`/`hour_end`, `local_date`, `local_time`, `shift_name`, `product_key`, `part_name`, `batch_id`, `total_parts`, `good_parts`, `rejected_parts`, `operational_min`, `net_production_min`, `availability_loss_min`, `downtime_min`, `micro_stop_min`, `design_speed_per_min`, `speed_per_min` (parts per minute of net production time, empty when the asset did not run), `capacity_units`.
- Product and order are the ones that ran in that hour. An hour without parts takes the value of the hour before.
- **Orders (`batch_id`) are filled on the machines `05 Antares` and `07 Palletiser`, not on the line.**

### `shift_rpt_event.csv`: one row per stop
`event_start`, `event_end` (empty for a stop that is still open), `local_date`, `local_time`, `shift_name`, `event_kind` (`unplanned`, `planned`, `microstop`; only `unplanned` occurs in these days), `reason` (the alarm with its code), `reason_path`, `reason_full_path`, `minutes`, `occurrence`, `comment_count` (always 0: operator comments are not in Insights Hub), `batch_id`, `part_name`, `product_key`, `loss_units`.
- About 200 stops per day for the line and about 2,000 with the machines. For the top 3 faults and waits, rank `reason` by `minutes` per machine in Tableau.
- A stop that started before the window start (one per busy machine) is not in the file.

## Which day to use
| Day | Content | Use it for |
|---|---|---|
| **2026-09-15** | Line and 7 machines, product `part_name` and speed filled, performance and OEE filled, orders on Antares and Palletiser, 24 hours per asset, 1,952 events | **The main design day.** All blocks that exist have data |
| 2026-09-14 | Line and 7 machines, but **no product**: `performance`, `oee`, `capacity_units`, the `*_units` columns, `theoretical_output` and `part_name` are empty (the OEE app shows the same). Orders on the machines | A second day, to check empty values and that a visual does not break |
| 2026-10-16, 2026-10-18 | **Line only** (written before the machines were added): no machine rows | Line level visuals and a longer trend only. Do not use for machine visuals |

For a "last 30 days" trend, only these four days exist now. A backfill of the lake files is planned. Until then design the trend with the structure (one point per `production_day` from the `day` rows of the line) and expect more days later.

## What is not in the data (yet)
- Operator stops (`operator_min` empty), operator comment text, per-head fill weight and cap torque (not in Insights Hub), costs, batch target quantity, work order, targets for changeovers and cleans, reject reasons per machine (filler counters are planned as a fourth table), product dumped by a clean.
- Planned stops and changeovers: no planned stop occurred in these days, so `event_kind` = `planned` is untested.
- Days 5 to 7 Sep 2026 failed (too much data for the service) and are not in the files.
- Crew names differ from the old report. Whether the report is per shift, per day or both is still to be confirmed with Reckitt: the tables have both (`window_kind`).
