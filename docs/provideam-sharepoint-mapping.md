# Provideam reports matched to SharePoint sources

| At a glance | |
|---|---|
| **Purpose** | Map the SharePoint source folders to report tables, then identify which saved Provideam JSON definitions have a CSV-compatible shape |
| **Scope** | SharePoint inputs only. Insights Hub API sources are excluded |
| **Status** | Plan OPT and Run Rates: the monthly SharePoint files are proven row for row against reports 11/12 (Hull), 25/24 (Nottingham) and 34/33 (Weinheim) on 2026-10-30. Line Losses and Volume Loss Correction: no saved definition produces them. The Power Automate schedule itself is still not seen |
| **Evidence** | [`sharepoint-files.md`](sharepoint-files.md), [`provideam-source.md`](provideam-source.md), [`pbi-report-build.md`](pbi-report-build.md), [`pbi-report-build-2.md`](pbi-report-build-2.md), and the local numbered report index |

## SharePoint folders and their destinations

Folders follow `sharepoint/<group>/<type>/site=<site>/`. The `source` folders
contain Provideam report exports. The `reference` folders contain lookup,
classification or target files. A reference file can enrich a report table
without being a row-level report export itself.

| SharePoint type | Group | Contents / role | Report table destination |
|---|---|---|---|
| `plan_opt` | `source` | Daily production by date, area, machine, shift, part and production measures | `Plan_OPT_EU`; also the source for derived `Time_Utilisation_EU` and `Volume_CoV_EU` |
| `run_rates` | `source` | Hourly Good Parts and Capacity by area, machine, hour, part and shift | `Run_Rates_EU` |
| `line_losses` | `source` | Mode Log events: start time, machine, part, shift, loss group/subgroup/description, duration and comment | `Daily_Losses_EU` event rows |
| `volume_loss_correction` | `source` | Loss time and units by shift date, machine and loss category | Enriches `Daily_Losses_EU` with loss units; it is not a separate current report table |
| `format_list` | `reference` | Machine/product format, brand, size and count lookup | `Format_List_EU`; also supports product-related joins |
| `glidepaths` | `reference` | Plan OPT and loss-category targets | Supplies targets to `Plan_OPT_EU` and `Daily_Losses_EU`; not a separate report table |
| `shift_naming` | `reference` | Maps exported shift names to report shift names | Lookup for report shift fields; not a separate report table |
| `machine_names` | `reference` | Machine-to-department, area and product-type lookup | Enriches report rows; not a separate current report table |
| `equipment_coding` | `reference` | Machine and loss-description to equipment lookup | Enriches `Daily_Losses_EU` |

The report tables in the current build are `Plan_OPT_EU`,
`Time_Utilisation_EU`, `Daily_Losses_EU`, `Run_Rates_EU`, `Volume_CoV_EU` and
`Format_List_EU`. `Time_Utilisation_EU` and `Volume_CoV_EU` are derived from
Plan OPT, not separate SharePoint source types.

## Proof against the original exports (2026-10-30)

Each monthly definition was rerun for September 2026 (`pdMonth` =
`[9,2026]`, saved caller, machines, fields and functions unchanged) and
compared with the raw export in `sharepoint/source_original/` (UTF-16, tab
separated, lines end with a tab and CR; not the normalized month files).

| SharePoint file (Sep 2026) | Report | API rows / CSV rows | Keys matched | Measure check |
|---|---|---|---|---|
| `plan_opt/site=Hull/Hull_Sep2026-monthly_opt_volume.csv` | 11 Hull Monthly New Plan OPT | 967 / 967 | 967, none missing either side | Good Parts equal per key (within 1); sums differ only by CSV rounding |
| `run_rates/site=Hull/Hull_Sep2026-monthly_run_rates.csv` | 12 Hull Monthly Packing Hourly Run Rates | 7871 / 7871 | 7871 | Good Parts sum identical |
| `plan_opt/site=Nottingham/Sep2026-notts_monthly_opt_volume.csv` | 25 Nottingham Monthly Plan OPT | 2744 / 2744 | 2744 | as above |
| `run_rates/site=Nottingham/Sep2026-notts_monthly_run_rates.csv` | 24 Nottingham Monthly Hourly Run Rates | 19906 / 19906 | 19906 | as above |
| Weinheim Sep 2026 Plan OPT | 34 Weinheim Monthly Plan OPT | 124 / 124 | 124 | sums identical |
| `run_rates/site=Weinheim/Sep2026-wein_monthly_run_rates.csv` | 33 Weinheim Monthly Hourly Run Rates | 886 / 886 | 886 | Good Parts sum identical |

The field list of each definition is the CSV header in the same order
(`fdYYYYMMDD` -> `YYYY-MM-DD`, `fnGoodParts` -> `Good Parts`, ...). The API
adds one grand-total row (968 vs 967) and returns raw numbers: OEE as a
fraction, times in seconds, ISO timestamps. The export formats them (`57.3%`,
`08:00:00`, `01/09/2026 06:00:00`, thousands separators). Capacity in the run
rate exports is rounded per hour, so its sum differs slightly.

