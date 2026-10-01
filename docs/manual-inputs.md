# Operator input (manual OEE)

Behaviour: read what operators entered by hand for an asset: production counts, products, reject reasons, downtime reasons and comments.
Service: OEE app v3 (`/api/oee/v3`) and IoT Time Series (`/api/iottimeseries/v3`). Auth: Bearer token, see [auth.md](auth.md).
Tested 2026-10-02 on `GT4` (a manual-OEE asset: operators use a digital form in Insights Hub), windows 24 h, 48 h and 7 d. Read only. The write calls (POST/PUT on manual inputs) were not tested.

## How the data is stored (observed)
The same operator data shows up in two places:
| Place | Granularity | Read with |
|---|---|---|
| OEE **manual inputs** | One entry per production period (here a 12 h shift, 05:00 to 17:00 UTC): order, product, good / rejected / total counts, reject reasons, downtime statuses | `GET /assets/{assetId}/manualInputs?from&to` |
| Time series aspect **`OEE_Hourly_Entry`** | One record per hour entry: counts for that hour, reason lists, comments, who entered it | `GET /timeseries/{assetId}/OEE_Hourly_Entry?from&to` |

The shift entry looks like the sum of the hourly entries (in the samples the shift total was 15960 against hourly values of a few thousand per hour). The source flows (inbound endpoints `entry`, `oee`, `ts` in Paul-Flow and farhan-flows) write both. The exact link between the two was not verified.

Volume on GT4: 1 shift entry in the last 24 h and 48 h, 2 in 7 d; 3 hourly records in 24 h and 48 h, 4 in 7 d. That is little data, which looks like test or commissioning use (for example an order named like a test).

## GET /assets/{assetId}/manualInputs
| Item | Value |
|---|---|
| Purpose | List the manual shift entries of an asset in a time range, plus the empty periods still to be filled |
| Method and URL | `GET https://gateway.eu1.mindsphere.io/api/oee/v3/assets/{assetId}/manualInputs?from=<ISO>&to=<ISO>` |
| Params | `from`, `to` (ISO 8601 UTC). Not tested without them |
| Headers | `Authorization: Bearer <token>`, `Accept: application/json` |
| Result | HTTP 200 in about 0.3 s for all three windows |

**Example request (Node-RED function node)**
```js
const to = new Date();
const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/assets/" + msg.assetId +
  "/manualInputs?from=" + encodeURIComponent(from.toISOString()) +
  "&to=" + encodeURIComponent(to.toISOString());
msg.headers = { "Authorization": "Bearer " + flow.get("access_token_OEE"), "Accept": "application/json" };
msg.payload = null;
return msg;
```

**Example response** (ids redacted)
```json
{
  "manualInputs": [
    {
      "id": "<id>",
      "startTime": "2026-10-01T05:00:00.000Z",
      "endTime": "2026-10-01T17:00:00.000Z",
      "order": "AJS348",
      "productId": "<id>",
      "productName": "250 mg tablets - Pep 8's",
      "productUnit": "Carton",
      "good": 15950, "rejected": 10, "total": 15960,
      "rejectReasons": [ { "rejectReasonId": "<id>", "amount": 10, "name": "Split" } ],
      "statuses": [
        { "reasonId": "<id>", "name": "OverWrapper - Sealing Bar", "occurrence": 1, "duration": 1020000 },
        { "reasonId": "<id>", "name": "Run", "occurrence": 1, "duration": 38880000 },
        { "reasonId": "<id>", "name": "Planned Downtime", "occurrence": 1, "duration": 3300000 }
      ],
      "createdBy": "<id>", "createdAt": "2026-10-01T12:13:50.937Z",
      "editedBy": "<id>", "editedAt": "2026-10-01T14:44:20.043Z",
      "eTag": 6,
      "plannedProductionTime": 43200000,
      "rejectedManual": 10, "rejectedConnected": null,
      "rejectReasonCount": 1, "statusesCount": 3
    }
  ],
  "virtualPeriods": [
    { "startTime": "...", "endTime": "...", "productId": null, "productName": null, "productUnit": null,
      "order": null, "good": null, "rejected": null, "total": null, "plannedProductionTime": 43200000 }
  ]
}
```
| Field | Type | Meaning |
|---|---|---|
| `manualInputs[]` | array | Entries that exist. Empty array if none |
| `startTime`, `endTime` | ISO string | The period the entry covers (12 h in the samples) |
| `order`, `productId`, `productName`, `productUnit` | string | Production order and product |
| `good`, `rejected`, `total` | number | Counts for the period. `total` = `good` + `rejected` in the sample |
| `rejectReasons[]` | array | `{ rejectReasonId, amount, name }`; `rejectReasonCount` is its length |
| `statuses[]` | array | Time spent per reason: `{ reasonId, name, occurrence, duration }`. **`duration` is in milliseconds** (1020000 = 17 min). `Run` and `Planned Downtime` appear as reasons too. `statusesCount` is its length |
| `createdBy`, `editedBy` | string | User IDs (32 hex), not names or emails. `createdAt`, `editedAt` are ISO times |
| `eTag` | number | Version number, **needed in the `If-Match` header to update or delete** the entry (write calls, not tested) |
| `plannedProductionTime` | number | Milliseconds (43200000 = 12 h) |
| `rejectedManual`, `rejectedConnected` | number or null | Rejects entered by hand vs coming from a machine connection (`null` here) |
| `virtualPeriods[]` | array | The periods in the window, with the same time fields and `null` data where nobody has entered anything yet. Count in the tests: 3 for 24 h, 5 for 48 h, 15 for 7 d (a period is 12 h, and partial periods at the edges count) |

