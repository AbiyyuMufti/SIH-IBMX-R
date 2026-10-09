# Power BI shaped tables (flow `flows/vfc-powerbi-tables.json`)

| At a glance | |
|---|---|
| **What** | OLD two-step way, replaced by [powerbi-direct.md](powerbi-direct.md) (flows that call the API directly). One flow that writes the Power BI tables we can rebuild, from the files our other flows already wrote. No call to Insights Hub |
| **Source** | Excel mapping `Reckitt_IH_vs_PowerBI_Overview_mapping.xlsx` (Table summary, PBI column mapping) |
| **Reads** | `dim_asset`, `dim_shift`, and per day `fact_kpi`, `fact_loss` |
| **Writes** | `pbi_plan_opt`, `pbi_time_utilisation`, `pbi_daily_losses` (per day), `pbi_machine_names`, `pbi_shift_naming` (per site), `pbi_calendar` (once) |
| **Status** | Mock tests pass (`node scripts/test-vfc-powerbi.js`). Not run in the VFC. The parquet READ node settings are a guess until confirmed in the VFC |
| **Generator** | `scripts/build-vfc-powerbi-flow.js`, code in `scripts/vfc/p*.js` |

## Which node creates which table
| Power BI table | Our table | Made by | Rule |
|---|---|---|---|
| Machine Names EU | `pbi_machine_names` | 4.3 Build table messages | dim_asset rows of the site. `dept` = area. `product_type` null (missing) |
| Plan OPT EU | `pbi_plan_opt` | 4.1 Build plan opt rows | Hourly fact_kpi rows grouped to machine x production day x shift. Shift from the dim_shift recurrence. `total_time` = (total - shift plan stop) min, `planned_opt` = operational time min, `oee_time` = used operational time min. Null: product, capacity, downtime units, targets |
| Time Utilisation EU | `pbi_time_utilisation` | 4.1 Build plan opt rows | Sums of the plan rows per machine and day, `all_time` = 1440 |
| Daily Losses EU | `pbi_daily_losses` | 4.2 Build daily loss rows | One row per stop. Local date and time (Europe/London, UK only). Loss group: planned roots from Config = Planned Loss, default reason `Unplanned Downtime` = Not Logged, else Unplanned Loss. Sub group = reason top level (stand-in), equipment = second level. Null: loss units, product, batch, comment text, targets, volume total |
| Shift Naming EU | `pbi_shift_naming` | 4.3 Build table messages | Distinct shift names of the calendars of the site |
| Calendar | `pbi_calendar` | 1.3 Build calendar rows | Dates from `calendarStart` to `calendarEnd` (settings node), Monday week start, ISO week number |
| OEE / PDT / UPDT Targets, Targets Losses | none | | Missing: Reckitt Glidepaths files |

## Rules and limits
- Dates are the production day (06:00 to 06:00 UTC for Hull), as in the mapping assumptions.
- A day with no `fact_kpi` or `fact_loss` file stops after the read (the read node only warns). A day with zero stops has no fact_loss file, so that day is skipped too.
- `volume_total` (good parts per machine and month on every loss row) needs several days at once and is not built yet.
- Shift rule: DAILY and WEEKLY recurrences of the calendar events; an instant outside every event gets `shift_name` null.
- The flow is per site (`SITE_NAME` in node 1.1). The folder prefix `site=` is the constant `FOLDER_PREFIX`.
