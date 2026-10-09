# Power BI tables straight from the API (two flows)

| At a glance | |
|---|---|
| **What** | Two VFC tabs that write the Power BI shaped tables directly from Insights Hub. No `fact_*` or `dim_*` files in between, no parquet read nodes |
| **Why** | The tab view (Power BI side) needs the Power BI format as its data source. The two-step way (facts first, then a conversion flow) is replaced by this one step |
| **Flows** | `flows/vfc-pbi-daily-hull.json` (tab `Hull Power BI daily`) and `flows/vfc-pbi-reference.json` (tab `Power BI reference`). Generator `scripts/build-vfc-pbi-flows.js`, code `scripts/vfc/d*.js` (daily) and `m*.js` (reference), column lists `scripts/lib-pbi-schemas.js` |
| **Status** | Mock tests pass (`node scripts/test-vfc-pbi-direct.js`): same rows as the old chain. Not run in the VFC yet. `dryRun` is true by default |
| **Needs** | The Config tab (`flows/vfc-config.json`), unchanged |
| **Old flows** | `vfc-site-hull.json`, `vfc-reference-tables.json`, `vfc-powerbi-tables.json` stay in the repo. They are not needed any more for Power BI; disable them when the new ones run (they would call the same API a second time) |

## Tables and where they are written
| Table | Flow | One row is | File |
|---|---|---|---|
| `pbi_plan_opt` | daily | machine x production day x shift | `<root>/pbi_plan_opt/site=Hull/pbi_plan_opt_YYYY-MM-DD.parquet` |
| `pbi_time_utilisation` | daily | machine x production day | `<root>/pbi_time_utilisation/site=Hull/pbi_time_utilisation_YYYY-MM-DD.parquet` |
| `pbi_daily_losses` | daily | one stop | `<root>/pbi_daily_losses/site=Hull/pbi_daily_losses_YYYY-MM-DD.parquet` |
| `pbi_machine_names` | reference | one machine (all sites of the Config tab) | `<root>/pbi_machine_names/pbi_machine_names.parquet` |
| `pbi_shift_naming` | reference | one distinct shift name (all calendars) | `<root>/pbi_shift_naming/pbi_shift_naming.parquet` |
| `pbi_calendar` | reference | one date (generated) | `<root>/pbi_calendar/pbi_calendar.parquet` |

A rerun replaces the file. The folder prefix `site=` is the constant `FOLDER_PREFIX` in node `1.1 SITE SETTINGS`.

## Daily flow (per site, per production day)
1. Triggers: schedule (07:00 UTC for Hull) and a backfill inject. `1.1 SITE SETTINGS` (site, dry run, rebuild days, folder prefix) and `1.2 Build day list`. One message per day, one day per 5 s.
2. Day setup: token, OEE asset list, choose assets, one message per asset (same nodes as the fact flow).
3. Asset KPIs: Asset Management GET (hierarchy), `evaluateKPIs` POST, check, pivot to hourly values.
4. Asset shifts (new): OEE `/assets/{id}/config` for the calendar id, `/calendars/{id}/calendarEvents?from&to` for the production day, shift rules (freq, interval, start, until, duration). `4.4` groups the hours per shift: `total_time` = (total - shift plan stop) min, `planned_opt` = operational time min, `oee_time` = used operational time min. An hour outside every shift gets `shift_name` null.
5. Asset stops: `downtimeReasons` GET, then one `pbi_daily_losses` row per stop that starts inside the production day (local date and time Europe/London, shift, duration in minutes, loss group, sub group, equipment).
6. Join, collect, decide, one message per table. Any failed asset = nothing written for the day (no half days). A day with no rows = `NOTHING TO WRITE`.
7. Three write lanes (parquet, path, write object) and the log lanes (CSV `<root>/logs/pbi-hull/log_YYYY-MM.csv`).

## Reference flow (all sites, weekly Monday 07:00 UTC and `Run now`)
Token, asset list, choose assets, per asset the hierarchy and the OEE config. The machine rows go to `pbi_machine_names`; the distinct calendar ids go to one `calendarEvents` call each and the distinct event names become `pbi_shift_naming`. `pbi_calendar` is generated from `CALENDAR_START` and `CALENDAR_END` in `1.1 TASK SETTINGS`. Log: `<root>/logs/pbi-reference/`.

## Same rules as the earlier two-step chain
The new flows give the same rows as fact flow + conversion flow on the mock (plan, time utilisation, daily losses, machine names, shift names). One known difference: a stop without a duration now has `duration` null (the old chain wrote 0).

## Still null or approximate (unchanged, Reckitt input needed)
Product, part name, capacity, downtime units, loss units, batch id, `volume_total` (cross-day), all targets (Glidepaths), `product_type`, sub group is the top level of the reason (stand-in), local time is Europe/London only, shift recurrence is evaluated in UTC (a shift defined in local time moves by one hour at the clock change: open point), `pbi_shift_naming` includes the Changeover events (category filter open).

## Not tested on the real tenant yet
- `calendarEvents?from&to` with a window of one production day: the mock returns the same events for any window. If the real answer is empty for a day, every shift is null: check `shift_name` in the dry-run log.
- The `link` nodes between lanes (as in the other flows).
- More API calls per asset and day than the fact flow (config and calendar events): about 5 instead of 3.
