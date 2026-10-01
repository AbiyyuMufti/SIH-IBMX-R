# Calculated results and reports (OEE)

Behaviour: read what the OEE app has calculated or summarised for an asset: production vs target, downtime and reject reasons, and the OEE KPIs themselves (via read-style POSTs).
Service: OEE app v3. Base: `https://gateway.eu1.mindsphere.io/api/oee/v3`. Auth: Bearer token, see [auth.md](auth.md). Headers on all calls: `Authorization: Bearer <token>`, `Accept: application/json`.
Tested 2026-10-02 on `GT4` (manual OEE) and `B2 Line` (automatic) over the last 7 days. Read only, plus three read-style POSTs (`evaluateKPIs`, `/expressions/{id}/evaluate`, `timeModelCategoryDistribution`) that the user approved.
Legend: **Tested** = called and verified. **From source only** = found in Postman/flows, not called.

All the report calls below take `from` and `to` (ISO 8601 UTC) as query parameters. Without data in the window they return HTTP 200 with empty lists, not errors.

## Tested

### GET /assets/{assetId}/productionTarget
| Item | Value |
|---|---|
| Purpose | Production over time compared with the target, for charts |
| URL | `GET .../api/oee/v3/assets/{assetId}/productionTarget?from=<ISO>&to=<ISO>` |
| Result | HTTP 200 in about 0.5 s |

**Response shape**
```json
{
  "total":    [ { "time": "2026-09-24T23:28:23.685Z", "value": 0 } ],
  "good":     [ { "time": "...", "value": 0 } ],
  "rejected": [ { "time": "...", "value": 0 } ],
  "target":   [ { "time": "2026-09-28T05:00:00.000Z", "value": 0 }, { "time": "2026-09-28T05:06:04.685Z", "value": 1148.08 } ]
}
```
| Series | Points in the 7 d test | Meaning |
|---|---|---|
| `total`, `good`, `rejected` | 1001 each | Counts over the window as points, about every 9 to 10 minutes (the window is spread over about 1000 points) |
| `target` | 151 | The target line. Only covers the planned production time (it started at the shift start, not at the window start) |

Values look cumulative within a period (the target rose from 0 to 1148 to 2977). Not fully verified.

### GET /assets/{assetId}/downtimeReasons
| Item | Value |
|---|---|
| Purpose | Detailed list of downtime events with their reasons (one row per status) |
| URL | `GET .../api/oee/v3/assets/{assetId}/downtimeReasons?from=<ISO>&to=<ISO>` |
| Result | HTTP 200 in about 0.3 s, 1 row for GT4 in 7 d. Paged: default page size 25 |

