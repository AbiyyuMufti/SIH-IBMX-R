# API summary (placeholder)

> **Status: placeholder, built from the source files only. Nothing here has been called yet.** It will be replaced by the real docs in Phase C (`docs/README.md` plus one file per API area) after the GET tests in Phase B. Detail per call is in [inventory.md](inventory.md); auth is in [auth-checklist.md](auth-checklist.md).

Target tenant for testing: **reckitt** (decided by the user). Gateway: `https://gateway.eu1.mindsphere.io`. IAM host for the token: `https://reckitt.piam.eu1.mindsphere.io`.

## How access works (3 steps)
1. **Get a token (a POST, needs your OK first).** `POST https://reckitt.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials` with header `Authorization: Basic base64(clientId:clientSecret)`. Response field `access_token`. Client ID and secret go in `.env` (`RECKITT_OEE_CLIENT_ID`, `RECKITT_OEE_CLIENT_SECRET`), see [auth-checklist.md](auth-checklist.md).
2. **Call the API with `Authorization: Bearer <access_token>`.** Tokens expire; the flows refresh every 19 minutes (1140 s).
3. **Read the JSON.** List endpoints return `_embedded` + `page` (pagination); errors are HTTP status codes (to be documented after testing).

The token call is the only POST needed to start. Everything after it can be GET-only.

## Example taken from the flows: GET with a token (Node-RED, untested)
Based on Paul-Flow.json tab `Line ` (function `OEE`, node `http request`) and tab `OEE` (function `Technical user`). Secrets are read from env vars, never typed in.

**Function node 1, "token request"** (wire to an `http request` node: method "use msg.method", return "a parsed JSON object"; then to node 2)
```js
const tenantName = "reckitt";
const clientId = env.get("RECKITT_OEE_CLIENT_ID");
const secret = env.get("RECKITT_OEE_CLIENT_SECRET");
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
| Read-style POST | `POST /api/oee/v3/expressions/evaluateKPIs` and `POST /assets/{id}/timeModelCategoryDistribution` compute results without storing (used heavily by the flows). Still a POST, so I will ask first |

## Where to find things
- Per-file call lists: [inventory.md](inventory.md) and `docs/inventory/`
- Credentials and questions for your colleague: [auth-checklist.md](auth-checklist.md)
- Final docs (Phase C): `docs/README.md` index, `docs/auth.md`, one file per API area, one file for Node-RED outbound calls. Not written yet.
