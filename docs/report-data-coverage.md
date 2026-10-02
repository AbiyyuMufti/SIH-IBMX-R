# Report data coverage: Power BI OEE reports vs what the API provides

| At a glance | |
|---|---|
| **Use it to** | Check, item by item, which data for the Power BI OEE reports (EU Daily, Hull, Nottingham, Mira, Weinheim) the Insights Hub APIs provide, based only on **tested** calls |
| **Basis** | Tests on the `reckitt` tenant, 2026-10-02, API technical user. The "Class" column of the requirement list was **not** used |
| **Status words** | **FULFILLED** = tested and the field exists. **PARTIAL** = part of it exists, or it exists with a stated gap. **MISSING** = nothing tested provides it. **NOT TESTED** = could not be checked with the available data |
| **Result** | 12 FULFILLED, 11 PARTIAL, 2 MISSING, 0 NOT TESTED (see the table). The biggest gaps are the CU definition and factor, targets, and site coverage (only Hull has working data) |
| **Details** | Endpoint details: [endpoints.md](endpoints.md), [kpis.md](kpis.md), [assets.md](assets.md), [config-and-master-data.md](config-and-master-data.md), [manual-inputs.md](manual-inputs.md) |

## Facts that decide a lot (tested)
1. **Only Hull has usable OEE data today.** OEE assets per site: Hull 17 (B2 Line with 7 machines, GT4, plus test copies), Mira 15, Tuzla 6, STP 4, Weinheim 1, Nottingham 1. **Six assets are not configured** and answer HTTP 400 `Asset configuration not finished`: `L2` (Weinheim), `N1` (Nottingham), `L22_Labeller1/2/3` (STP) and the test asset `B2`. In the last 30 days only Hull (and 1.6 h on one Mira asset) returned downtime rows; 24 of 44 OEE assets returned none.
2. **The API has no CU concept.** Counts come in the asset's *product unit* (`Piece` for B2 Line, `Carton` for GT4). The unit list is `Carton`, `Technology`, `Piece`, with no conversion factor.
3. **OEE, TEEP, Availability, Performance, Quality come as finished ratios, but all building blocks come in the same response** (counts in ms or parts), so ratio-of-sums roll-ups are possible.
4. **Reason trees are partly shared.** 22 trees exist. The 38 OEE assets that have a `reasonTreeId` use 10 of them, and the largest group of 21 assets shares one tree. The other trees belong to single machines or lines (for example per B2 Line machine, per GT4 machine). 6 OEE assets have no tree.
5. **Calendars use 12-hour shifts** (06:00Z and 18:00Z starts, crew names such as Red, Gold, Blue on B2 Line; `Shift 1`, `Shift 2` on GT4). There is no afternoon shift.

## The 25 data items
Roll-up conflicts are stated against your "Roll-up rule" column.

