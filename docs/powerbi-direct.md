# Power BI tables straight from the API (two flows)

| At a glance | |
|---|---|
| **What** | Two VFC tabs that write the Power BI shaped tables directly from Insights Hub. No `fact_*` or `dim_*` files in between, no parquet read nodes |
| **Why** | The tab view (Power BI side) needs the Power BI format as its data source. The two-step way (facts first, then a conversion flow) is replaced by this one step |
| **Flows** | `flows/vfc-pbi-daily-hull.json` (tab `Hull Power BI daily`) and `flows/vfc-pbi-reference.json` (tab `Power BI reference`). Generator `scripts/build-vfc-pbi-flows.js`, code `scripts/vfc/d*.js` (daily) and `m*.js` (reference), column lists `scripts/lib-pbi-schemas.js` |
| **Status** | Mock tests pass (`node scripts/test-vfc-pbi-direct.js`): same rows as the old chain on a day without products; product and order tested on the mock. Not run in the VFC yet. `dryRun` is true by default |
| **Needs** | The Config tab (`flows/vfc-config.json`), unchanged |
| **Old flows** | `vfc-site-hull.json`, `vfc-reference-tables.json`, `vfc-powerbi-tables.json` stay in the repo. They are not needed any more for Power BI; disable them when the new ones run (they would call the same API a second time) |

## Tables and where they are written
| Table | Flow | One row is | File |
|---|---|---|---|
| `pbi_plan_opt` | daily | machine x production day x shift x product | `<root>/pbi_plan_opt/site=Hull/pbi_plan_opt_YYYY-MM-DD.parquet` |
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
4. Asset shifts: OEE `/assets/{id}/config` for the calendar id and the product collection id, `/calendars/{id}/calendarEvents?from&to` for the production day, shift rules (freq, interval, start, until, duration).
5. Asset products (new): `GET /assets/{id}/filterValues?from&to` (the Product and Order dropdowns of the OEE app) and `GET /productCollections/{id}/products` (name, code, description, design speed).
6. Value KPIs (new): ONE hourly `evaluateKPIs` POST per product and per order of the day, filtered on that value (read-style, the same POST as step 3). An hour belongs to the value when it has total parts (else good parts) above 0. The messages are collected in flow context (`valueRuns`), not with a second split.
7. Assign and plan (new): every hour gets its product and order. An hour without parts takes the value of the hour before it (the first hours take the next value). Then the hours are grouped per shift AND product: `total_time` = (total - shift plan stop) min, `planned_opt` = operational time min, `oee_time` = used operational time min, `capacity` = design speed per minute x `planned_opt`, `downtime_units` = design speed per minute x downtime minutes, `part_name` = product description (name when there is none), `product_key` = product code (name when there is none). An hour outside every shift gets `shift_name` null.
8. Asset stops: `downtimeReasons` GET, then one `pbi_daily_losses` row per stop that starts inside the production day (local date and time Europe/London, shift, duration in minutes, loss group, sub group, equipment). Product, part name and `batch_id` (= the order) are those of the hour of the stop, `loss_units` = design speed per minute x duration in minutes.
9. Join, collect, decide, one message per table. Any failed asset = nothing written for the day (no half days). A day with no rows = `NOTHING TO WRITE`.
10. Three write lanes (parquet, path, write object) and the log lanes (CSV `<root>/logs/pbi-hull/log_YYYY-MM.csv`).

## Reference flow (all sites, weekly Monday 07:00 UTC and `Run now`)
Token, asset list, choose assets, per asset the hierarchy and the OEE config. The machine rows go to `pbi_machine_names`; the distinct calendar ids go to one `calendarEvents` call each and the distinct event names become `pbi_shift_naming`. `pbi_calendar` is generated from `CALENDAR_START` and `CALENDAR_END` in `1.1 TASK SETTINGS`. Log: `<root>/logs/pbi-reference/`.

## Same rules as the earlier two-step chain
The new flows give the same rows as fact flow + conversion flow on the mock (plan, time utilisation, daily losses, machine names, shift names). One known difference: a stop without a duration now has `duration` null (the old chain wrote 0).

## Product and order: how it works and what to know
- **Match by name.** The values of `filterValues` are product NAMES and order numbers. The master record is found by product name in the collection of the asset. A name that is not in the collection (or an asset with no collection) keeps the name as part name and key and gets no design speed.
- **Part name.** The product description when there is one, else the name. B2 Line products have a number as name and the readable text in the description; GT4 products have a readable name and no description. Assumption from the Power BI copy (see below), to confirm in Power BI Desktop.
- **Product key.** The product code (the mapping Excel says `dim_product.code`, "as PartName"); the name when the code is empty.
- **Design speed.** Converted to parts per minute from `designSpeedInterval` (SECOND, MINUTE, HOUR, DAY). Any other interval gives no speed. The unit differs per asset (B2 Line pieces, GT4 cartons): not converted.
- **Batch id.** The order. Assumption: nothing else in Insights Hub matches. Only in `pbi_daily_losses` (the Plan OPT copy has no batch column).
- **Cost.** One filtered `evaluateKPIs` call per product and per order of the day and asset (B2 Line: 2 to 5 of each), one per second. A day with more than 30 products or orders for one asset fails that asset (`MAX_VALUES` in node 5.2).
- **Idle hours.** An hour with no parts is given to the product of the hour before, so the sums of the day do not change. A day with no production at all has no product (null).

