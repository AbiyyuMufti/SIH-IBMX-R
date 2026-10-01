# API summary (placeholder)

> **Status: placeholder, built from the source files. Only the token request and `GET /api/oee/v3/health`, `/version`, `/assets` and the asset, hierarchy, config and reason-tree GETs have been called so far** (see [auth.md](auth.md), [service-status.md](service-status.md), [assets.md](assets.md), [config-and-master-data.md](config-and-master-data.md) for the tested parts). Everything else here is from source only. Detail per call is in [inventory.md](inventory.md); auth sources are in [auth-checklist.md](auth-checklist.md). Per-area docs replace this page as endpoints get tested.

Target tenant for testing: **reckitt** (decided by the user). Gateway: `https://gateway.eu1.mindsphere.io`. IAM host for the token: `https://reckitt.piam.eu1.mindsphere.io`.

## What exists, grouped by behaviour
| Behaviour | APIs | What it gets you | Status | Test order |
|---|---|---|---|---|
| **Log in** | IAM token (`POST /oauth/token`) | A 30-minute token for everything below | Tested | done |
| **Check the service** | OEE `/health`, `/version` | Up/down check, service version (`1.24.39`). Both need the token | Tested | done |
| **Find assets** | Asset Management (`/assets`, `/assets/{id}`, `/assets/{id}/aspects`, `/assettypes`) and OEE `/assets` | The asset tree (lines, machines), their IDs and types, and which data aspects each has. The asset IDs are the key for every other call. OEE `/assets` returns 44 assets as a plain list | Tested (OEE `/assets`, Asset Management list, tree, children, aspects). See [assets.md](assets.md) | done; assettypes/aspecttypes (5) denied (HTTP 403) |
| **Read raw machine data** | IoT Time Series (`/timeseries/{assetId}/{aspect}?from&to`) | Raw counters and states over a time window (good parts, rejects, machine speed, hourly entries). Max 2000 records and 90 days per call. See [timeseries.md](timeseries.md) | Tested on B2 Line `02 Filler` | 1 done (B2 Line `02 Filler`); GT4 manual data next |
| **Read calculated KPIs** | OEE `POST /expressions/evaluateKPIs`, `/expressions/{id}/evaluate`, `/assets/{id}/timeModelCategoryDistribution`; GETs such as `statusDistribution`, `downtimeDistribution`, `topDowntimeReasons`, `topRejectReasons` | OEE, availability, performance, quality, downtime and reject breakdowns for an asset and period (what Paul's daily report uses) | Not yet. The `evaluate…` and `…Distribution` calls that are POST need your OK | 3 done; 6: `evaluateKPIs` done ([kpis.md](kpis.md)), other POSTs not tested |
| **Read operator input** | OEE `/assets/{id}/manualInputs`, `/comment`, `/productionTarget` | What operators entered by hand: shift entries, hourly entries, reject and downtime reasons, comments. See [manual-inputs.md](manual-inputs.md) | Tested on GT4 | 2 done (GT4) |
| **Read configuration and master data** | OEE `/assets/{id}/config` and `*Source`, `/reasontrees`, `/rejectReasonCollections`, `/measureCollections`, `/stateTables`, `/calendars`, `/timeModel`, `/productCollections`, `/productUnits`, `/qualityCodes`, `/expressions`, `/operands`, `/application/settings` | How OEE is set up: reason lists, calendars, time-model categories, product lists and the formulas behind the KPIs | Tested: `/config`, per-asset sources, reason trees and all master data lists. See [config-and-master-data.md](config-and-master-data.md) | 4 done |
| **Events** | Event Management (`/events`, job status) | Platform events. Appears only in the `caditiot` Postman collection | Low priority | 7 (low priority) |
| **Change data (not tested without approval)** | OEE POST, PUT and DELETE (about 130 requests in Postman); time series PUT and DELETE; manual-input POST and PUT; event create and delete | Writing reject reasons and hourly entries, changing setup, deleting data | Off-limits unless you approve | never, unless approved |
| **Only inside Insights Hub Node-RED** | SDK nodes (`read-oee`, `read timeseries`, `write timeseries`, `create event`, Object Storage nodes) | Same data through built-in nodes. They have no URL we can call locally | Not callable here | n/a |

## How data gets in (context from the user)
- **B2 Line:** automatic. Real assets connected through **MindConnect**, so machine signals arrive in the time series by themselves (asset types `B2_Line_*_Asset_OEE_Automatic`). Expect real data in `OEE_MachineState`, `OEE_Prerequisites`.
- **GT4, and soon Mira:** **manual OEE**. Operators enter data through a digital form in Insights Hub; that data goes in through the OEE manual-input endpoint and shows up in the `OEE_Hourly_Entry` aspect (fields seen in farhan-flows: `ActorEmail`, `Comments`, `EntryState`, `Good`, `HourEndTime`, `OrderId` and more).
- Both kinds are in the OEE asset list. `isManual` is `true` for 39 of 44 assets, including `B2 Line`, so it probably means "manual input is allowed", not "data is only manual". `B2 Line` also uses manual input for reject reasons (mei-flows). Not confirmed.
- Test consequence: group 1 (raw data) targets B2 Line; group 2 (operator input) targets GT4.

In short, the read side gets you three things: who the assets are, what they measured, and what the OEE app calculates and is configured to do with that. The write side is what the source flows use to push calculated hourly OEE and reject reasons back in. Most of the 130 write requests are in the Postman collection and are administration, not something needed to read data.

Coverage of the OEE GET paths (68 distinct): every list call and the main nested lists are tested. What is left are single-item reads by ID of lists already tested (`.../{id}`) and calls that returned no data to look at (`comment`, `measureAssignment`, `workorderAssignment`). Next: Asset Management `assettypes`/`aspecttypes` (test order 5), then the KPI POSTs (6, approval).

Suggested route (original): `/version`, then `/assets` for IDs, then `/assets/{id}/config` and a time series read, then the KPI POSTs once approved.

## How access works (3 steps)
1. **Get a token (a POST, needs your OK first).** `POST https://reckitt.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials` with header `Authorization: Basic base64(clientId:clientSecret)`. Response field `access_token`. Client ID and secret go in `.env` (`RECKITT_API_TECHUSER_CLIENT_ID`, `RECKITT_API_TECHUSER_CLIENT_SECRET`), see [auth-checklist.md](auth-checklist.md).
2. **Call the API with `Authorization: Bearer <access_token>`.** Tokens expire; the flows refresh every 19 minutes (1140 s).
3. **Read the JSON.** List endpoints return `_embedded` + `page` (pagination); errors are HTTP status codes (to be documented after testing).

The token call is the only POST needed to start. Everything after it can be GET-only.

## Example taken from the flows: GET with a token (Node-RED, untested)
Based on Paul-Flow.json tab `Line ` (function `OEE`, node `http request`) and tab `OEE` (function `Technical user`). Secrets are read from env vars, never typed in.

**Function node 1, "token request"** (wire to an `http request` node: method "use msg.method", return "a parsed JSON object"; then to node 2)
```js
const tenantName = "reckitt";
const clientId = env.get("RECKITT_API_TECHUSER_CLIENT_ID");
const secret = env.get("RECKITT_API_TECHUSER_CLIENT_SECRET");
msg.method = "POST";
msg.url = `https://${tenantName}.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials`;
msg.headers = {
  "Authorization": "Basic " + Buffer.from(`${clientId}:${secret}`).toString("base64"),
  "Accept": "application/json"
};
return msg;
```

**Function node 2, "save token"** (in Insights Hub use `tenant.set`; in plain Node-RED use `flow.set`)
```js
flow.set("access_token_OEE", msg.payload.access_token);
return null;
```

**Function node 3, "GET assets"** (wire to a second `http request` node with the same settings; this is the GET)
```js
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/assets";
msg.headers = {
  "Authorization": "Bearer " + flow.get("access_token_OEE"),
  "Accept": "application/json"
};
msg.payload = null;
return msg;
```
Other GETs from the same flows only change `msg.url` (for example `/api/oee/v3/assets/<assetId>/config` or `/api/iottimeseries/v3/timeseries/<assetId>/<aspect>?from=..&to=..`).

Two flow nodes (`http request` with `useMindsphereAuth`) skip the token step, but they only work inside the Insights Hub runtime, not locally.

## API areas
| Area | Base path | Seen in | GET calls known | Test plan |
|---|---|---|---|---|
| IAM token | `https://<tenant>.piam.eu1.mindsphere.io/oauth/token` | all Postman, Paul-Flow, farhan-flows | 0 (POST) | One POST, needs approval |
| Technical Token Manager | `/api/technicaltokenmanager/v3/oauth/token` | AssetFilterFinal.py | 0 (POST) | Skip, `caditiot` app credentials, not `reckitt` |
| OEE app v3 | `/api/oee/v3` | OEE Postman, Paul-Flow, farhan-flows, mei-flows | 68 distinct paths (table below) | Main test area |
| Asset Management v3 | `/api/assetmanagement/v3` | Testing + OEE Postman, Paul-Flow, farhan-flows, Python | `assets`, `assets/{id}`, `assets/{id}/aspects`, `assettypes`, `assettypes/{id}`, `aspecttypes` | Test, needed to find asset IDs |
| IoT Time Series v3 | `/api/iottimeseries/v3/timeseries/{assetId}/{aspect}?from&to` | Testing Postman, Paul-Flow, farhan-flows, Python | 1 (read) | Test with a short window |
| Event Management v3 | `/api/eventmanagement/v3` | Testing Postman (`caditiot`), farhan-flows (SDK node) | `events`, `events/{id}`, job status | Low priority, tenant `caditiot` |
| Insights Hub SDK nodes | no URL in flow | Paul-Flow, farhan-flows, mei-flows | n/a | Cannot call locally; need REST equivalents from your colleague |

### OEE v3 GET endpoints (from the Reckitt OEE Postman collection), grouped
Prefix `/api/oee/v3`. `{x}` means an ID you get from a list call first.
Count: 68 distinct GET paths in the OEE collection (66 OEE + 2 Asset Management in its `MISC` folder), from 72 GET requests (the rest are variants with different query strings). Adding the other Asset Management GETs (`assets/{id}`, `assettypes`, `assettypes/{id}`, `aspecttypes`), the time series read and the Event Management GETs from the Testing collection (`events`, `events/{id}`, two job-status paths, tenant `caditiot`) gives about 77 distinct GET paths in total.

| Group | GET paths |
|---|---|
| health | `/health`, `/version` |
| assets (start here) | `/assets`, `/assets/{assetId}`, `/assets/{assetId}/config`, `/assets/{assetId}/manualInputs`, `/assets/{assetId}/manualInputs/{id}`, `/assets/{assetId}/productionTarget`, `/assets/{assetId}/downtimeReasons`, `/assets/{assetId}/topDowntimeReasons`, `/assets/{assetId}/topRejectReasons`, `/assets/{assetId}/downtimeDistribution`, `/assets/{assetId}/statusDistribution`, `/assets/{assetId}/filterValues`, `/assets/{assetId}/measure`, `/assets/{assetId}/calendar`, `/assets/{assetId}/productCollection`, `/assets/{assetId}/rejectReasonCollection`, `/assets/{assetId}/comment` (+ `/{commentId}`) |
| asset sources | `/assets/{assetId}/orderSource`, `productSource`, `designSpeedSource`, `stateTableSource`, `operandInstancesSource` |
| asset assignments | `/assets/{assetId}/status/{statusId}/measureAssignment` (+ `/{id}`), `/assets/{assetId}/status/{statusId}/workorderAssignment` (+ `/{id}`) |
| master data | `/productCollections` (+ `/{id}`, `/{id}/products`, `/{id}/products/{id}`), `/productUnits` (+ `/{id}`), `/qualityCodes` (+ `/{id}`), `/calendars` (+ `/{id}`, `/{id}/calendarEvents`, `/{id}/calendarEvents/{id}`), `/timeModel` (+ `/{id}/categories`, `/{id}/categories/{id}`) |
| reasons | `/reasontrees` (+ `/{id}`, `/{id}/reasons`, `/{id}/reasons/{id}`), `/rejectReasonCollections` (+ `/{id}`, `/{id}/rejectReasons`, `/{id}/rejectReasons/{id}`), `/measureCollections` (+ `/{id}`, `/{id}/measures`, `/{id}/measures/{id}`), `/stateTables` (+ `/{id}`, `/{id}/states`, `/{id}/states/{id}`) |
| calculation setup | `/expressions` (+ `/{id}`), `/operands`, `/microStops` |
| app | `/application/settings` |

Suggested order: `/health` (no data) -> `/assets` (get IDs) -> `/assets/{id}/config` -> `/reasontrees` -> `/assets/{id}/manualInputs?from&to` -> time series read.

## Not testable without your approval (write or destructive)
| Kind | Where |
|---|---|
| OEE Postman | 60 POST, 43 PUT, 28 DELETE (comments, assignments, sources, merge/split, status overwrite, master data, expressions, settings) |
| Time series | PUT writes in Paul-Flow and farhan-flows; DELETE in Paul-Flow tab `OEE` and farhan-flows tab `Delete Timeseries` |
| OEE manual inputs | POST / PUT `/assets/{assetId}/manualInputs` (flows write reject reasons and hourly entries) |
| Event Management | create and delete event jobs (Testing Postman) |
| Calculation POSTs | Listed in the next section. They look read-only (no data stored) but are still POSTs, so I ask before each first call |

## Calculation POSTs (request a KPI calculation, not documented as writes). `evaluateKPIs` is **tested**, see [kpis.md](kpis.md); the others are not
These POSTs send a time range and get calculated values back. In the flows the response is only read and parsed (for example `Parse KPIs`, `Build OEE Daily Report Row`), and nothing is stored by the OEE call itself. That is how the flows use them; the server behaviour has not been verified, so the first test of each needs your OK. Prefix `/api/oee/v3`. Auth: Bearer token.

| Endpoint | Purpose | Request body | Used by |
|---|---|---|---|
| `POST /expressions/evaluateKPIs` | Calculate the standard KPI set (availability, performance, quality, OEE and related values) for one asset and period | `{ "assetId": "<id>", "scope": { "from": "<ISO time>", "to": "<ISO time>", "filter": [{"key":"PRODUCT","value":[]},{"key":"ORDER","value":[]}], "recursive": false, "groupedByDateTime": false } }` | Paul-Flow tabs `Line `, `Line OEE Aggregator`, `B2 Line OEE Aggregator` (per asset, rate limited) and `OEE Daily Report B2` (daily 05:59 cron). Also Postman `expressions / evaluateKPIs` and `mei-flows` tab `B2 Line Bad Parts` |
| `POST /expressions/{expressionId}/evaluate` | Evaluate one named expression (Quality, Performance, Availability, OEE, TEEP, TotalTime, OperationalTime, NetProductionTime, NetOperationTime, UsedOperationTime, Theoretical output, Total Parts) | Same shape as above. `groupedByDateTime: true` returns one value per time bucket; `recursive: true` includes child assets | Postman folder `expressions / evaluation` (13 requests). Expression IDs come from `GET /expressions` |
| `POST /assets/{assetId}/timeModelCategoryDistribution` | Distribution of time per time-model category (running, stopped, planned stop and so on) for a period | `{ "from": "<ISO time>", "to": "<ISO time>", "filter": [{"key":"PRODUCT","value":[]},{"key":"ORDER","value":[]}] }` (farhan-flows also sends `"force": true`) | Postman `assets`; farhan-flows tab `B2 line OEE` (node `distribution / volume`) |

How the flows use the result (from the Paul-Flow functions): the response holds a `results` array (also seen nested as `payload.results`) with one entry per KPI (name and value). Missing KPI names are warned about ("check KPI name matches tenant"), so KPI names can differ per tenant.

Example, Node-RED function node (untested), same wiring as the GET example:
```js
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
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-02T00:00:00.000Z",
    filter: [{ key: "PRODUCT", value: [] }, { key: "ORDER", value: [] }],
    recursive: false,
    groupedByDateTime: false
  }
};
return msg;
```

## Where to find things
- Per-file call lists: [inventory.md](inventory.md) and `docs/inventory/`
- Credentials and questions for your colleague: [auth-checklist.md](auth-checklist.md)
- Final docs (Phase C): `docs/README.md` index, `docs/auth.md`, one file per API area, one file for Node-RED outbound calls. Not written yet.
