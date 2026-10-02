# Cross-check result: can the Insights Hub APIs feed the Power BI OEE reports?

| At a glance | |
|---|---|
| **Question** | For each of the 25 data items needed to recreate the Power BI OEE reports (EU Daily and the Hull, Nottingham, Mira and Weinheim site reports), does the Insights Hub API provide it? |
| **Answer** | 12 items **fulfilled**, 11 **partial**, 2 **missing**, 0 not tested |
| **Basis** | Real calls on the `reckitt` tenant, 2026-10-02, with the API technical user. The "Class" estimate in the requirement list was not used |
| **Biggest gaps** | The CU definition and factor, targets, product master data, and site coverage (only Hull has working data today) |
| **Detail** | Full table with the exact call and field per item: [report-data-coverage.md](report-data-coverage.md). Endpoint details: [endpoints.md](../docs/endpoints.md) |

Status words: **FULFILLED** = tested and the field exists. **PARTIAL** = part of it exists, or it exists with a stated gap. **MISSING** = nothing tested provides it. **NOT TESTED** = could not be checked.

## The facts that decide most of it
- **Only Hull has usable OEE data today.**
  - OEE assets per site: Hull 17, Mira 15, Tuzla 6, STP 4, Weinheim 1, Nottingham 1.
  - Six assets are **not configured** and answer HTTP 400 "Asset configuration not finished": Nottingham `N1`, Weinheim `L2`, three STP labellers (`L22_Labeller1/2/3`) and a test asset.
  - In the last 30 days only Hull, plus 1.6 hours on one Mira asset, returned any downtime.
- **The API has no CU concept.** Counts come in the asset's product unit (`Piece` for B2 Line, `Carton` for GT4). The unit list (`Carton`, `Technology`, `Piece`) has no conversion factor.
- **Finished ratios come with their building blocks.** OEE, TEEP, Availability and Performance arrive as ratios, but Good parts, Theoretical output and the times arrive in the same response. Roll-ups as "sum, then divide" are therefore possible.
- **Reason trees are partly shared.** The 38 OEE assets that have a tree use 10 trees, and the biggest group of 21 assets shares one tree. The others belong to single machines or lines.
- **Calendars use two 12-hour shifts** (starts 06:00 and 18:00 UTC). There is no afternoon shift in the data.

## Status of the 25 items
| # | Data item | Status | Provided by, or the gap |
|---|---|---|---|
| 1 | Asset hierarchy: site, line, machine | FULFILLED | Asset Management `GET /assets`: `assetId`, `parentId`, `typeId` |
| 2 | Area / department | FULFILLED | Nearest ancestor of type `basicarea` (Hull > Bottles > B2 Line; Hull > Blisters > GT4) |
| 3 | Timestamps of events and counts | FULFILLED | `_time`, `from` / `to`, hourly `groups[].time` (all UTC) |
| 4 | Shift model (SHIFT filter) | FULFILLED | `filterValues` (shift) plus the `SHIFT` filter in KPI calls, tested on GT4 |
| 5 | Shift start time | FULFILLED | Calendar events: `rrule.dtstart` and `duration` |
| 6 | Product master (brand, size, format, type) | PARTIAL | Only name, code and design speed. The rest must come from the Reckitt SKU master, joined on `code` |
| 7 | Reason tree: category > subgroup > reason | FULFILLED | `downtimeReasons` rows give `reasonPath` and `reasonFullPath` |
| 8 | KPIs: Good parts, Theoretical output, OEE, TEEP | FULFILLED | `POST evaluateKPIs`, but in pieces or cartons, not CUs |
| 9 | Time model: planned stop, availability loss, total time | FULFILLED | `Planned stops`, `Availability losses`, `Total time` (milliseconds) |
| 10 | Target configuration | PARTIAL | Only alert thresholds (70 / 30), a `productionTarget` curve and free-text baselines in asset descriptions. No target master |
| 11 | KPIs: Availability, Performance | FULFILLED | `evaluateKPIs` |
| 12 | Production counts + CU factor | PARTIAL | Counts yes. No CU factor anywhere |
| 13 | Loss in CUs (loss time x rated speed x CU factor) | PARTIAL | Loss time and design speed yes. No CU factor |
| 14 | Total time, planned stop from shift plan, operational time | FULFILLED | `evaluateKPIs` |
| 15 | Downtime reasons: loss time and occurrence count | FULFILLED | `downtimeReasons`, paged with `page` and `size` |
| 16 | MTTR | FULFILLED | `evaluateKPIs`: `MTTR`, built from `Availability losses` and its occurrence count |
| 17 | Downtime with no reason ("Not Logged") | PARTIAL | No field with that name. It appears as reason `Unplanned Downtime` with no sub-path, plus the `##MICROSTOPS##` pseudo-reason |
| 18 | Reduced Speed (performance losses + design speed) | PARTIAL | `Performance losses` exists but turns negative when Performance is above 1 (seen on B2 Line) |
| 19 | Event comments | PARTIAL | `/comment` returned an empty list on B2 Line and GT4. Manual comments live in the hourly entries (`OEE_Hourly_Entry.Comments`) |
| 20 | Capacity in CUs | PARTIAL | `Theoretical output` in pieces. No CU factor |
| 21 | MTBF (Power BI says MTTF) | PARTIAL | MTBF formula known (`Net production time` / number of availability losses). There is no MTTF expression, and it was not compared |
| 22 | Run rate CUs/hr per SKU | PARTIAL | The `PRODUCT` filter works. Run hours per product were not tested |
| 23 | Activity name list | PARTIAL | Matches a **status** (including `Run` and planned stops), not only a loss reason |
| 24 | Legacy Power BI history (Jan 22 to Oct 24) | MISSING | Not in any API. Comes from a Power BI export |
| 25 | Static text and form link | MISSING | Not API data |

