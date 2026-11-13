# EU_OEE_Fact: Run Rate rows

| At a glance | |
|---|---|
| **What** | `Record Type = "Run Rate"` rows in `EU_OEE_Fact`, for AVG Hr Rate and % Max Rate on the Tableau pages By Shift and By Format |
| **Grain** | one row per shift start day, site, line, shift, part (per-shift totals, not hourly rows, not stored averages) |
| **New columns** | `RR Hours` (hour rows), `RR Good Parts` (sum), `RR Capacity` (sum). Filled only on Run Rate rows, at the end of the column list (the 62 old columns keep their place) |
| **Code** | `run_rate_rows()` in [scripts/eu_oee_fact_rr_build.py](../scripts/eu_oee_fact_rr_build.py) (a copy of `eu_oee_fact_build.py`, which keeps the 62-column format), check `check_run_rates()` |
| **Source** | `Run_Rates_EU` (hourly, from `b9-run-rate-rows.js`), unchanged |
| **Sites** | Hull, Nottingham, Weinheim. Chartres has no hourly data, so no Run Rate rows |
| **Status** | live in the lake since 2026-11-13 (94 files, data to 2026-11-12), SIH sync and Tableau ok. Backup of the old 62-column files: `parquet/eu_oee_fact_backup_20261113/`. No flow yet |

Measures in Tableau: AVG Hr Rate = `SUM([RR Good Parts]) / SUM([RR Hours])`, % Max Rate = `SUM([RR Good Parts]) / SUM([RR Capacity])`. `Good Parts` and `Capacity` stay empty on Run Rate rows, so the OEE is not counted twice.

## Rules

1. Hour rows with an empty MachineName or Good Parts = 0 are dropped (Power BI does the same; `Run_Rates_EU` already holds none).
2. `Date` = shift start day: the latest day on or before the hour whose weekday is the weekday the raw shift name starts with (`FriNight`, `Friday Night Shift`, `FriDay - Blue`). Every raw name in the data starts with a weekday; in practice the result is the hour's day or the day before (hours 00 to 10). No start hours per site needed.
3. `ShiftName` = the shift file (`reference/shift_naming/site=All/Shift Patterns Provideam EU.csv`) as Plan (`b6-plan-rows.js`). `Shift Colour`: Hull only, the text after the first `-`, empty = Pink. Raw names the shift file does not map leave ShiftName empty (as on Plan); the build log lists them (2026-11-12: `Sunday Early shift - Green` 41 hours, `Sunday Late shift - Green` 11, `Sunday Early shift - Blue` 7, `Sat Afternoon` 5).
4. `Unique Machine Name` = `MachineName-Site`, `Product Key` = `Unique Machine Name + " " + PartName`, Hull part text fix as Plan.
5. `In EU Report`, `Dept`, `Area`, `Product Type` from the line list `Dim/Machine_Names_EU.csv`, the same join as the other record types. `In EU Report Source` keeps the Run_Rates_EU flag (true on 38 Nottingham tablet lines that are not EU lines).
6. `Brand`, `Unit Size`, `Unit Count/Format`, `Extra Info` from `Format_List_EU` by Product Key (empty where the list has none, all of Nottingham).

## Check (2026-11-12 build)
See `NOTES.md` and the `check` output. RR Good Parts equals Plan Good Parts on 99.85 % (Hull), 99.93 % (Nottingham), 100 % (Weinheim) of shift-days in both. The rest: Hull 2025-12-16 (Plan Good Parts 0 that day in the lake, 22 shift-days), Nottingham 30 shift-days off by 1 to a few parts. Plan shift-days without run rates are lines with no hourly data (process lines, and the EU lines Uhlmann, Bosch Blister Line).

## Lesson (2026-11-13)
First upload failed: Chartres files had the three RR columns all empty and typed Null; Hyper cannot read that. The build now casts them (Int64, Int64, Float64). Any new column that can be empty for a whole site needs an explicit type.