```json
{
  "_embedded": { "downtimeReasons": [ {
    "statusId": "<id>", "reasonId": "<id>", "originalReasonId": "<id>",
    "reason": "OverWrapper - Sealing Bar",
    "reasonPath": "Measurement and adjustment / Adjustment",
    "reasonFullPath": "Measurement and adjustment / Adjustment / OverWrapper - Sealing Bar",
    "from": "2026-10-01T05:00:00.000Z", "to": "2026-10-01T17:00:00.000Z",
    "duration": 1020000, "totalDuration": 1020000, "lossTime": 1020000,
    "occurrence": 1, "overwritten": false, "userId": null, "changedAt": null,
    "workOrderCount": 0, "measuresCount": 0, "commentCount": 0, "justification": false
  } ] },
  "page": { "size": 25, "totalElements": 1, "totalPages": 1, "number": 0 },
  "downTimeCounters": { "totalJustification": 0 },
  "usedReasonIds": []
}
```
| Field | Meaning |
|---|---|
| `statusId` | ID of the status row. **This is the `{statusId}` used by `/assets/{assetId}/status/{statusId}/measureAssignment` and `/workorderAssignment`** (from source, not tested) |
| `reasonId`, `reason`, `reasonPath`, `reasonFullPath` | The reason and where it sits in the reason tree (see [config-and-master-data.md](config-and-master-data.md)); `reasonFullPath` has the whole path |
| `originalReasonId`, `overwritten`, `userId`, `changedAt` | Whether the reason was changed afterwards, and by whom/when (`null` when not changed) |
| `from`, `to` | The period the status row sits in. For a manual asset this is the whole shift, not the exact stop time |
| `duration`, `totalDuration`, `lossTime` | **Milliseconds** (1020000 = 17 min) |
| `occurrence` | How many times the reason happened |
| `workOrderCount`, `measuresCount`, `commentCount` | How many work orders, measures and comments are attached |
| `justification` | Whether the reason needs a justification (see the reason's own `justification` flag in the reason tree) |
| `page` | Pagination: `size`, `totalElements`, `totalPages`, `number` (0-based). Query parameter names for paging not tested |

### GET /assets/{assetId}/topDowntimeReasons
Top downtime reasons, ranked. HTTP 200 in about 0.3 s. A **plain array**:
```json
[ { "reason": "OverWrapper - Sealing Bar", "reasonId": "<id>", "reasonPath": "Measurement and adjustment / Adjustment",
    "reasonFullPath": "Measurement and adjustment / Adjustment / OverWrapper - Sealing Bar", "duration": "1020000", "occurrence": 1 } ]
```
Gotcha: here **`duration` is a string** (`"1020000"`, milliseconds), while in `downtimeReasons` it is a number.

### GET /assets/{assetId}/topRejectReasons
Top reject reasons, ranked. HTTP 200 in about 0.3 s. A plain array:
```json
[ { "rejectReason": "Split", "rejectReasonId": "<id>", "rejectReasonPath": "Bottle / Broken", "occurrence": 15 } ]
```
Gotcha: the field is called `occurrence`, but the value (15) equals the sum of the `amount`s of reason `Split` in the two shift entries of the 7 d window (10 + 5). So for reject reasons it behaves like the total rejected amount, not a count of entries. Seen once, not verified further.

### GET /assets/{assetId}/statusDistribution and /downtimeDistribution
| Item | Value |
|---|---|
| Purpose | How the time of the window splits over statuses (`statusDistribution`) or over downtime reasons only (`downtimeDistribution`), for pie or bar charts |
| URL | `GET .../api/oee/v3/assets/{assetId}/statusDistribution?from=<ISO>&to=<ISO>` (same for `downtimeDistribution`) |
| Result | HTTP 200 in about 0.4 to 0.8 s. Tested on B2 Line and GT4, 7 d |

```json
{
  "totalCount": 4437,
  "totalDuration": 604800000,
  "average": 136308,
  "median": 29005,
  "path": [],
  "distribution": [
    { "reason": "Planned Downtime",  "reasonId": "<id>", "duration": "22380000",  "occurrence": 1,    "color": "#225EA8", "hasChildren": false, "isMicrostop": false },
    { "reason": "##MICROSTOPS##",    "reasonId": "<id>", "duration": "102952485", "occurrence": 2108, "color": "#FF0000", "hasChildren": false, "isMicrostop": true },
    { "reason": "Unplanned Downtime","reasonId": "<id>", "duration": "141983836", "occurrence": 110,  "color": "#F62447", "hasChildren": false, "isMicrostop": false }
  ]
}
```
| Field | Meaning |
|---|---|
| `totalCount`, `totalDuration` | Number of stops and total time in the distribution. `duration` fields are **milliseconds**. For B2 Line `statusDistribution`, `totalDuration` was exactly 604800000 (the 7 days of the window), for GT4 86400000 (24 h, only the part covered by its calendar) |
| `average`, `median` | Average and median duration per occurrence, in ms |
| `distribution[]` | One row per top-level reason: `reason`, `reasonId`, `duration`, `occurrence`, `color` (hex, for charts), `hasChildren` (can be drilled into) |
| `path` | The drill-down path; `[]` at the top level. How to pass a path to go one level down was not tested |
| `isMicrostop` | Only on B2 Line rows. `##MICROSTOPS##` is a pseudo-reason that collects short automatic stops (2108 occurrences, about 29 h in 7 d on B2 Line) |

**Gotchas**
- **`duration` is a string on B2 Line (`"102952485"`) and a number on GT4 (`1020000`).** Convert with `Number(...)` before using it.
- `isMicrostop` is missing on GT4 rows (manual asset has no micro stops).
- `downtimeDistribution` has the same shape but only the downtime rows (B2 Line: `##MICROSTOPS##` and `Unplanned Downtime`); `statusDistribution` also includes the other statuses such as `Planned Downtime` and the running status.

### GET /assets/{assetId}/filterValues
Which values exist in the window for the filters you can pass to KPI calls. HTTP 200 in about 0.3 s.
```json
{ "filterValues": [ { "key": "order", "value": ["AJ7777", "AJS348"] }, { "key": "product", "value": ["250 mg tablets - Pep 8's"] }, { "key": "shift", "value": ["Shift 1", "Shift 2"] } ] }
```
Keys seen: `order`, `product`, `shift`. B2 Line returned 11 orders, 11 products and 15 shift values in 7 d; GT4 2, 1 and 2. The KPI request bodies in Postman and the flows use upper-case filter keys (`"PRODUCT"`, `"ORDER"`); here the keys come back in lower case.

### GET /assets/{assetId}/measure
Returns `{ "measureCollectionId": "<id>" }` (GT4) or `{}` (B2 Line, none assigned). Same content as `/config` (see [config-and-master-data.md](config-and-master-data.md)).

**Example request for the reports (Node-RED function node)**
```js
const to = new Date();
const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
const report = msg.report;   // "productionTarget", "downtimeReasons", "topDowntimeReasons", "topRejectReasons", "statusDistribution", "downtimeDistribution" or "filterValues"
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/assets/" + msg.assetId + "/" + report +
  "?from=" + encodeURIComponent(from.toISOString()) + "&to=" + encodeURIComponent(to.toISOString());
msg.headers = { "Authorization": "Bearer " + flow.get("access_token_OEE"), "Accept": "application/json" };
msg.payload = null;
return msg;
```

**Gotchas for the whole group**
- Different response shapes per endpoint: an object with series, a paged HAL-like object, and two plain arrays.
- Durations are milliseconds everywhere here, but sometimes a string.
- The reports are for OEE assets only. A site such as `Hull` is not one (see [assets.md](assets.md)).

## All KPI formulas the OEE app can calculate (from `GET /expressions` and `/operands`, Tested)
The OEE app holds **34 expressions**: 30 of type `KPI` and 4 `AUXILIARY`. Every call to `POST /expressions/evaluateKPIs` returns **all 30 KPIs** in one response (Paul-Flow just picks what it needs, so you are not limited to what it uses). The formulas below are what the app itself stores, with the operand IDs replaced by names. Read in the order of the table: later KPIs are built from earlier ones.

How to read them: `[x]` = another KPI or an operand. The ID of each expression comes from `GET /expressions` and is tenant-specific.

### Counting parts
| KPI (`name`) | Formula | Unit | Meaning |
|---|---|---|---|
| `Total parts` | `[Total parts]` | count | Parts produced, from the asset's total source (connected counter, manual entry or calculated) |
| `Good parts` | `[Good parts] - (convertNullToZero([Manual rejected parts]) * (GoodOperandMode == CONNECTED and RejectedOperandMode == MANUAL_CONNECTED))` | count | Good parts. When good is a connected counter and rejects are manual plus connected, the manually entered rejects are subtracted from the connected good count |
| `Rejected parts` | `[Connected rejected parts] + convertNullToZero([Manual rejected parts])` | count | Connected plus manual rejects |
| `Connected rejected parts` | `[Rejected parts]` (the operand) | count | Rejects from the machine |
| `Manual rejected parts` | `[Manual rejected parts]` | count | Rejects entered by operators |
| `Theoretical output` | `[Theoretical output]` | count | Parts the asset could have produced at design speed in the period (presumably from the product design speed and the calendar; not verified) |

### Time
| KPI | Formula | Unit | Meaning |
|---|---|---|---|
| `Total time` | `sum([To] - [From])` | ms | Time inside the request period that the asset's calendar covers (sum of the time slices) |
| `Planned stop from shift plan` | `[Planned stop from shift plan]` | ms | Planned stops defined in the shift plan (calendar) |
| `Planned stops` | `[Planned stop from shift plan] + [Planned stop]` | ms | Planned stops: from the shift plan plus time whose state is in the time-model category `Planned stop` |
| `Operational time` | `[Total time] - [Planned stops]` | ms | Time the asset was supposed to run |
| `Availability losses` | `[Availability loss]` | ms | Time whose state belongs to time-model category `Availability loss` |
| `Availability loss (occurrence)` | `[Availability loss (occurrence)]` | count | Number of availability losses |
| `Net production time` | `[Operational time] - [Availability losses]` | ms | Operational time without availability losses |
| `Performance losses` | `(1 - [Performance]) * [Net production time]` | ms | Time lost to running slower than design speed. **Negative when Performance is above 1** |
| `Net operational time` | `[Net production time] - [Performance losses]` | ms | After removing performance losses |
| `Quality losses` | `(1 - [Quality]) * [Net operational time]` | ms | Time lost to rejects |
| `Used operational time` | `[Net operational time] - [Quality losses]` | ms | Time that produced good parts (the "fully productive" time) |

### OEE ratios
| KPI | Formula | Unit | Meaning |
|---|---|---|---|
| `Quality` | `[Good parts] / [Total parts]` | fraction | Share of good parts |
| `Performance` | `[Total parts] / [Theoretical output]` | fraction | Actual vs design output. Above 1 means more produced than the theoretical output, usually a sign of a wrong design speed or counter |
| `Availability` | `[Net production time] / [Operational time]` | fraction | Share of planned time without availability losses |
| `OEE` | `[Availability] * [Performance] * [Quality]` | fraction | Overall equipment effectiveness |
| `TEEP` | `[OEE] * ([Operational time] / [Total time])` | fraction | OEE over all calendar time, including planned stops |

### Reliability and stops
| KPI | Formula | Unit | Meaning |
|---|---|---|---|
| `MTTR` | `[Availability losses] / [Availability loss (occurrence)]` | ms | Mean time to repair: average length of an availability loss |
| `MTBF` | `[Net production time] / [Availability loss (occurrence)]` | ms | Mean time between failures: average productive time per availability loss |
| `Downtime (duration)` | `[Macrostops (duration)] + [Microstops (duration)]` | ms | All stop time |
| `Downtimes (occurrence)` | `[Macrostops (occurrence)] + [Microstops (occurrence)]` | count | All stops |
| `Micro stops (duration)`, `Micro stops (occurrence)` | `[Microstops (duration)]`, `[Microstops (occurrence)]` | ms, count | Short stops (rule in `/microStops`: presumably under 5 minutes) |
| `Macro stops (duration)`, `Macro stops (occurrence)` | `[Macrostops (duration)]`, `[Macrostops (occurrence)]` | ms, count | Longer stops |

### The 4 auxiliary expressions
Not returned as KPIs. They appear as `AUXILIARY` rows when `recursive: true`, and they are building blocks for assets that only have two of the three counters.
| Name | Formula | Use |
|---|---|---|
| `Good parts Aux` | `[Total parts] - [Rejected parts]` | Derive good parts when total and rejected are counted |
| `Rejected parts Aux` | `[Total parts] - [Good parts]` | Derive rejects when total and good are counted |
| `Total parts Aux` | `[Good parts] + [Rejected parts]` | Derive total when good and rejected are counted. Seen in the B2 Line results (the total is calculated, `TotalOperandMode` = `CALCULATED`) |
| `Const value` | `0` | The constant 0, used for assets without manual rejects |

### Operands the formulas are built from
| Type | Names | Meaning |
|---|---|---|
| `INSTANCE` (4) | `Good parts`, `Rejected parts`, `Manual rejected parts`, `Total parts` | Defined per asset: a counter or an auxiliary expression (see `/assets/{id}/operandInstancesSource` in [config-and-master-data.md](config-and-master-data.md)) |
| `THEORETICAL_OUTPUT` | `Theoretical output` | Output at design speed |
| `REQ_PARAM_FROM` / `REQ_PARAM_TO` | `From`, `To` | The request's period, split into time slices |
| `SHIFT_PLAN_STOPS` | `Planned stop from shift plan` | Planned stops from the calendar |
| `TIME_MODEL` (4) and `TIME_MODEL_OCCURRENCE` (3) | `Availability loss`, `Planned stop`, `Microstops (duration)`, `Macrostops (duration)` and their `(occurrence)` counts | Time (or number of events) whose machine state falls in that time-model category |
| `ASSET_SOURCE_MODE_STRING` (6) | `GoodOperandMode`, `RejectedOperandMode`, `TotalOperandMode`, `OrderSourceMode`, `ProductSourceMode`, `StatusSourceMode` | How each source of the asset is fed (`CONNECTED`, `MANUAL` and so on) |
| `ASSET_SOURCE_MODE_NUMBER` (6) | `CALCULATED`, `CONNECTED`, `MANUAL`, `MANUAL_CONNECTED`, `NONE`, `SINGLE` | Constants to compare the modes with inside formulas |

### Limits and open points
- **Fixed set.** `evaluateKPIs` always returns the same 30 KPIs. You cannot ask for a subset in the call we tested. To evaluate just one expression, use `POST /expressions/{id}/evaluate` (tested, below).
- **Expressions can be edited in the tenant.** 7 expressions are read-only (`readOnly: true`: `Good parts`, `Total parts`, `Rejected parts`, `Connected rejected parts`, `Manual rejected parts`, `Total time`, `Const value`), the rest are editable. A KPI can therefore differ between tenants; none had `modified: true` here. Creating or editing expressions is a write call and was not tested.
- **Not in the list:** there is no expression for things like cost, energy or OEE per product. For those, calculate from the returned values or from the time series yourself (or filter the call by product, see `scope.filter`; not tested).
- Several formulas assume the asset's sources are configured. When something cannot be mapped, the response lists it in `missingMapping` (GT4 had 1 item); what the dependent KPIs return in that case was not investigated.

## POST /expressions/evaluateKPIs (Tested, the only POST besides the token)
| Item | Value |
|---|---|
| Purpose | Ask the OEE app to calculate all KPIs for one asset over a period. This is what Paul-Flow uses for the daily report |
| Method and URL | `POST https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/evaluateKPIs` |
| Headers | `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/json` |
| Body | JSON, see below. Same shape as the Paul-Flow nodes `Prepare Request` / `evaluateKPIs` |
| Tested | 2026-10-02, API technical user, on `B2 Line` (24 h), `GT4` (48 h) and `B2 Line` with `recursive: true`. HTTP 200 in 0.5 to 0.9 s each |
| Side effects | None seen. The response only contains values and nothing in the sources writes anything for this call. Not proven server-side |

**Request body**
```json
{
  "assetId": "<assetId>",
  "scope": {
    "from": "2026-10-01T00:00:00.000Z",
    "to": "2026-10-02T00:00:00.000Z",
    "filter": [ { "key": "PRODUCT", "value": [] }, { "key": "ORDER", "value": [] }, { "key": "SHIFT", "value": [] } ],
    "recursive": false,
    "groupedByDateTime": false
  }
}
```
| Field | Meaning |
|---|---|
| `assetId` | An OEE asset (see [assets.md](assets.md)) |
| `scope.from`, `scope.to` | ISO 8601 UTC period |
| `scope.filter` | Optional narrowing. Empty `value` arrays = no filter. Keys used by the flows: `PRODUCT`, `ORDER`, `SHIFT`. To filter, put values from `GET /assets/{id}/filterValues` in `value` (not tested) |
| `scope.recursive` | `false` in the flows. With `true` the response had 51 rows instead of 30 for B2 Line, with the same KPI values (see gotchas) |
| `scope.groupedByDateTime` | `false` = one value per KPI for the whole period. `true` is used by the Postman evaluation requests to get a value per time bucket (not tested here) |

**Example request (Node-RED function node, then an `http request` node set to "use `msg.method`", return "a parsed JSON object")**
```js
const to = new Date();
const from = new Date(to.getTime() - 24 * 3600 * 1000);
msg.method = "POST";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/evaluateKPIs";
msg.headers = {
  "Authorization": "Bearer " + flow.get("access_token_OEE"),
  "Content-Type": "application/json",
  "Accept": "application/json"
};
msg.payload = {
  assetId: msg.assetId,
  scope: {
    from: from.toISOString(),
    to: to.toISOString(),
    filter: [ { key: "PRODUCT", value: [] }, { key: "ORDER", value: [] }, { key: "SHIFT", value: [] } ],
    recursive: false,
    groupedByDateTime: false
  }
};
return msg;
```
Then pick values by name, as the flows do:
```js
const kpi = {};
for (const r of msg.payload.results) kpi[r.name] = r.value;
msg.payload = { oee: kpi["OEE"], availability: kpi["Availability"], performance: kpi["Performance"], quality: kpi["Quality"] };
return msg;
```

**Response (HTTP 200)**
```json
{
  "scope": { "from": "...", "to": "...", "filter": [], "recursive": false, "groupedByDateTime": false },
  "results": [
    { "id": "<id>", "name": "OEE", "displayName": "OEE", "expressionType": "KPI", "value": 0.4195,
      "humanFormula": "'OEE' : 'Availability'*'Performance'*'Quality' = 0.4195 | used operands 'Availability' = 0.742, ..." }
  ],
  "took": "<string>",
  "missingMapping": [],
  "productUnit": "<string>"
}
```
| Field | Meaning |
|---|---|
| `results[]` | One row per KPI: 30 rows with `expressionType: "KPI"`, the same 30 as in the KPI list above |
| `results[].name` / `displayName` | Use `name` to look a KPI up (`displayName` can differ, for example `Rejected parts connected`) |
| `results[].value` | The result (see units below) |
| `results[].humanFormula` | The formula in words with the operand values used. Very useful to understand or debug a number |
| `took` | Calculation time as text |
| `missingMapping` | List of `{ key, value }` for things the calculation could not map. Empty for B2 Line, 1 item for GT4 (content not recorded; check it if a KPI looks wrong) |
| `productUnit` | Unit of the counted parts |

**Units of the values**
| KPIs | Unit |
|---|---|
| `Availability`, `Performance`, `Quality`, `OEE`, `TEEP` | Fraction, 1 = 100 % (for example `0.4195` = 41.95 %). Rounded to 4 decimals |
| `Total time`, `Operational time`, `Net production time`, `Net operational time`, `Used operational time`, `Availability losses`, `Performance losses`, `Quality losses`, `Planned stops`, `Planned stop from shift plan`, `MTTR`, `MTBF`, `Downtime (duration)`, `Micro stops (duration)`, `Macro stops (duration)` | **Milliseconds** |
| `Good parts`, `Total parts`, `Rejected parts`, `Connected rejected parts`, `Manual rejected parts`, `Theoretical output` | Part counts |
| `Availability loss (occurrence)`, `Downtimes (occurrence)`, `Micro stops (occurrence)`, `Macro stops (occurrence)` | Counts |

**Results seen (2026-10-01 test windows)**
| KPI | B2 Line, 24 h | GT4, 48 h |
|---|---|---|
| OEE | 0.4195 | 0.1222 |
| Availability | 0.742 | 0.993 |
| Performance | **2.1671** | 0.1231 |
| Quality | 0.2609 | 0.9994 |
| Good / Total / Rejected parts | 118940 / 455939 / 336999 | 15950 / 15960 / 10 |
| Total time | 86400000 (24 h) | 148554813 (about 41.3 h) |
| Downtimes (occurrence) | 239 (224 micro, 15 macro) | 1 |

**Gotchas**
- **Sanity-check the numbers.** B2 Line shows `Performance` above 1 (217 %), negative `Performance losses`, and more rejected than good parts. That suggests the design speed or the counters of B2 Line do not match the real production in this window (it may be commissioning or test data). The API calculates whatever is configured; it does not flag this. Do not present these values as real results without checking.
- **GT4** (manual): `Performance` is 0.12 because `Theoretical output` (129600) is far above the entered 15960 parts, again a configuration or data question, not an API one. Its `Total time` is the calendar time inside the window, not 48 h.
- **`recursive: true`** returned the same 30 KPI values for B2 Line plus 21 more rows: auxiliary expressions and **operands** (`expressionType` `OPERAND` or `null`) such as `From` and `To` (their `value` is an array of timestamps in ms), `GoodOperandMode`, `Microstops (duration)`. It did not add child machines into the numbers in this test. Whether it rolls up child assets for another asset type was not verified.
- Rows of other types have `displayName: null`, and `value` is sometimes an array. Filter on `expressionType === "KPI"` before reading.
- `humanFormula` can read `'null'` for some operands (GT4: `'Total parts' : 'null' = 15960`); the value is still returned.
- A POST that returns HTTP 200 does not guarantee all KPIs have data. Check `missingMapping`.
- Use the same `assetId` rules as other calls: OEE assets only. A site such as `Hull` gives 404 (not tested for this call).

## POST /expressions/{expressionId}/evaluate (Tested)
| Item | Value |
|---|---|
| Purpose | Calculate **one** expression (any of the 34 in the KPI reference above) instead of all 30, optionally as a value per hour |
| Method and URL | `POST https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/{expressionId}/evaluate` |
| Headers | `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/json` |
| `{expressionId}` | The `id` of the expression from `GET /expressions` (tenant-specific) |
| Body | Same as `evaluateKPIs`: `{ "assetId": "<id>", "scope": { "from", "to", "filter", "recursive", "groupedByDateTime" } }` |
| Tested | 2026-10-02 on `B2 Line` with `OEE`, `Availability`, and the auxiliary `Total parts Aux`. HTTP 200 in 0.4 to 0.6 s. Side effects: none seen |

**Example request (Node-RED function node)**
```js
msg.method = "POST";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/" + msg.expressionId + "/evaluate";
msg.headers = { "Authorization": "Bearer " + flow.get("access_token_OEE"), "Content-Type": "application/json", "Accept": "application/json" };
const to = new Date();
msg.payload = {
  assetId: msg.assetId,
  scope: {
    from: new Date(to.getTime() - 6 * 3600 * 1000).toISOString(),
    to: to.toISOString(),
    filter: [ { key: "PRODUCT", value: [] }, { key: "ORDER", value: [] } ],
    recursive: false,
    groupedByDateTime: true        // true = one value per hour in results[0].groups
  }
};
return msg;
```

**What came back**
- **Normal call** (`groupedByDateTime: false`): the same envelope as `evaluateKPIs`, but `results` has **1 row** (the requested expression): `{ id, name, displayName, expressionType, value, humanFormula }`, plus `took` (here `"140 ms"`), `missingMapping`, `productUnit` (`"Piece"`). Example: `OEE` = 0.423 with `humanFormula` `'OEE' : 'Availability'*'Performance'*'Quality' = 0.423 | used operands 'Availability' = 0.7406, 'Performance' = 2.176, 'Quality' = 0.2625`.
- **`groupedByDateTime: true`**: the single result row gets an extra `groups` array with one entry per **hour** of the period: `{ "time": "2026-10-01T17:00:00.000Z", "value": 1.1899 }`. A 6-hour window gave 7 entries (the partial hours at both ends count). An hour without data has `"value": null` (1 of 7 here). The top-level `value` is the figure for the whole period, which is not the average of the hourly values.
- **`recursive: true`** on `Availability`: 11 rows. The requested KPI plus everything it depends on: other KPIs (`Total time`, `Planned stops`, `Operational time`, `Availability losses`, `Net production time`) and operands (`Planned stop`, `Availability loss`, `To`, `From`, `Planned stop from shift plan`, with `expressionType` `null`). Handy to see how a number was built.
- **Auxiliary expressions work too**: `Total parts Aux` returned `Good parts + Rejected parts` (`expressionType: "AUXILIARY"`).

**Gotchas**
- Values move between calls because the window and the live data move (OEE for B2 Line was 0.4195 in one call and 0.423 a few minutes later, with `to` = "now").
- The body must contain `assetId`; the expression ID is only in the URL.
- Hourly values can be far from the period value (B2 Line, 6 h: hourly OEE from 0.05 to 1.19, period 0.37). Because the ratios are not averages, do not average the hourly values yourself; take the top-level `value`.
- `Performance` above 1 and similar oddities of the B2 Line data (see above) apply here too.

## POST /assets/{assetId}/timeModelCategoryDistribution (Tested, automatic assets only)
| Item | Value |
|---|---|
| Purpose | The machine's timeline for the period, split into segments, each with its time-model category (`Run`, `Unplanned Downtime`, ...). The raw material behind availability and the status charts |
| Method and URL | `POST https://gateway.eu1.mindsphere.io/api/oee/v3/assets/{assetId}/timeModelCategoryDistribution` |
| Headers | `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/json` |
| Body | `{ "from": "<ISO>", "to": "<ISO>", "filter": [ { "key": "PRODUCT", "value": [] }, { "key": "ORDER", "value": [] } ], "force": true }` |
| Tested | `B2 Line`, 24 h: HTTP 200 in 0.7 s, **469 segments**, same result with and without `"force": true` (the flows send it; its effect was not visible). `GT4`, 48 h: HTTP **400** |

Note the body is flat (`from`/`to` at the top), unlike the KPI calls where they sit inside `scope`.

**Example request (Node-RED function node)**
```js
msg.method = "POST";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/assets/" + msg.assetId + "/timeModelCategoryDistribution";
msg.headers = { "Authorization": "Bearer " + flow.get("access_token_OEE"), "Content-Type": "application/json", "Accept": "application/json" };
const to = new Date();
msg.payload = {
  from: new Date(to.getTime() - 24 * 3600 * 1000).toISOString(),
  to: to.toISOString(),
  filter: [ { key: "PRODUCT", value: [] }, { key: "ORDER", value: [] } ],
  force: true
};
return msg;
```

**Response**
```json
{
  "from": "2026-09-30T23:54:52.961Z", "to": "2026-10-01T23:54:52.961Z",
  "filter": [ { "key": "PRODUCT", "value": [] }, { "key": "ORDER", "value": [] } ],
  "distribution": [
    { "realFrom": "2026-09-30T23:53:34.402Z", "realTo": "2026-09-30T23:57:04.375Z",
      "from": "2026-09-30T23:54:52.961Z", "to": "2026-09-30T23:57:04.375Z",
      "plcCode": "true", "statusId": "<id>", "overwritten": "false", "id": "<id>",
      "timeModelId": "<id>", "timeModelName": "Production time",
      "timeCategoryId": "<id>", "timeCategoryName": "Run",
      "reasonId": null, "stateId": null, "stateName": null, "reason": null, "colorCode": "#65C728" }
  ]
}
```
| Field | Meaning |
|---|---|
| `from`, `to` | The segment cut to the requested period |
| `realFrom`, `realTo` | The segment's real start and end (the first segment starts before the requested `from`) |
| `timeModelName`, `timeCategoryName` | Group and category: seen `Production time` / `Run` and `Availability loss` / `Unplanned Downtime` |
| `colorCode` | Chart colour (green `#65C728` for `Run`) |
| `plcCode` | Machine signal behind the segment, as a **string** (`"true"` for running, `"false"` for stopped here) |
| `statusId` | Status ID, the same kind of ID as `statusId` in `downtimeReasons` |
| `overwritten` | **String** (`"false"`): whether the status was changed afterwards |
| `reasonId`, `reason`, `stateId`, `stateName` | `null` on all 469 segments of the test (no reason assigned in this window) |

Totals computed from the 469 segments (they add up to exactly 24 h):
| Time model / category | Segments | Total |
|---|---|---|
| `Production time` / `Run` | 235 | 849 min (14.2 h) |
| `Availability loss` / `Unplanned Downtime` | 234 | 591 min (9.9 h) |

The 591 minutes match `Downtime (duration)` of the KPI call (35464130 ms) for the same asset and window.

**Gotchas**
- **Manual assets are rejected:** `GT4` returned HTTP 400 `{"errors":[{"code":"mdsp.core.oee.getTimeModelCategoryDistribution","message":"Assets with manual status are not supported"}]}`. Only automatic (connected) assets such as the B2 Line machines work.
- **Large response:** about 470 segments for one line in one day (a machine flipping between run and stop every few minutes). Keep windows short or aggregate afterwards.
- `plcCode` and `overwritten` are strings, not booleans.
- `force` made no visible difference here.

## From source only (not tested)
Write calls only. Everything read-only in the OEE sources has now been tested (the remaining GETs are single-item reads by ID of lists already tested).