## Conflicts with the roll-up rule
- **Per-order OEE is understated.** `Theoretical output` is not split by `ORDER` (265600 for each of two orders on GT4, and for the unfiltered call). Do not sum it across order filters. It does split by `SHIFT`.
- **Values can be null.** A KPI `value` was `null` for an empty shift (GT4, `SHIFT=Shift 2`). Make value columns nullable.
- **Duration type differs.** `duration` is text on B2 Line and a number on GT4. Convert before summing.
- **No asset context in the response.** `evaluateKPIs` returns no asset ID, name, site or area. Add the asset ID from the request, and Site, Area and Line from the Asset Management hierarchy.
- **Do not use `recursive: true` for the table.** It returns 51 rows instead of 30, with extra operand rows that hold arrays. With `recursive: false`, B2 Line and GT4 return the same 30 KPI names.
- **B2 Line values look implausible.** Performance 2.17 and more rejected than good parts in the test window. Do not trust them until the design speed and counters are checked.

## Outstanding items, ordered by components blocked
| Rank | Item | Components blocked |
|---|---|---|
| 0 | **Site coverage**: Nottingham and Weinheim unconfigured, Mira and others show almost no downtime, STP mostly unconfigured | Everything for N, M, W and the EU roll-up beyond Hull |
| 1 | **CU definition and CU factor** (items 12, 13, 20, 22 and the CU basis of 8) | 11: C02 C04 C07 C11 C14 C17 C18 C19 C21 C25 C26 |
| 2 | **Targets** (item 10): OEE target, loss targets, per-category targets | 6: C02 C08 C13 C17 C19 C25 |
| 3 | **Product master** (item 6): brand, size, format, type | 2: C01 C18 (C01 is on every page) |
| 4 | Day / Afternoon / Night rule (item 5) | 1: C01 |
| 5 | "Not Logged" rule (item 17) and "Reduced Speed" definition (item 18) | 1: C08 |
| 6 | Comments for automatic assets (item 19) | 1: C11 |
| 7 | MTBF versus MTTF formula (item 21) | 1: C16 |
| 8 | Activity equals status (item 23) | 1: C17 |
| 9 | Legacy history (item 24), static text and form link (item 25) | 1 each: C20, C22 |

## Useful data not in the requirement table
- **Missing-period flag:** `missingMapping` in the KPI response says when a manual asset has production periods without operator input (seen on GT4).
- **Hourly KPI values:** `groupedByDateTime: true` gives one value per hour, for the trend components (C09, C15, C19, C25) and the 24-hour matrix (C14). Daily or weekly values need your own aggregation of sums.
- **Stop events with exact times:** `downtimeReasons` rows on automatic assets (for drill-down C11, top lists C12 and the matrix C14).
- **Micro and macro stops:** separate KPIs, and the micro-stop rule is 5 minutes (booked under performance).
- **Alert thresholds:** OEE 70 (warning) and 30 (error) on B2 Line, usable for gauge colours.
- **Production target curve:** `productionTarget` `target[]`.
- **Baseline OEE and volume:** free text in the `description` of 23 of 44 OEE assets (for example `RPS baseline OEE ... volume ...`). A seed for targets, but unstructured.
- **Reason-change audit:** `overwritten`, `originalReasonId`, `userId`, `changedAt` and the reason's `justification` flag.
- **Asset state:** `isConfigured` and `isManual` in the OEE asset list, and the `mode` of each source in `/config` (connected or manual).
- **Unit per asset:** `productUnit` in the KPI response (`Piece`, `Carton`), needed for the CU conversion.
- **Time zone:** calendars are UTC+01:00 London while all API times are UTC, so local day boundaries need converting.
- **Formula audit:** `humanFormula` in each KPI row shows how the number was calculated.

## Answers to the open questions
| Question | Answer from the tests |
|---|---|
| What is a CU, and where do targets come from? | No CU concept or factor exists in any tested call. Counts use the product unit (`Piece`, `Carton`). For targets there are only alert thresholds, a target curve and baseline text, no target master. Ask Reckitt |
| Do Insights Hub OEE values match the Power BI answer key for one line and day? | **Not tested** (no answer key supplied). B2 Line looks wrong in the test window. GT4 has very little data (2 shift entries in 7 days) |
| Is the OEE KPI's MTBF the same as the Power BI MTTF? | The MTBF formula is known. There is no MTTF expression, and no reference values to compare |
| Is the blank "Breakdown Loss %" on Hull a data gap or a report bug? | In 30 days Hull's `Breakdown` reason totalled **17 h, 5 events, on one asset**, while the default `Unplanned Downtime` was 825 h on 8 assets and blank-path micro stops about 612 h. Few stops get a Breakdown reason, so this looks like **a data gap** rather than a report bug. The report itself was not inspected, so this is not conclusive |

## What was not tested
- Whether Paul's Parquet node writes fields as BYTE_ARRAY. That is a Node-RED node setting, not an API property.
- Whether the Insights Hub OEE values match the Power BI numbers (no reference values).
- Run hours per product (item 22), and the shift filter on B2 Line.
- Anything on Nottingham or Weinheim: their only OEE assets are unconfigured.
- All write calls (deliberately skipped).

## Suggested next steps
1. Agree the **CU definition and factor** with Reckitt (blocks 11 components) and where it will be stored.
2. Get the **target master** (OEE and loss targets) from the Power BI side.
3. Get the **SKU master** (brand, size, format, type) keyed on the product code.
4. Finish **OEE configuration** for the Nottingham and Weinheim assets, and check why Mira, Tuzla and STP return almost no downtime, before building the EU roll-up.
5. Check **B2 Line design speed and counters** before comparing any numbers with Power BI.