| # | Data item | Status | API call and exact fields (or "none") | If not fulfilled: where it must come from | Conflict with the roll-up rule |
|---|---|---|---|---|---|
| 1 | Asset hierarchy: site, line, machine | **FULFILLED** | Asset Management `GET /api/assetmanagement/v3/assets` (paged): `assetId`, `name`, `parentId`, `typeId`. Level from `typeId` suffix: `basicsite`, `ProductionLine`, machine types (`B2_Line_Filler_Asset_OEE_Automatic`, `GT4_Equipment`). `GET /assets/{id}` adds `hierarchyPath` | | None. No explicit "level" field: derive from `typeId`. Names not unique, key on `assetId`. Match OEE assets by `assetId` |
| 2 | Area / department | **FULFILLED** | Same call: nearest ancestor with `typeId` `basicarea` (Hull > **Bottles** > B2 Line; Hull > **Blisters** > GT4) | | None. Test assets distort it (`Hull > Test Line > To Be B2` is itself a `basicarea`), so exclude `Test Line` |
| 3 | Timestamps of events and counts | **FULFILLED** | Time series `_time`; manual inputs `startTime`/`endTime`; `downtimeReasons` `from`/`to`; `evaluateKPIs` with `groupedByDateTime: true` gives `results[].groups[].time` (hourly); `timeModelCategoryDistribution` `from`/`to` | | None. All ISO 8601 UTC. Calendars are UTC+01:00 London, so local day boundaries need conversion |
| 4 | Shift model (SHIFT filter) | **FULFILLED** (tested on GT4) | `GET /assets/{id}/filterValues` → `filterValues[key=shift].value[]`; `evaluateKPIs` `scope.filter` key `SHIFT`. Tested: `SHIFT=Shift 1` returned the shift's counts, `Shift 2` returned 0 and OEE `null` | | Shift names differ per asset (GT4 `Shift 1/2`, B2 Line 15 values such as `Red`). Filter by shift not run on B2 Line |
| 5 | Shift start time | **FULFILLED** | `GET /calendars/{calendarId}/calendarEvents`: `name`, `rrule.dtstart`, `duration` (B2 Line `Hull Calendar`: 12 h, start 06:00Z or 18:00Z; GT4 calendar: same). Manual assets also `OEE_Hourly_Entry.ShiftStartTime`, `ShiftEndTime`, `ShiftName` | The Day / Afternoon / Night rule is a Reckitt definition (data has only two 12 h shifts) | None |
| 6 | Product master: brand, size, format, extra info, type | **PARTIAL** | `GET /productCollections/{id}/products`: `id`, `name`, `code`, `description` (null), `designSpeedValue`, `designSpeedUnit`, `designSpeedInterval`, `designSpeedType`. B2 Line collection: 123 products, `name` = numeric code. GT4: descriptive names (`250 mg tablets - Pep 8's`). Unit per asset: `productUnit` in the KPI response | Brand, size, format, extra info, type: **Reckitt SKU master**, joined on `code` | None |
| 7 | Reason tree: category > subgroup > reason | **FULFILLED** | `GET /reasontrees/{id}/reasons` (flat: `id`, `name`, `parentId`, `justification`). Easier: `downtimeReasons` rows give `reasonPath` and `reasonFullPath` (`Measurement and adjustment / Adjustment / OverWrapper - Sealing Bar`) | | Only **partly shared**: 10 trees are in use, one of them by 21 assets, the others by single machines or lines (B2 Line and GT4 machines have their own). Group by top-level name, which is not guaranteed identical across trees (seen: `Other` and `other`, a reason literally named `reason`) |
| 8 | KPIs: Good parts, Theoretical output, OEE, TEEP | **FULFILLED** (values) | `POST /expressions/evaluateKPIs`: `results[].name` = `Good parts`, `Theoretical output`, `OEE`, `TEEP`; `value`. Per period and asset | CU conversion: see #12 | **Counts are in `Piece` or `Carton`, not CUs.** OEE and TEEP are finished ratios: roll up from `Good parts` and `Theoretical output`. `Theoretical output` is **not split by `ORDER`** (265600 for both orders on GT4), so do not sum it across order filters; it does split by `SHIFT`. Unconfigured assets return HTTP 400. B2 Line values look implausible (Performance 2.17), see below |
| 9 | Time model: planned stop, availability loss, total time | **FULFILLED** | `evaluateKPIs`: `Planned stops`, `Planned stop from shift plan`, `Availability losses`, `Total time`, `Operational time`, `Net production time` (all **ms**). Segments: `POST /assets/{id}/timeModelCategoryDistribution` (automatic assets only) | | None, additive. `Total time` is calendar time inside the window, not the window length (GT4, 48 h window: 41.3 h) |
| 10 | Target configuration | **PARTIAL** | (a) `GET /assets/{id}` → `thresholds.warnings[]` / `errors[]` (`OEE`, `Availability`, `Performance`, `Quality`; 70 / 30 on B2 Line): alert thresholds, not targets. (b) `GET /assets/{id}/productionTarget` → `target[]` (`time`, `value`): production target curve in parts. (c) 23 of 44 asset `description` texts contain `RPS baseline OEE <period> <n>%; volume <n>`: free text | OEE target %, planned and unplanned loss % targets, per-category targets for the Pareto: **Reckitt target master** (the Power BI target tables) | Per-line grain is possible (all calls are per asset); weighting by capacity can use `Theoretical output` |
| 11 | KPIs: Availability, Performance | **FULFILLED** | `evaluateKPIs`: `Availability` (= Net production time / Operational time), `Performance` (= Total parts / Theoretical output) | | None. Both building blocks come in the same response, so sum then divide works. Note Performance uses **Total** parts, not Good |
| 12 | Production counts + CU factor | **PARTIAL** | Counts: `evaluateKPIs` `Good parts`, `Total parts`, `Rejected parts` (parts in `productUnit`). Units: `GET /productUnits` (`Carton`, `Technology`, `Piece`, no factor) | **CU factor: Reckitt master data** (per SKU). No field found in products, units or config | Additive once converted |
| 13 | Loss in CUs (loss time × rated speed × CU factor) | **PARTIAL** | Loss time: `downtimeReasons.lossTime` (ms), `Availability losses`, `Performance losses`. Rated speed: product `designSpeedValue` / `designSpeedUnit` / `designSpeedInterval` (B2 products: 210 Piece per MINUTE) | CU factor: see #12. Multiplication done outside the API | Additive. B2 Line `Performance losses` is negative (see #18) |
| 14 | KPIs: Total time, planned stop from shift plan, operational time | **FULFILLED** | `evaluateKPIs`: `Total time`, `Planned stop from shift plan`, `Operational time` (ms) | | None |
| 15 | Downtime reasons: loss time and occurrence count | **FULFILLED** | `GET /assets/{id}/downtimeReasons?from&to&page&size`: `reason`, `reasonPath`, `reasonFullPath`, `duration`, `lossTime`, `occurrence`, `from`, `to`. Paging works: `page` (0-based) and `size` (`size=300` returned all 232 rows, default 25). Aggregates: `topDowntimeReasons`, `downtimeDistribution` | | None, additive. On automatic assets a row is one stop event with exact times. On manual assets a row spans the whole shift. `duration` is a string on B2, a number on GT4 |
| 16 | MTTR | **FULFILLED** | `evaluateKPIs`: `MTTR` (ms) = `Availability losses` / `Availability loss (occurrence)`; both parts are in the same response | | None: roll up as sum of `Availability losses` / sum of `Availability loss (occurrence)`. It counts availability losses only, not micro stops |
| 17 | Downtime with no reason ("Not Logged") / top level only | **PARTIAL** | No "Not Logged" name exists. Unlogged stops on automatic assets appear as reason `Unplanned Downtime` with `reasonPath: null` (B2 Line, 24 h: all 232 rows) and as the pseudo-reason `##MICROSTOPS##` (`isMicrostop: true` in `statusDistribution`; blank path in `topDowntimeReasons`, 372,129 events on Hull in 30 d). Top level only: first segment of `reasonFullPath` | The rule "not logged = `Unplanned Downtime` with no sub-path, plus micro stops" must be agreed with Reckitt | None, additive |
| 18 | Performance losses + design speed = "Reduced Speed" | **PARTIAL** | `evaluateKPIs` `Performance losses` (ms) = (1 − Performance) × Net production time. Design speed: product `designSpeed*`, and `GET /assets/{id}/designSpeedSource` | The Reckitt definition of "Reduced Speed" | Additive minutes, **but negative when Performance > 1** (B2 Line: about −75 million ms in 24 h). Needs a design-speed check before use |
| 19 | Event comments | **PARTIAL** | `GET /assets/{id}/comment?from&to` returned `[]` on GT4 (7 d) and B2 Line (7 d): item shape never seen. Manual assets: `OEE_Hourly_Entry.Comments` (text holding JSON: `reasonId`, `comment`, `startTime`). `downtimeReasons.commentCount` (0 in all tests) | Automatic assets: none seen. Comment text lives in the hourly entries for manual assets | Row-level text, no conflict. Contains operator data, check privacy |
| 20 | Capacity in CUs (rated CU/hr × time) | **PARTIAL** | `evaluateKPIs` `Theoretical output` = capacity in parts for the period | CU factor: see #12 | Additive; not split by `ORDER` (see #8) |
| 21 | MTBF (Power BI says MTTF) | **PARTIAL** | `evaluateKPIs` `MTBF` (ms) = `Net production time` / `Availability loss (occurrence)`. There is **no MTTF** among the 34 expressions | Whether it equals the Power BI MTTF: ask Reckitt for the Power BI formula | Roll-up as sum of `Net production time` / sum of occurrences works. Equality with MTTF was **not** compared (no reference values) |
| 22 | Run rate CUs/hr per SKU | **PARTIAL** | `PRODUCT` filter works: on GT4 `PRODUCT=<name>` returned counts and a changed OEE; `filterValues` lists the products. Per-product run hours were **not** tested | CU factor: see #12 | Ratio of sums needs `Net production time` per product (not tested) |
| 23 | Activity name list (is it the loss reason?) | **PARTIAL** | Status names: `manualInputs.statuses[].name` (`Run`, `Planned Downtime`, loss reasons), `statusDistribution.distribution[].reason` (`Planned Downtime`, `##MICROSTOPS##`, `Unplanned Downtime`). So "activity" matches a **status (reason including Run and planned stops)**, not only a loss reason | Confirm with Reckitt that the Power BI "Activity" is the status | None |
| 24 | Legacy Power BI history Jan 22 to Oct 24 | **MISSING** | none | Reckitt Power BI export or file. Not in the OEE app (old method) | None (static) |
| 25 | Static text and form link | **MISSING** | none (not API data) | Report content, plus the URL of the operators' digital form | None |

