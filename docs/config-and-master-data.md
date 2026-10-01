# Configuration and master data (OEE service)

Behaviour: read how OEE is set up for an asset, and the reference lists it uses (reason trees and so on).
Service: OEE app v3. Base: `https://gateway.eu1.mindsphere.io/api/oee/v3`. Auth: Bearer token, see [auth.md](auth.md). Headers: `Accept: application/json` (the OEE service accepts it; Asset Management does not).
Tested 2026-10-02 on the `reckitt` tenant. Anything not listed under "Tested" is **From source only**.

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

## From source only (not tested)
Listed in [api-summary.md](api-summary.md): `/calendars`, `/timeModel` (+ categories), `/productCollections`, `/productUnits`, `/qualityCodes`, `/measureCollections`, `/rejectReasonCollections`, `/stateTables`, `/expressions`, `/operands`, `/microStops`, `/application/settings`.