## Differences with the Power BI copy (Plan OPT EU) and assumptions
Checked on 2026-10-12 against a copy of the Power BI Plan OPT EU table (provided by the user) (44,686 rows, dummy data from a local Power BI copy, Dec 2024 to Sep 2026; 16,655 rows for Hull). The copy is only a reference: it mixes two sources and has duplicate keys.
| Topic | Plan OPT EU copy | Our flow | Status |
|---|---|---|---|
| Grain | one row per date, machine, shift and part (about 94 % of the shifts have one part) | one row per production day, machine, shift and product | Agreed (user, 2026-10-12) |
| `unique_machine_name` | `machine-site` text (machine name, dash, site name) | the Insights Hub asset id (the mapping Excel says "Direct (our key)") | Accepted by the user. All our tables use the same value. Whether Power BI uses it in a relationship is still to check in Power BI Desktop |
| `product_key` | `unique_machine_name` + space + part name | the product code | Accepted by the user for now: "needs to be clarified" |
| `part_name` | readable product text; the same style as the product descriptions of the B2 Line collection (comma separated, SAP style); the GT4 products appear with their names | description, else name | Assumption, to check |
| `capacity` | mostly design speed x planned OpT (the speed per minute is constant for 56 % of the machine and part pairs; for the rest it differs, one GT4 product shows a lower speed than its design speed) | design speed per minute x `planned_opt` | **Assumption, unconfirmed.** Must be clarified |
| `oee_time` | good parts / design speed (89 % of the Hull rows) | used operational time (KPI) | Same idea; to compare on real data |
| `downtime_units` | downtime minutes x design speed (0 when no downtime was logged) | downtime duration KPI x design speed | Assumption |
| `total_time`, `planned_opt` | 12 h shifts 720, 8 h shifts 480; equal in 74 % of the rows | total minus shift plan stop; operational time | Unchanged |
| `date` | calendar date, weekends included | production day (06:00 to 06:00 UTC for Hull) | Not crucial: a change is a window setting and a backfill |
| `shift_name` (Hull) | crew colours for 12 h shifts and Day, Afternoon, Night for 8 h shifts | the event names of the Insights Hub calendar | Accepted: names may differ, structure is the same |
| `area_name` | its own area names (not the Insights Hub ones) | the Insights Hub area (Blisters, Bottles, ...) | Accepted, same reason |
| Targets | filled for about 90 % of Hull | null | Glidepaths (Reckitt) |
| Duplicates | 1,384 Hull rows share date, machine, shift and part (two sources) | none | Copy only |

## Still null or approximate
`product_type`, `dept` and `area` all carry the Insights Hub area (Bottles, Blisters) since 2026-10-13: Insights Hub has no department or product type, so the three columns are redundant until Reckitt gives the real mapping (the Power BI local copy has Liquids Pack / Liquids / Bottles for B2 and Dries Pack / Dries / Blisters for GT4; the lake files keep the old empty value until the reference flow is run again), `volume_total` (cross-day), all targets (Glidepaths), `equipment`, sub group and `breakdown_types` (the real reason tree is needed: see the empty-column check), `capacity`, `downtime_units` and `loss_units` (assumptions above), local time is Europe/London only, shift recurrence is evaluated in UTC (a shift defined in local time moves by one hour at the clock change: open point), `pbi_shift_naming` includes the Changeover events (category filter open). Planned stop segments of `timeModelCategoryDistribution` come from the shift calendar only and reasons carry no time category in the API, so the loss group still uses the planned roots of the Config tab.

## Checked on the real tenant (dry run off, one day: 2026-09-15, B2 Line and GT4)
- **Shifts:** the one-day `calendarEvents` window works. `shift_name` is filled (crew names on B2 Line, Shift 1 and Shift 2 on GT4).
- **Product:** the filter value is the product name (B2 Line: the number, GT4: the text). Both assets got `part_name` and `product_key` on every plan row and every stop. B2 Line `part_name` is the product description, GT4 the name; the key is the code (B2 Line: a number, GT4: a text code).
- **Capacity:** filled on both assets and equal to design speed per minute x planned OpT (B2 Line 136,800 = 190 per minute x 720 min). `loss_units` filled on all 196 stops.
- **`oee_time` against good parts / design speed:** equal on GT4 (208.18 min), about 9 % higher on B2 Line (302.06 against 276.4). Not explained yet.
- **`batch_id`:** filled on GT4 stops (the order), empty on all 193 B2 Line stops. To check: does B2 Line have orders on that day (Order dropdown of the OEE app)?
- **Still empty as expected:** `breakdown_types` 100 %, `equipment` 54 %, targets, `volume_total`.
- **Not checked yet:** the load (one filtered call per product and order, one per second) for a full day of all assets, and a day with several products.