Still missing:

- **Line Losses** (`StartTime, MachineName, PartDesc, ShiftName,
  OEELossLvl3Group/SubGroup/Desc, Duration, ShiftStartDate, Comment`): event
  rows from a Mode Log dataset. None of the 38 saved definitions (all
  `ObjectByPeriod`) can produce it. Need Antoni's Mode Log report definition
  (`/api/v1/report/objectmodelog`).
- **Volume Loss Correction** (`ShiftStartDate, MachineName,
  OEELossLvl3Group/SubGroup/Desc, Time, Loss Units`): per loss description
  time and units. No saved definition selects the loss description fields with
  `fnLossDescTime` / `fnLossDescUnits` (both exist in the function catalogue).
  Need that definition.
- **Daily and "Current Month" files** (`*_Current_Month_*`, `*-daily_*`): not
  compared. Same columns as the monthly files, so likely the daily/custom
  siblings (e.g. 23/28/38, 30/27/37), not proven.
- `daily_performance_availability.csv` in `downloads/` has the columns of
  reports 07/31 (date, machine, Availability, Performance); not compared.
- Which Power Automate flow or email rule writes each file (names only).

## Saved JSON definitions that look like the SharePoint exports

This comparison treats each saved request as a report definition: its selected
fields and functions indicate the output columns and grain. The numbered
Markdown payloads and index are local, ignored files under
`docs/provideam-samples/`; report numbers below refer to the index
`Antoni Szklarski reports.md` there.

| SharePoint source | Candidate report numbers | Why the shape matches | Assessment |
|---|---|---|---|
| `source/plan_opt` | **03, 05, 09, 10, 11, 23, 25, 28, 34, 38** | Date, area, machine, shift, shift start, part; Good Parts, Defect Parts, Target, Capacity, OEE, Total Time, Planned OpT, OEE Time and Downtime Units | Strong schema match. Report 23 returned HTTP 200 with 30 rows and the expected response-key family. Exact scheduled SharePoint definition is unknown |
| `source/run_rates` | **01, 04, 06, 08, 12, 24, 27, 30, 33, 37** | Area, machine, hour, part and shift; Good Parts and Capacity | Strong schema/grain match. No response rows were retained for comparison with the CSVs |
| `source/volume_loss_correction` | **14–22 are only broad loss/OEE candidates** | These definitions select machine/area and calculate loss or OEE measures, but do not establish the correction export's row grain and columns (`ShiftStartDate`, machine, Group, SubGroup, Desc, Time, Loss Units) | Not a confirmed match. Report 14 returned HTTP 200, but its raw rows were not saved. Reports 15–22 returned HTTP 500 after actual-period retries |
| `source/line_losses` | **No confirmed candidate** | A direct match needs event-level start time, duration and comment, alongside machine, part, shift and loss hierarchy | The inspected saved definitions do not establish this Mode Log event schema |
| `reference/*` | **No direct report candidate established** | Format, shift, machine, equipment and target files are lookups rather than the report exports listed above | Do not treat reports 07, 31 or 32 as substitutes for these reference files |

Additional definitions with different purposes:

- **07 and 31** select date, machine, Availability and Performance. They
  returned HTTP 200 (43 and 21 rows), but the SharePoint inventory/model does
  not show an Availability/Performance source feeding a current target table.
- **26, 29, 35 and 36** select historical OEE, Availability and Performance.
  They may be relevant to historical data, but do not match one of the current
  SharePoint source folders above.
- **13** is a Not Staffed / Scheduled / CAPEX report; it is not a match for
  the documented row-level source folders.

## What “JSON to CSV” would mean

The saved JSON is a **request**, not the CSV data. A CSV replacement would
require calling the report endpoint, taking the returned `processedData`
records, and serializing those records with headers. A candidate is useful
only if its returned rows match the SharePoint file's grain, columns, time
window and values. The returned report rows were not saved for this
comparison, so HTTP 200 and a matching request shape do not prove equivalence.

## Confirmed versus not confirmed

The live test summary is 30/38 HTTP 200, including six successful responses
with zero rows; reports 15-22 remained HTTP 500 after actual-period retries.
Report 23 returned 30 rows, but those row values were not saved.

Confirmed from the source documentation: which SharePoint source types
contribute to which report tables. Confirmed from the saved definitions:
which requests select a Plan OPT or Run Rates-like set of fields. Not
confirmed: which exact definitions Antoni's email/Power Automate schedule
uses for each SharePoint destination, or whether the candidate API output
matches those CSV files row for row.

To establish the exact production mapping, match the scheduled email/report
name and Power Automate destination to a numbered saved definition, then
compare one same-site, same-production-day API result with its SharePoint CSV
(row count, keys, time boundary and measure sums). Preserve the source
payload's non-period selections unless a separate test is approved.