## Outstanding items, ordered by components blocked
| Rank | Item | Components blocked | Count |
|---|---|---|---|
| 0 | **Site coverage:** Nottingham `N1` and Weinheim `L2` unconfigured (HTTP 400), Mira and the others return almost no downtime, 3 of 4 STP assets unconfigured. Not a data item, but it blocks every component for N, M, W and the EU roll-up beyond Hull | all, for N M W | all |
| 1 | **CU definition and CU factor** (#12, #13, #20, #22, and the CU basis of #8) | C02 C04 C07 C11 C14 C17 C18 C19 C21 C25 C26 | 11 |
| 2 | **Targets** (#10: OEE target, loss targets, per-category targets) | C02 C08 C13 C17 C19 C25 | 6 |
| 3 | **Product master** (#6: brand, size, format, type) | C01 C18 | 2 (C01 is on all pages) |
| 4 | Day / Afternoon / Night rule (#5) | C01 | 1 |
| 5 | "Not Logged" rule (#17), "Reduced Speed" definition (#18) | C08 | 1 |
| 6 | Comments for automatic assets (#19) | C11 | 1 |
| 7 | MTBF vs MTTF formula (#21) | C16 | 1 |
| 8 | Activity = status (#23) | C17 | 1 |
| 9 | Legacy history (#24), static text and form link (#25) | C20, C22 | 1 each |

## Data found that is not in your table but is useful
| Data | Where | Use |
|---|---|---|
| **Missing-period flag** | `evaluateKPIs` → `missingMapping[]` (`{ "key": "Manuals", "value": "Missing production periods(s) found" }` on GT4) | Tells you that a manual asset has periods without operator input. Show or filter it in the reports |
| Hourly KPI values | `evaluateKPIs` / `/expressions/{id}/evaluate` with `groupedByDateTime: true` → `groups[]` per **hour** only | Trends (C09, C15, C19, C25), 24 h matrix (C14). Daily or weekly needs your own aggregation of sums |
| Stop events with exact times | `downtimeReasons` rows (`from`, `to`, `duration`, `occurrence`) on automatic assets | Drill-down (C11), top lists (C12), 24 h matrix (C14) |
| Micro vs macro stops | `Micro stops (duration/occurrence)`, `Macro stops (duration/occurrence)`, rule `GET /microStops` (5 MINUTE, booked under PERFORMANCE) | Separates short stops from reportable ones |
| Alert thresholds | `GET /assets/{id}` `thresholds` | Colour bands for gauges (C02, C03) |
| Production target curve | `GET /assets/{id}/productionTarget` `target[]` | Target line for volume charts (C25) |
| Baseline OEE and volume (free text) | Asset `description` of 23 of 44 OEE assets (`RPS baseline OEE ...`) | A seed for targets, but unstructured |
| Planned stops from the shift plan | `Planned stop from shift plan`, calendar events | Planned vs unplanned split |
| Reason change audit | `downtimeReasons` `overwritten`, `originalReasonId`, `userId`, `changedAt`, and reason `justification` | Quality of reason logging |
| Configuration state | OEE `/assets` `isConfigured`, `isManual`; `/assets/{id}/config` `mode` per source | Tells connected from manual and finished from unfinished assets |
| Unit per asset | `productUnit` in the KPI response (`Piece`, `Carton`) | Needed for the CU conversion |
| Formula audit | `results[].humanFormula` | Shows how each KPI was calculated, with operand values |

## Check against your parquet design rules (what the API does)
- **Asset context is not in the response.** `evaluateKPIs` returns no `assetId`, name, site or area (the `scope` echo has only `from`, `to`, `filter`, `recursive`, `groupedByDateTime`). Add `assetId` from the request, and Site, Area and Line from the Asset Management hierarchy (#1, #2).
- **Same columns for every line:** B2 Line and GT4 both returned the same 30 KPI names with `recursive: false`. Do not use `recursive: true` for the table (51 rows, extra operand rows with array values).
- **Building blocks are available** for the roll-up rule (see the table), but **`value` can be `null`** (GT4 `SHIFT=Shift 2`: OEE `null`). Make value columns nullable.
- **Types:** the API returns times as ISO strings and values as JSON numbers; `productUnit` is a string. Whether Paul's Parquet node types them as BYTE_ARRAY was **not tested** (it is a Node-RED node setting, not an API property).

## Your open questions
| Question | Answer from the tests |
|---|---|
| What is a CU, and where do targets come from? | No CU concept or factor in any tested call. Counts use the asset's product unit (`Piece`, `Carton`). Targets: only alert thresholds, a target curve and baseline text in descriptions, no target master. Ask Reckitt |
| Do OEE values match the Power BI answer key for one line and day? | **Not tested** (no answer key). Do not trust B2 Line yet: Performance 2.17 and more rejected than good parts in the test window. GT4 has little data (2 shift entries in 7 days) |
| Is MTBF the same as MTTF? | The formula of MTBF is known (`Net production time` / number of availability losses). There is no MTTF expression. Not compared with the report |
| Is the blank "Breakdown Loss %" on Hull a data gap or a report bug? | In the API, Hull's `Breakdown` reason totalled **17.0 h, 5 events, on one asset in 30 days**, while default `Unplanned Downtime` was 824.8 h on 8 assets and blank-path micro stops 612 h. Few stops get a Breakdown reason, so a blank or tiny value looks like **data** (stops are rarely given a reason), not necessarily a report bug. The report itself was not inspected, so this is not conclusive |
