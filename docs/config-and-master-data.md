# Configuration and master data (OEE service)

| At a glance | |
|---|---|
| **Use it to** | Find out how OEE is set up for an asset (sources, calendar, reason tree) and read the reference lists it uses |
| **Service** | OEE app v3, base `https://gateway.eu1.mindsphere.io/api/oee/v3` |
| **Auth** | Bearer token, see [auth.md](auth.md) |
| **Status** | **Tested** 2026-10-02 on `B2 Line` and `GT4`. Read only |
| **Endpoints** | `/assets/{id}/config` and the per-asset source reads; `/reasontrees` (+ `/{id}`, `/{id}/reasons`); `/calendars`, `/timeModel`, `/productCollections`, `/productUnits`, `/qualityCodes`, `/measureCollections`, `/rejectReasonCollections`, `/stateTables`, `/expressions`, `/operands`, `/microStops`, `/application/settings` (404) |
| **Key facts** | Most lists return an object with one named array, not a bare array. `/timeModel` and `/microStops` are single objects. `/measureCollections` is capped at exactly 100 |

## What reason trees are
A **reason tree** is the list of reasons why a machine is stopped or losing output, organised in levels. Examples of top-level groups in the `B2 Line Reason Tree`: `Planned Downtime`, `Unplanned Downtime`, `Breakdown`, `Changeover`, `Meals and breaks`, `Speed Loss`, `Quality Issues`, `Run`. Below each group are more specific reasons.

