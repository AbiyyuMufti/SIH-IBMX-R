# Raw machine data (IoT Time Series)

Behaviour: read the raw values a machine has reported over time (counters, states, speeds, sensor readings).
Service: IoT Time Series v3. Base: `https://gateway.eu1.mindsphere.io/api/iottimeseries/v3`. Auth: Bearer token, see [auth.md](auth.md).
Tested 2026-10-02 on the `reckitt` tenant with the API technical user, on machine `02 Filler` under `B2 Line` (an automatic asset fed by MindConnect). Reading only; the write and delete calls seen in the source flows were not tested.

## What it is
Every asset has **aspects** (groups of variables). The time series API returns the stored values of one aspect of one asset for a time range. To know which aspects exist for an asset, use Asset Management `GET /assets/{assetId}/aspects` (see [assets.md](assets.md)).

Aspects of `02 Filler` (6):
| Aspect | What is in it (field names seen) | Data in the tests |
|---|---|---|
| `B2_Line_Filler_OEE_Automatic` | Raw filler signals: `FillerSpeed`, `Status_FillerInProduction`, `Status_FillerInCIP`, `Status_FirstStopAlarm`, `ProvideamMode`, reject counters `Filler_Reject_BadCap`, `_Insert`, `_NoCap`, `_NoInsert`, `_Torque`, `_Weight`, each with a `<name>_qc` field | Yes (about 2 records per second) |
| `OEE_Prerequisites` | `GoodParts`, `BadParts` (and `_qc`) | Yes (about 1 record per second) |
| `Alarms` | `FirstSlowDownAlarm` (and `_qc`) | Yes |
| `Process` | `HeaderTankBtmSnsr` (a process sensor, and `_qc`) | Yes (about every 30 s: 240 records in 2 h) |
| `OEE_MachineState` | not seen | **Empty**: 0 records for the last 1, 7 and 30 days |
| `OEE_MachineSpeed` | not seen | **Empty**: 0 records for the last 1, 7 and 30 days |

So for this machine the OEE app gets its numbers from `B2_Line_Filler_OEE_Automatic` and `OEE_Prerequisites`, not from `OEE_MachineState` / `OEE_MachineSpeed`. (Other assets do use `OEE_MachineState`: a `write timeseries` node in farhan-flows tab `Flow 1` writes `OEE_MachineState/Status_MachineState` for an asset named `Filler`.)

## GET /timeseries/{assetId}/{aspectName}
| Item | Value |
|---|---|
| Purpose | Read stored values of one aspect of one asset |
| Method and URL | `GET https://gateway.eu1.mindsphere.io/api/iottimeseries/v3/timeseries/{assetId}/{aspectName}` |
| Headers | `Authorization: Bearer <token>`, `Accept: application/json` (works here; the Asset Management `hal+json` rule does not apply) |
| Result | HTTP 200 in about 0.3 to 1.5 s |

**Query parameters**
| Parameter | Tested | Behaviour |
|---|---|---|
| `from`, `to` | Yes | ISO 8601 UTC, for example `2026-10-01T21:00:00.000Z`. **Maximum range 90 days** (91 days gives HTTP 400, code `[6009]`) |
| `limit` | Yes | Number of records. **Maximum 2000**; `2001` and above gives HTTP 400 `[6009] Input limit[2001] can't exceed max configured limit of - 2000`. Default seems to be 2000 |
| `sort` | `desc` | `desc` returns newest first. Default is oldest first |
| `latestValue` | `true` | No visible effect: the same 2000 records came back. Source flows send `latestValue=false`. Meaning not confirmed |
| none of `from`, `to` | Yes | With only `limit=2` the **latest records** came back (newest timestamp). Handy as a "current value" call |
| `from` only | Yes | HTTP 200, 2000 records |

**Example request (Node-RED function node, then an `http request` node set to "use `msg.method`", return "a parsed JSON object")**
```js
const to = new Date();
const from = new Date(to.getTime() - 60 * 60 * 1000);   // last hour
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/iottimeseries/v3/timeseries/" +
  msg.assetId + "/OEE_Prerequisites" +
  "?from=" + encodeURIComponent(from.toISOString()) +
  "&to=" + encodeURIComponent(to.toISOString()) +
  "&limit=2000&sort=asc";
msg.headers = {
  "Authorization": "Bearer " + flow.get("access_token_OEE"),
  "Accept": "application/json"
};
msg.payload = null;
return msg;
```
Latest value only (no time range):
```js
msg.url = "https://gateway.eu1.mindsphere.io/api/iottimeseries/v3/timeseries/" + msg.assetId + "/OEE_Prerequisites?limit=1";
```

**Example response** (`OEE_Prerequisites`, `msg.payload` is a plain array of records)
```json
[
  { "GoodParts": 44784, "GoodParts_qc": 0, "BadParts": 3, "BadParts_qc": 0, "_time": "2026-10-01T23:04:19.304Z" },
  { "GoodParts": 44784, "GoodParts_qc": 0, "BadParts": 3, "BadParts_qc": 0, "_time": "2026-10-01T23:04:18.299Z" }
]
```
| Field | Type | Meaning |
|---|---|---|
| `_time` | string, ISO 8601 UTC | When the record was stored |
| `<variable>` | number or boolean | The value. Numbers can be integers or decimals; `Status_*` flags are booleans |
| `<variable>_qc` | number | Quality code of that value. `0` was the normal value in the samples; a large negative number (for example `-2144075776`) was seen on `Filler_Reject_Weight_qc`, which looks like a "bad quality" marker. Meaning not confirmed |

Empty result is HTTP 200 with `[]`, not an error.

**Gotchas**
- **The 2000-record cap truncates silently.** A 2-hour window on a busy aspect returned exactly 2000 records, but they only covered the first 34 minutes (oldest first). Nothing in the response says more exist. To read a long range, request in small windows (for example 10 to 30 minutes), or loop: take the last `_time` of a batch and use it (plus 1 ms) as the next `from` until fewer than 2000 records come back.
- **Counters are cumulative.** `GoodParts` and `BadParts` are running totals (44784 and 3 in the sample), not per-interval amounts. Take the difference between the first and last record to get the amount produced in a window.
- **Records are sparse.** A record contains only the variables that arrived in that message, so one timestamp may hold most fields and the next only one or two (for example only `Filler_Reject_Weight` and its `_qc`). Do not assume every record has every field.
- **Rate is high.** About 1 to 2 records per second on the signal aspects. A 10-minute window is already about 600 to 1200 records.
- **Unknown aspect name gives HTTP 404**: `{"timestamp","status":404,"error":"Not found","message":"[6410] Unable to find the property set - <aspectName>","path"}`.
- **Errors use a different format** from the OEE service: `{"timestamp","status","error","message","path"}`, with codes in square brackets in the message (`[6009]`, `[6410]`).
- The aspect names of an asset are not guessable (`B2_Line_Filler_OEE_Automatic` is machine-specific). Look them up first with Asset Management `/assets/{assetId}/aspects`.
- Windows with no data return `[]`. Before concluding an asset has no data, test a wider window (up to 90 days).

## From source only (not tested)
- `PUT /timeseries/{assetId}/{aspect}`: write values (used by the Paul-Flow and farhan-flows `PUT line aspect` nodes to store calculated OEE). Needs approval.
- `DELETE /timeseries/{assetId}/{aspect}?from&to`: delete values (farhan-flows tab `Delete Timeseries`). Destructive, not to be run.
- Aggregates (`read aggregates` SDK node in farhan-flows): not seen as a REST call in the sources.
