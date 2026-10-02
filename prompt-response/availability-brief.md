# Brief: what the Insights Hub API gives for the Reckitt OEE reports, and what it does not

Context: tested on tenant `reckitt` (gateway `https://gateway.eu1.mindsphere.io`) on 2026-10-02 with the API technical user. Goal: recreate the Power BI OEE reports (EU Daily, Hull, Nottingham, Mira, Weinheim) from Insights Hub OEE data. Everything below was tested by real calls (reads, plus 3 read-only calculation POSTs). No write calls were run.

## Available (tested)
- **Auth:** one POST token (valid about 30 min), then `Authorization: Bearer <token>`.
- **Hierarchy:** site, area (department), line, machine, via Asset Management `GET /assets` (`assetId`, `parentId`, `typeId`). Needs `Accept: application/hal+json`. 246 assets, 44 are OEE assets.
- **KPIs per asset and period:** `POST /api/oee/v3/expressions/evaluateKPIs` returns 30 KPIs in one call: OEE, TEEP, Availability, Performance, Quality, Good/Total/Rejected parts, Theoretical output, Total time, Planned stops, Operational time, Net production time, Availability losses, Performance losses, Quality losses, MTTR, MTBF, micro/macro stops (duration, count). Ratios are fractions, times are milliseconds. All building blocks come in the same response, so "sum, then divide" roll-ups work.
- **Hourly KPI values:** same call with `groupedByDateTime: true` (hourly only).
- **Filters:** `SHIFT`, `PRODUCT`, `ORDER` work in `scope.filter` (values from `GET /assets/{id}/filterValues`).
- **Downtime:** `GET /assets/{id}/downtimeReasons` (stop events with `from`, `to`, `duration`, `occurrence`, `reasonPath`, `reasonFullPath`; page with `page` and `size`), `topDowntimeReasons`, `topRejectReasons`, `statusDistribution`, `downtimeDistribution`.
- **Reason tree:** category > subgroup > reason from `reasonFullPath`, or the flat `GET /reasontrees/{id}/reasons` (`parentId`).
- **Shifts:** calendar events (`rrule.dtstart`, `duration`), shift names in `filterValues`; manual assets also `ShiftName`, `ShiftStartTime` in `OEE_Hourly_Entry`.
- **Raw data:** `GET /api/iottimeseries/v3/timeseries/{assetId}/{aspect}` (max 2000 records and 90 days per call).
- **Operator input (manual assets such as GT4):** `GET /assets/{id}/manualInputs`, time series `OEE_Hourly_Entry`.
- **Setup and master data:** `/assets/{id}/config`, calendars, products (with design speed), time model, reason trees, state tables, expressions (all 34 formulas), operands.
- **Targets (partial):** alert thresholds (OEE 70 / 30), `productionTarget` curve, baseline OEE text in 23 of 44 asset descriptions.

## Not available or not usable yet
- **CU (consumer unit):** no CU concept or conversion factor in any call. Counts are in the asset's product unit (`Piece` for B2 Line, `Carton` for GT4). Blocks OEE in CUs, capacity, loss in CUs and run rate (11 report components).
- **Targets:** no OEE target %, loss target or per-category target. Needs the Reckitt target master (6 components).
- **Product master:** brand, size, format, type not in the API (only name, code, design speed). Needs the Reckitt SKU master, keyed on `code`.
- **"Not Logged" downtime:** no such field. Unlogged stops show as reason `Unplanned Downtime` with no sub-path, plus the pseudo-reason `##MICROSTOPS##`.
- **MTTF:** no such KPI. Only MTBF (`Net production time` / number of availability losses). Not compared with Power BI.
- **Comments:** `/comment` returned an empty list; manual comments exist only in `OEE_Hourly_Entry.Comments` (GT4).
- **Afternoon shift:** calendars have only two 12 h shifts (06:00Z and 18:00Z starts).
- **Legacy Power BI history (Jan 22 to Oct 24), static text, form link:** not in any API.
- **Asset types** (`/assettypes`, `/aspecttypes`): HTTP 403 for this user.
- **Event Management, Node-RED SDK nodes, all write calls:** not tested.

## Coverage of the sites
- Only **Hull** has usable data (B2 Line automatic, GT4 manual).
- **Nottingham `N1` and Weinheim `L2` are not configured** (HTTP 400 "Asset configuration not finished"). STP has 3 of 4 unconfigured.
- **Mira** has 15 OEE assets but returned only 1.6 h of downtime in 30 days. **Tuzla** returned none.

## Gotchas that affect the reports
- `Theoretical output` is **not split by `ORDER`**: do not sum it across order filters. It does split by `SHIFT`.
- A KPI `value` can be `null` (empty shift). `duration` is text on B2 Line, a number on GT4.
- `evaluateKPIs` returns no asset ID, name, site or area: add them yourself from the request and the hierarchy.
- Use `recursive: false`. With `true` you get 51 rows (extra operand rows).
- `timeModelCategoryDistribution` (machine timeline) works on automatic assets only (GT4 returns 400).
- **B2 Line numbers look implausible** (Performance 2.17, more rejected than good parts): check design speed and counters before comparing with Power BI.
- Reason trees are only partly shared (10 trees for 38 assets, one used by 21 assets): group by top-level name carefully.
- Asset names are not unique (two `GT4`), always use `assetId`. All API times are UTC, calendars are UTC+01:00.

## Status: 25 requirement items
12 fulfilled (hierarchy, area, timestamps, shift model, shift start, reason tree, KPIs good parts/theoretical output/OEE/TEEP, time model, availability and performance, total/operational time, downtime reasons, MTTR). 11 partial (product master, targets, CU factor, loss in CUs, not logged, reduced speed, comments, capacity in CUs, MTBF vs MTTF, run rate per SKU, activity list). 2 missing (legacy history, static text and form link).

## Ranked next steps
1. Agree the CU definition and factor with Reckitt. 2. Get the target master. 3. Get the SKU master. 4. Configure the Nottingham and Weinheim assets, and check why Mira, Tuzla and STP show almost no downtime. 5. Check B2 Line design speed and counters.

Full detail: `prompt-response/cross-check-result.md` (readable), `prompt-response/report-data-coverage.md` (per item, exact call and field), `docs/endpoints.md` (every tested call), `docs/quickstart.md` (Node-RED setup).
