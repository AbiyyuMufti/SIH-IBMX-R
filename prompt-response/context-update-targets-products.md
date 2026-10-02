# Context update: targets, products, capacity and run rate (amends the earlier availability brief and cross-check)

Tested on tenant `reckitt` on 2026-10-02 with the API technical user, reads only (plus the read-style `evaluateKPIs` POST). The status count of the 25 report-data items does not change (12 fulfilled, 11 partial, 2 missing). Four items get better evidence or become open questions. Everything else in the earlier brief stays as it was.

## What was verified this time
Three screens of the Insights Hub OEE app were compared with the API. All three are readable by the same technical user.

| Screen in the OEE app | Call | Fields |
|---|---|---|
| Asset configuration, **KPI targets** (warning and error per KPI) | `GET /api/oee/v3/assets/{assetId}` | `thresholds.warnings[]`, `thresholds.errors[]`, each `{ name, value }` in percent |
| **Product collection** | `GET /api/oee/v3/productCollections/{id}/products` (collection id from the asset's `/config`) | `name`, `description`, `code`, `designSpeedValue`, `designSpeedInterval`, `designSpeedUnit`, `designSpeedType` |
| **Operator entries** (manual assets, GT4) | `GET /api/oee/v3/assets/{assetId}/manualInputs?from&to` | `startTime`, `endTime`, `order`, `productName`, `productUnit`, `total`, `good`, `rejected`, `rejectReasons[]` (`name`, `amount`), `statuses[]` (`name`, `occurrence`, `duration` in ms), `plannedProductionTime` |

Values matched the screens (GT4 targets, the first SP4 products, the GT4 entries of 13 Sep).

## 1. Target (item 10): OPEN QUESTION
What is certain:
- The OEE app has a screen called **KPI targets** with a warning and an error value per KPI. These are stored per asset and are readable through the API (call above).
- They are **not the same for every asset**. Of 44 OEE assets: 27 have `0/0` for all four KPIs (nothing set), 13 have 70/30 for all four, 3 have 70/30 for OEE, Performance and Availability and `0/0` for Quality, and **GT4** has OEE 70/30, Performance 70/30, Availability 75/50, Quality 88/70.
- The earlier statement "OEE 70 / 30 for every asset" was taken from B2 Line only and is corrected here.

What is not known (the open question):
- **Is "target" in the reports the KPI target set in Insights Hub?** If yes, it can be read from the API (for the 17 assets that have a value), and item 10 is close to fulfilled for OEE, Performance, Availability and Quality.
- **Or is it a business target** (for example an OEE target per site, line or year, and loss targets per category)? Then it is master data that Insights Hub does not hold, and it stays missing.
- Still not found anywhere in the API: loss targets and per-category targets.
- Other target-like data (unchanged): a cumulative `productionTarget` curve per asset (units of production over time, not a percentage), and free text such as `baseline OEE 73.6%` in 23 of 44 asset descriptions.

How to settle it: find where the report uses "target" (which visual, which field) and compare one value with the KPI target of that asset.

## 2. Product master (item 6): UNCHANGED, with a follow-up
The API still gives only: name, code, description, design speed. No brand, size, format or type.

New detail: product descriptions can carry extra text, for example `24.000 EA; bottleneck PLIQSP4; 5.4165 KAR/min` and the collection description says `SAP routing PLIQSP4; speeds are bottleneck rates`. So this data seems to be loaded from SAP routing.

Follow-up for the AI project: **find where the "SKU master" is used in the reports** (which dashboard, which visual, which fields). The Insights Hub product collection (code, name, design speed) may already be the same data as that SKU master. If the report only needs code, name and speed, item 6 is fulfilled. If it needs brand, size or format, it stays partial.

## 3. Capacity (item 20): OPEN QUESTION
What exists:
- **Design speed per product** (capacity as a rate), e.g. 324.99 per hour for one SP4 product, 200 per minute for GT4 products. Capacity for a period = speed x planned or operational time.
- `Theoretical output` from `evaluateKPIs` (count in the asset's product unit, per hour with `groupedByDateTime`). This is the capacity of the period at the design speed.
- **The interval is not the same in every collection** (`HOUR` in SP4, `MINUTE` in B2 Line and GT4). Convert before comparing.
- Counts are in the product unit of the asset (`Piece` for B2 Line, `Carton` for GT4), **not in CUs. The API has no CU concept.**

The open question: **is "capacity" in the reports the product design speed (rated speed), or the theoretical output, or a capacity expressed in CUs?** If it is in CUs, it needs a CU factor, which does not exist in the API.

Possible CU lead (inferred, not confirmed): SP4 descriptions contain `24.000 EA` and a speed in `KAR/min` (5.4165 x 60 = 324.99, so the stored speed is really cartons although the unit says `Piece`). The 24 may be pieces per carton. It is text in a description field, so a parser would be needed and the meaning must be confirmed.

## 4. Run rate per SKU (item 22): better context
What the report item needs (as understood): the production rate, in CUs per hour, per product.

What the API gives:
- **Which products ran:** `GET /assets/{assetId}/filterValues?from&to` returns the product names (and order and shift names) for a period.
- **KPIs for one product:** `POST /api/oee/v3/expressions/evaluateKPIs` with `filter: [{ "key": "PRODUCT", "value": ["<product name>"] }]` returns the 30 KPIs for just that product (tested on GT4). Good parts and the time KPIs (`Operational time`, `Net production time`, `Total time`) are therefore available per product for a period.
- **Rated rate per product:** the design speed above (a rated rate, not the actual one).
- **Product per shift for manual assets:** `manualInputs` gives order, product, produced, good and rejected per shift entry.

What the API does not give:
- **No product in the hourly KPI rows.** With `groupedByDateTime: true` the rows have no product column. Product level needs one call per product and period.
- **Run hours per product were not tested.** The likely calculation (inferred) is good parts of the product divided by its operational or net production time, then converted to CUs.
- **CUs per hour needs the CU factor**, which does not exist (see capacity).
- Cost: one extra KPI call per product and asset. GT4 has about 1 to 2 products a day, B2 Line has 123 products in its collection.

So the actual run rate per SKU in the asset's unit is calculable, in CUs it is not, and "per hour" and "per day" levels would need one call per product.

## 5. Everything else
Unchanged from the earlier brief and cross-check: legacy history and static text (missing), comments, Not Logged, MTBF versus MTTF, afternoon shift, site coverage (only Hull has working data), the roll-up gotchas, and the pipeline notes. Nothing from this check affects them.

## Updated priority list
1. Settle the open questions: what "target" means in the reports, what "capacity" means, where the SKU master is used.
2. Agree the CU definition and factor (blocks the CU-based items).
3. If targets are business master data, get that master.
4. Site coverage (Nottingham and Weinheim unconfigured) and the B2 Line design speed and counter check.