What it is for (inferred from the data and the source flows, not from the OEE app's own documentation): when a machine stops, an operator or the system picks a reason from the asset's tree. The OEE app then uses that to report downtime (`downtimeReasons`, `topDowntimeReasons`, and so on). Each OEE asset points to its tree through `reasonTreeId`. The tree names suggest one tree per machine or line (for example `B2 Line Filler Reason Tree`, `GT4 Cartoner Loss Tree`); which asset uses which tree was only checked for `B2 Line`.

Reason trees do not hold time or counts. They only describe categories. The numbers come from the KPI and data calls.

## Tested endpoints

### GET /reasontrees
| Item | Value |
|---|---|
| Purpose | List all reason trees |
| Method and URL | `GET .../api/oee/v3/reasontrees` |
| Result | HTTP 200 in about 0.3 s, 22 trees |

**Response**
```json
{ "reasonTrees": [ { "id": "<id>", "name": "B2 Line Reason Tree", "description": "...", "timeModelId": "<id>" } ] }
```
Not a bare array: the list is under `reasonTrees`. Trees seen: one per B2 Line machine (Filler, Labeller, Cartoner, CasePacker, Palletiser, DePalletiser, Antares), `B2 Line Reason Tree`, several `GT4 ... Loss Tree` (Checkweigher, Domino Coder, OverWrapper, Blister Machine, Cartoner, Heat Tunnel, Print and Apply, Antares AIO, Taper, Feed_Equipment, plus `GT4 Line Reason Tree`) and `RPS-GLOBAL-V1`.

### GET /reasontrees/{id}
HTTP 200. Returns `{ "id", "name", "description", "timeModelId" }`. `timeModelId` links the tree to a time model (the OEE categories such as running, stopped, planned stop; see `/timeModel`, not tested). The `B2 Line Reason Tree` description reads "Loss and downtime reason hierarchy for the B2 bottling line as a whole."

### GET /reasontrees/{id}/reasons
HTTP 200 in about 0.3 s. For the `B2 Line Reason Tree`: **1034 reasons**.

```json
{ "reasons": [ { "id": "<id>", "name": "Breakdown", "description": null, "parentId": null, "justification": false } ] }
```
| Field | Type | Meaning |
|---|---|---|
| `id` | string | Reason ID |
| `name` | string | Reason name |
| `description` | string or null | Free text, `null` in the sample |
| `parentId` | string or null | `null` = top level (17 top-level reasons). Other reasons point to their parent, so the tree is rebuilt from `parentId` (58 different parents) |
| `justification` | boolean | `true` on 9 of 1034. Meaning not confirmed (presumably the operator must add a justification or comment) |

**Gotchas**
- The list is **flat**, not nested. Build the tree yourself from `parentId`.
- It is large (1034 entries for one tree). Cache it instead of calling it per request.
- Top-level names include long ones such as `Preparatory & Close out time losses, startup, end up, Sanitization`.

**Example request (Node-RED function node)**
```js
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/reasontrees/" + msg.reasonTreeId + "/reasons";
msg.headers = { "Authorization": "Bearer " + flow.get("access_token_OEE"), "Accept": "application/json" };
msg.payload = null;
return msg;
```
Take `msg.reasonTreeId` from the asset's `reasonTreeId` (see [assets.md](assets.md)).

### GET /assets/{assetId}/config
| Item | Value |
|---|---|
| Purpose | How OEE is set up for one asset: where the counts, orders, products, states and design speed come from, plus the calendar and the lists it uses |
| Method and URL | `GET .../api/oee/v3/assets/{assetId}/config` |
| Tested on | `B2 Line` (772 ms), `GT4` (303 ms), `02 Filler` (595 ms): all HTTP 200 |

**Response shape** (field names and types from the three tests; values not shown)
```json
{
  "operandSource":     { "good": {...}, "rejected": {...}, "total": {...} },
  "orderSource":       { "id": "...", "mode": "..." },
  "productSource":     { "id": "...", "mode": "..." },
  "designSpeedSource": { "id": "...", "mode": "..." },
  "stateSource":       { "id": "...", "mode": "..." },
  "calendarId": "...",
  "measureCollectionId": "...",
  "productCollectionId": "...",
  "rejectReasonCollectionId": "...",
  "hasManuals": true
}
```
| Field | Meaning (inferred from names) | Seen |
|---|---|---|
| `operandSource.good / rejected / total` | Where good, rejected and total part counts come from: `operandName`, `mode`, and for some assets `valueType`, `source`, `sourceName`, `qualityCodeId` | All three assets. `total` only has `operandName` and `mode` |
| `orderSource`, `productSource`, `designSpeedSource` | Where the current order, product and ideal speed come from. `mode` tells whether it is manual, connected or fixed (the Postman collection has variants for each) | All three |
| `stateSource` | Where the machine state comes from. `GT4` has `reasonTreeId` in it, `02 Filler` has `stateTableId` | `GT4`, `02 Filler`; **missing on `B2 Line`** (the line has no state source of its own) |
| `calendarId` | Production calendar (planned production time) | All three |
| `measureCollectionId`, `productCollectionId`, `rejectReasonCollectionId` | The lists used for measures, products and reject reasons | All three; `measureCollectionId` missing on `B2 Line` |
| `hasManuals` | Whether manual inputs are used | All three |

**Gotchas**
- The shape differs per asset. Do not assume every field exists, check before reading.
- An asset that is not OEE-enabled can still return HTTP 200 with an empty config (`Hull`: `{"operandSource":{},"hasManuals":false}`). Check the asset is in the OEE list first.
- The source flows read `/assets/{id}/config` to find the child assets and calendar of a line before asking KPIs.

## Per-asset setup reads (Tested on B2 Line and GT4, HTTP 200 in about 0.25 s each)
All are `GET .../api/oee/v3/assets/{assetId}/<name>` without parameters. They return pieces of what `/config` returns (see above), so you rarely need them if you already called `/config`.
| Path | Returns (field names) | Notes |
|---|---|---|
| `/calendar` | `{ calendarId }` | Production calendar of the asset |
| `/productCollection` | `{ productCollectionId }` | Product list used |
| `/rejectReasonCollection` | `{ rejectReasonCollectionId }` | Reject-reason list used |
| `/measure` | `{ measureCollectionId }` | **`{}` (empty object) on B2 Line**, which has none |
| `/orderSource`, `/productSource` | `{ id, source, qualityCodeId, mode }` | B2 Line: `mode` = `CONNECTED`. GT4 only has `{ id, mode }` |
| `/designSpeedSource` | `{ id, mode }` | Ideal speed source |
| `/stateTableSource` | B2 Line: `{ id, stateTableId, source, mode: "STATUS_RULE" }`. GT4: `{ id, reasonTreeId, mode: "MANUAL" }` | Where the machine state comes from |
| `/operandInstancesSource` | `{ good, rejected, total }`, each with `operandName`, `mode`, and for connected ones `valueType`, `source`, `qualityCodeId` | B2 Line: good = `CNT_PROGRESSIVE` and rejected = `CNT_DIFF` (both `CONNECTED`), total = `CALCULATED`. GT4: modes only |
| `/status/{statusId}/measureAssignment`, `/status/{statusId}/workorderAssignment` | `{ measureAssignments: [] }`, `{ workorderAssignments: [] }` | Both empty in the tests. `statusId` comes from `downtimeReasons` (see [kpis.md](kpis.md)) |

**What the values mean (inferred from the names and the data, not from product documentation)**
- `mode`: where the value comes from. `CONNECTED` = from machine data, `MANUAL` = entered by operators, `STATUS_RULE` = derived by a status mapping, `CALCULATED` = computed by OEE. This matches your description: B2 Line is connected, GT4 manual.
- `valueType`: `CNT_PROGRESSIVE` = a running counter that only goes up (like `GoodParts` in [timeseries.md](timeseries.md)); `CNT_DIFF` = a counter that gives the difference per step.
- `source` (connected assets): three parts separated by `/`: two IDs and a variable key. It points at the asset, aspect and variable where the data is read.
- `qualityCodeId`: which quality-code mapping applies to the variable (see `/qualityCodes`).

## Master data lists (Tested)
All `GET .../api/oee/v3/<path>`, no parameters unless stated, HTTP 200 in 0.25 to 0.7 s. Most return an **object with one named array** (not a bare array).
| Path | Shape | Count / notes |
|---|---|---|
| `/calendars` | plain array of `{ id, name, description, timeZoneText }` | 36. Names such as `GT4 4-Crew Shift Pattern`, `Hull Calendar`, `General Shift`, `CAL-ITA2-...` |
| `/calendars/{id}` | `{ id, name, description, timeZoneText }` | One calendar |
| `/calendars/{id}/calendarEvents?from&to` | `{ calendarEvents: [ { id, name, description, timeModelCategoryId, duration, rrule } ] }` | GT4 calendar: 4 events (`Shift 1`, `Changeover`, `Shift 2`, `Changeover`). `duration` in **ms** (43200000 = 12 h). `rrule` = recurrence `{ freq: "DAILY", interval, dtstart, until }`, here daily until 2099 |
| `/timeModel` | **one object** `{ id, name, description }`, not a list | The tenant's time model |
| `/timeModel/{id}/categories` | `{ categories: [ { id, name, description, type, parentId, color } ] }` | 20. `type` is `TIME_MODEL` (root) or `TIME_CATEGORY`. Names: `Production time`, `Run`, `Planned stop`, `Availability loss`, `Changeover`, `Breakdown`, `Meals and breaks`, `Operator asset care`, and more. Build the tree with `parentId` |
| `/productCollections` | `{ productCollections: [ { id, name, description } ] }` | 78 (per line, for example `B2 Line Products`) |
| `/productCollections/{id}` | `{ id, name, description }` | |
| `/productCollections/{id}/products` | `{ products: [ { id, name, description, designSpeedInterval, designSpeedUnit, designSpeedValue, designSpeedType, code } ] }` | GT4's collection: 15 products. Carries the ideal speed per product |
| `/productUnits` | plain array `{ id, unit }` | 3: `Carton`, `Technology`, `Piece` |
| `/qualityCodes` | `{ qualityCodes: [ { id, name, systemName, description, ranges: [3] } ] }` | 6: `OPC UA and S7`, `Modbus`, `Simatic I/O Shield`, `System`, `Rockwell`, `S7+, Fanuc Focas, Sinumerik, IEC61850 and MTConnect`. Presumably they define which `_qc` values count as good per connection type; not confirmed |
| `/measureCollections` | `{ measureCollections: [ { id, name, description } ] }` | **Exactly 100**, and `size`, `page` and `limit` did not change it. It may be a silent cap |
| `/measureCollections/{id}/measures` | `{ measures: [ { id, name, description, parentId } ] }` | GT4's collection has 1 measure (`EMC`) |
| `/rejectReasonCollections` | `{ rejectReasonCollections: [ { id, name, description } ] }` | 3: `GT4 Reject Reasons`, `B2 Reject Reasons`, `RPS Global Reject Reasons` |
| `/rejectReasonCollections/{id}/rejectReasons` | `{ rejectReasons: [ { id, name, description, parentId } ] }` | GT4's: 26, a tree through `parentId` (for example `Bottle` > `Broken`) |
| `/stateTables` | `{ stateTables: [ { id, name, description, reasonTreeId } ] }` | 10 (one per B2 line or machine, for example `B2 Line Filler Status Mapping`) |
| `/stateTables/{id}` | `{ id, name, description, reasonTreeId }` | |
| `/stateTables/{id}/states` | `{ states: [ { id, reasonId, value } ] }` | 117 in the first table. Maps a machine state code (`value`, a string such as `"3"`) to a reason of the reason tree |
| `/expressions` | `{ expressions: [ { id, name, displayName, description, type, formula, readOnly, modified, updateAvailable, keepMyVersion } ] }` | 34: 30 of type `KPI`, 4 `AUXILIARY`. The KPI list is in [kpis.md](kpis.md). `formula` refers to operands by ID, for example `[<id>]-[<id>]` |
| `/expressions/{id}` | one expression | |
| `/operands` | `{ operands: [ { id, name, description, type, value } ] }` | 27. Types: `INSTANCE` (4), `TIME_MODEL` (4), `TIME_MODEL_OCCURRENCE` (3), `ASSET_SOURCE_MODE_STRING` (6), `ASSET_SOURCE_MODE_NUMBER` (6), `THEORETICAL_OUTPUT`, `REQ_PARAM_FROM`, `REQ_PARAM_TO`, `SHIFT_PLAN_STOPS` |
| `/microStops` | **one object** `{ belongs: "PERFORMANCE", color, duration: 5, unit: "MINUTE" }` | The micro-stop rule: presumably stops shorter than 5 minutes count as micro stops, booked under performance. Inferred |
| `/application/settings` | HTTP **404** `{"errors":[{"code":"mdsp.core.oee.getSettings","logref":"...","message":"Resource not found"}]}` | No settings object exists in this tenant (the Postman collection expects one) |

**More seen on B2 Line (tested)**
- Calendar `Hull Calendar` (time zone text `(UTC+01:00) Edinburgh, London`): 24 events in September 2026, each a 12 h shift named after a crew (`Red`, `Gold`, `Blue`, ...), recurring `DAILY` with `interval: 10` from 06:00Z or 18:00Z until 2026-12-31. The `shift` values in `filterValues` are these crew names.
- Product collection `B2 Line Products`: 123 products whose `name` equals the numeric `code`; design speed 210 `Piece` per `MINUTE` (`designSpeedType: SPEED`). GT4's collection has descriptive names (for example `250 mg tablets - Pep 8's`) and unit `Carton`.
- Reason trees: 38 OEE assets have a `reasonTreeId`, they use 10 trees, and the biggest group of 21 assets shares one tree.

**Gotchas**
- Names are not unique and many lists are per asset (78 product collections, 100 measure collections). Always take the ID from the asset's `/config` rather than searching by name.
- `/timeModel` and `/microStops` are single objects. Do not treat them as lists.
- `measureCollections` returns exactly 100 whatever the parameters, so assume it can be truncated.
- A 404 error body uses the OEE format `{"errors":[{"code","logref","message"}]}`.

**Example request for any of them (Node-RED function node)**
```js
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/" + msg.path;   // for example "stateTables" or "calendars/" + calendarId + "/calendarEvents?from=...&to=..."
msg.headers = { "Authorization": "Bearer " + flow.get("access_token_OEE"), "Accept": "application/json" };
msg.payload = null;
return msg;
```

## From source only (not tested)
Write calls on all of the above (create, change, delete lists and assignments) and PUT on the per-asset setup paths. Not in scope without approval.

## What the OEE app screens show, and the call behind each (Tested 2026-10-02)
Checked against three screens of the Insights Hub OEE app (product collection, asset configuration, operator entries).

| Screen | Field | API call | Field in the answer |
|---|---|---|---|
| Asset configuration > KPI targets | Warning and error per KPI (OEE, Performance, Availability, Quality) | `GET /api/oee/v3/assets/{assetId}` | `thresholds.warnings[]` and `thresholds.errors[]`, each `{ name, value }` in percent |
| Product collection | Name, description, code, design speed | `GET /productCollections/{id}/products` (id from the asset's `/config` or `/productCollection`) | `name`, `description`, `code`, `designSpeedValue`, `designSpeedInterval`, `designSpeedUnit` |
| Operator entries (manual assets) | Time, order, product, produced, good, rejected, reject reasons, machine states | `GET /assets/{assetId}/manualInputs?from&to` | `startTime`, `endTime`, `order`, `productName`, `total`, `good`, `rejected`, `rejectReasons[]` (`name`, `amount`), `statuses[]` (`name`, `occurrence`, `duration` ms), `plannedProductionTime` |

Findings from the check:
- **KPI targets differ per asset.** Of 44 OEE assets: 27 have `0/0` for all four (not set), 13 have 70/30 for all four, 3 have 70/30 with Quality `0/0`, and **GT4 has OEE 70/30, Performance 70/30, Availability 75/50, Quality 88/70** (matches the screen). Earlier notes that gave 70/30 for every KPI were taken from B2 Line only.
- **Design speed has a different interval per collection.** The `SP4 Products` collection (82 products, description "SAP routing PLIQSP4; speeds are bottleneck rates") uses `designSpeedInterval` `HOUR` (for example 324.99), the B2 Line collection uses `MINUTE`. Convert to one interval before comparing.
- **Product descriptions carry extra text.** In SP4 each product description reads like `24.000 EA; bottleneck PLIQSP4; 5.4165 KAR/min`. 5.4165 x 60 = 324.99, so the stored speed is in cartons (KAR) although the unit says `Piece`. The `24.000 EA` could be pieces per carton, a possible seed for a CU factor. **Inferred, not confirmed.**
- **No OEE asset returned `SP4 Products`** from `/productCollection` (44 assets checked). It probably belongs to one of the unconfigured assets, not confirmed.
- **Product per shift exists for manual assets.** `manualInputs` has `productName` and `order` per shift entry (GT4). The hourly KPI call has no product column.
