# Calculated results and reports (OEE)

Behaviour: read what the OEE app has calculated or summarised for an asset: production vs target, downtime and reject reasons, and (later) the OEE KPIs themselves.
Service: OEE app v3. Base: `https://gateway.eu1.mindsphere.io/api/oee/v3`. Auth: Bearer token, see [auth.md](auth.md). Headers on all calls: `Authorization: Bearer <token>`, `Accept: application/json`.
Tested 2026-10-02 on `GT4` (manual OEE) over the last 7 days. Read only.
Legend: **Tested** = called and verified. **From source only** = found in Postman/flows, not called.

All four report calls take `from` and `to` (ISO 8601 UTC) as query parameters. Without data in the window they return HTTP 200 with empty lists, not errors.

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

**Example request for all four (Node-RED function node)**
```js
const to = new Date();
const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
const report = msg.report;   // "productionTarget", "downtimeReasons", "topDowntimeReasons" or "topRejectReasons"
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

## From source only (not tested)
GET: `/assets/{assetId}/downtimeDistribution`, `/statusDistribution`, `/filterValues`, `/measure`.
POST (read-style, ask first): `/expressions/evaluateKPIs`, `/expressions/{id}/evaluate`, `/assets/{id}/timeModelCategoryDistribution`. Details and request bodies are in [api-summary.md](api-summary.md).