**Gotchas**
- The response is an **object with two arrays**, not a plain array. Read `manualInputs` for the data and `virtualPeriods` for the slots (the source flows use `virtualPeriods` to decide which period still needs an entry).
- Periods without an entry have `null` data in `virtualPeriods`. (A window with no entries at all was not tested; expect `manualInputs: []` with `virtualPeriods` still listing the slots.)
- Durations are in milliseconds, counts are plain numbers.
- Names such as `Run`, `Planned Downtime` in `statuses` come from the asset's reason tree, see [config-and-master-data.md](config-and-master-data.md).

## GET /timeseries/{assetId}/OEE_Hourly_Entry
Same call as in [timeseries.md](timeseries.md), with aspect `OEE_Hourly_Entry`. Tested on GT4: HTTP 200, 3 records (24 h and 48 h), 4 records (7 d). Records are small enough that the 2000 cap does not matter here.

**Example record** (email and ids masked; text fields shortened)
```json
{
  "_time": "2026-10-01T14:59:00Z",
  "HourEndTime": "2026-10-01T14:59:00.000Z",
  "ShiftName": "Gold",
  "ShiftStartTime": "2026-10-01T05:00:00.000Z",
  "ShiftEndTime": "2026-10-01T17:00:00.000Z",
  "OrderId": "AJS348",
  "ProductId": "<id>",
  "ProductName": "250 mg tablets - Pep 8's",
  "Good": 5550, "Rejected": 10, "Total": 5560,
  "PlannedProductionTime": 720,
  "EntryState": "amended",
  "ActorEmail": "<EMAIL>",
  "RecordedAt": "2026-10-01T14:44:21.833Z",
  "RejectReasons": "[{\"rejectReasonId\":\"<id>\",\"name\":\"Split\",\"amount\":10}]",
  "Statuses": "[{\"reasonId\":\"<id>\",\"name\":\"OverWrapper - Sealing Bar\",\"minutes\":17,\"startTime\":\"...\",\"endTime\":\"...\"}]",
  "Comments": "[{\"reasonId\":\"<id>\",\"comment\":\"<operator text>\",\"startTime\":\"...\"}]"
}
```
| Field | Type | Meaning |
|---|---|---|
| `_time`, `HourEndTime` | string | Hour the entry belongs to (the entry above covers up to 14:59) |
| `ShiftName`, `ShiftStartTime`, `ShiftEndTime` | string | The shift (`Gold`, 05:00 to 17:00 UTC in the sample) |
| `OrderId`, `ProductId`, `ProductName` | string | Order and product |
| `Good`, `Rejected`, `Total` | number | Counts for that hour (not cumulative, unlike `OEE_Prerequisites` on automatic assets) |
| `PlannedProductionTime` | number | **Minutes** here (720 = 12 h), while the OEE manual input uses milliseconds |
| `EntryState` | string | State of the entry; `amended` was seen (meaning: edited after first save). Other values not seen |
| `ActorEmail` | string | **Contains the operator's email address.** Mask or drop it before sharing data |
| `RecordedAt` | string | When the entry was saved |
| `RejectReasons`, `Statuses`, `Comments` | **string holding JSON** | Lists encoded as text. Parse them with `JSON.parse` before use. `Statuses` uses `minutes`, the OEE manual input uses `duration` in ms |

**Gotchas**
- Three fields (`RejectReasons`, `Statuses`, `Comments`) are JSON stored inside a string.
- The units differ between the two places (minutes vs milliseconds).
- `ActorEmail` is personal data.
- `EntryState: "amended"` and `RecordedAt` can be later than `_time`: entries get edited after the hour.

## GET /assets/{assetId}/comment
`GET .../api/oee/v3/assets/{assetId}/comment?from=<ISO>&to=<ISO>` returned HTTP 200 and `[]` for GT4 over 7 d (no standalone comments). The shape of a comment was not seen. The hourly records carry their own `Comments` field (see above).

## From source only (not tested)
- `POST /assets/{assetId}/manualInputs`, `PUT /assets/{assetId}/manualInputs/{periodId}` with header `If-Match: <eTag>`: create and update shift entries (used by the flows for reject reasons and hourly data). Needs approval.
- `GET /assets/{assetId}/manualInputs/{id}`: a single entry.
- `POST/PUT/DELETE /assets/{assetId}/comment`.
