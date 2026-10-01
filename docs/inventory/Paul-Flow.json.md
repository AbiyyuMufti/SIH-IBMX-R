# Inventory: Paul-Flow.json

Source: `source/Paul-Flow.json` (Node-RED flows export, 196 nodes, 7 tabs). Outbound calls only. `http in` / `http response` nodes are ignored (out of scope).
Generated with the help of `scripts/helper-nodered-outline.js` (secrets redacted). No `flows_cred.json` provided; no node carries a `credentials` block.

## Outbound node summary
| Kind | Count |
|---|---|
| `http request` nodes | 29 (27 take URL/method/headers from `msg.*`; 2 use the Insights Hub fields `mindspherePath` + `useMindsphereAuth`) |
| Function nodes using fetch/axios/http | 0 |
| Insights Hub `write object` nodes | 2 (SDK nodes, no URL in config) |

Tabs: `OEE`, `Line ` (trailing space in the name), `Line OEE Aggregator` (2 tabs with this name; one is disabled), `B2 Line OEE Aggregator`, `OEE Daily Report B2`, `Flow 1` (no outbound calls).

## Auth
1. **Token request (client credentials, Basic)**: tab `OEE`, function `Technical user` builds `Authorization: Basic base64(clientId:secret)`. **The tenant name, client ID and client secret are hardcoded in this function's code** (variables `tenantName`, `clientId`, `secret`). Not copied here. See [auth-checklist.md](../auth-checklist.md).
2. The token is stored with `tenant.set('access_token_OEE', ...)` (function `save token to flow`, tab `OEE`).
3. All other API calls build `Authorization: Bearer <tenant.get('access_token_OEE')>` in a function node (`msg.headers`).
4. Token refresh: the inject node feeding `Technical user` runs every 1140 s (19 min) and once at start.
5. Two nodes (`mindspherePath` + `useMindsphereAuth`) use the Insights Hub runtime's built-in auth instead of a token.

`tenant` is a Node-RED context object available in Insights Hub function nodes (tenant-wide context).

## Calls
Base `https://gateway.eu1.mindsphere.io` (region `eu1`, domain `mindsphere.io`; several functions build it as `https://gateway.${region}.${domain}`).
`Trigger` = what starts the flow. "manual" = inject button. HTTP-in triggers belong to out-of-scope inbound endpoints.

### Tab `OEE`
| # | Node (name / id) | Method | URL | Auth | Trigger / notes |
|---|---|---|---|---|---|
| 1 | `http request` / 938a2d49.42f6f8 | POST | `https://<tenantName>.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials` (`msg.url` from function `Technical user`) | Basic (hardcoded in function) | Inject every 1140 s + on start. Response `access_token` saved by `save token to flow` |
| 2 | `http request` / 99287d7a.e9819 | PUT if `eTag` given, else POST | `https://gateway.eu1.mindsphere.io/api/oee/v3/assets/${assetId}/manualInputs[/${periodId}]` | Bearer `tenant.access_token_OEE`; `If-Match: eTag` on PUT | Inbound HTTP endpoint (out of scope) passes `msg.req.query` (assetId, periodId, eTag, productId). Write call |
| 3 | `http request` / c86e3fc9.2ea6a | PUT | `https://gateway.eu1.mindsphere.io/api/iottimeseries/v3/timeseries/${assetId}/OEE_Prerequisites` | Bearer `tenant.access_token_OEE`; `Content-Type`/`Accept: application/json` | HTTP-in or manual inject. Writes time series. `ret=txt` |
| 4 | `http request` / 298a5c3.e632924 | PUT | `.../api/iottimeseries/v3/timeseries/${assetId}/OEE_Hourly_Entry` | Bearer `tenant.access_token_OEE` | HTTP-in (`V3` function reads flow var `payl`). Writes time series. `ret=txt` |
| 5 | `http request` / 280447d7.2e5cf | GET | `/api/iottimeseries/v3/timeseries/<assetId>/OEE_Hourly_Entry?from=2026-08-27T06:00:00.000Z&to=2026-08-27T18:00:00.000Z&limit=2000&sort=asc&latestValue=false` (node field `mindspherePath`) | Insights Hub built-in (`useMindsphereAuth`), no token | Manual inject. Output to debug only |
| 25 | `http request` / 8d4e5b58.d17f08 | DELETE | `https://gateway.eu1.mindsphere.io/api/iottimeseries/v3/timeseries/?from=2026-09-14T06:00:00.000Z&to=2026-09-14T18:00:00.000Z` (aspect `OEE_Prerequisites` set in code; asset ID/aspect do not appear in the URL as written, looks incomplete) | Bearer `tenant.access_token_OEE` | Manual inject. **Destructive**, do not call |

### Tab `Line ` (all manual inject, output to debug unless noted)
| # | Node (name / id) | Method | URL | Auth | Notes |
|---|---|---|---|---|---|
| 6 | `http request` / 6897e61f.c954 (function `find child Assets of Liine`) | GET | `https://gateway.eu1.mindsphere.io/api/assetmanagement/v3/assets?filter=...` (filter on `parentId`, default asset ID hardcoded) | Bearer `tenant.access_token_OEE` | Output split to function `function:f17c5e8a.21abe8` (reads `_embedded.assets`), then feeds #11 |
| 7 | `http request` / 7fd00cb2.a62cdc (function `OEE`) | GET | `.../api/oee/v3/assets` (+ optional `filter`,`size`,`page`,`sort`) | Bearer | |
| 8 | `http request` / 4ed14c6d.769f8c (function `OEEAsset`) | GET | `.../api/oee/v3/assets/<assetId>` | Bearer | |
| 9 | `http request` / b65fa174.f06b6 (function `config`) | GET | `.../api/oee/v3/assets/<assetId>/config` | Bearer | |
| 10 | `http request` / 9aba5f1b.f499b8 (function `manualInputs`) | GET | `.../api/oee/v3/assets/<assetId>/manualInputs?from=<now-36h>&to=<now>` | Bearer | |
| 11 | `http request` / f02da67b.998e3 (function `Timeseries Read`) | GET | `.../api/iottimeseries/v3/timeseries/${assetId}/${aspectName}?from=..&to=..` | Bearer | Fed by split of assets from #6 via delay node |
| 12 | `http request` / e4427612.261838 (function `measure`) | GET | `.../api/oee/v3/assets/<assetId>/measure?from=<now-36h>&to=<now>` | Bearer | |
| 13 | `http request` / f81d0879.5ae2b (function `evaluateKPIs`) | POST | `https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/evaluateKPIs` | Bearer | Body: `from`, `to`, asset and KPI list. Read-style POST (computes KPIs) |

### Tab `Line OEE Aggregator` (a second tab with the same name is disabled; nodes #18, #19 are in the disabled tab)
| # | Node (name / id) | Method | URL | Auth | Trigger / notes |
|---|---|---|---|---|---|
| 14 | `MindSphere OEE API` / d6346a5f.f47238 | POST | `https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/evaluateKPIs` | Bearer | Per asset (Split per asset, delay, `Prepare Request`, config from `Set Config`). Response to `Parse KPIs` |
| 15 | `http request` / 70962fe.688015 | GET | `/api/oee/v3/assets` (field `mindspherePath`) | Insights Hub built-in | Inject `Run` (manual); output to `Filter Assest`, then `Set Config`, which starts #14 |
| 16 | `http request` / 966052fe.a1016 (function `OEEAsset`) | GET | `.../api/oee/v3/assets` | Bearer | Manual inject, debug only |
| 17 | `http request` / 57b81581.0b114c (function `manualInputs`) | GET | `.../api/oee/v3/assets/<assetId>/manualInputs?from=..&to=..` | Bearer | Manual inject. Output to `function:66bcf740.654138` (reads `virtualPeriods`), feeds #22 |
| 18 | `POST evaluateKPIs` / 77a82e1a.188ff **(disabled tab)** | POST | `<gatewayBase>/api/oee/v3/expressions/evaluateKPIs` | Bearer | Old copy of #20 |
| 19 | `GET manualInputs` / 15a88f14.65d089 **(disabled tab)** | GET | `<gatewayBase>/api/oee/v3/assets/<assetId>/manualInputs?from=..&to=..` | Bearer | Old copy of #21 |
| 22 | `http request` / 4e535f7.367f12 (function `evaluateKPIs`) | POST | `https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/evaluateKPIs` | Bearer | Chain: #17 then function then #22. Output not wired |
| 26 | `http request` / d4d3296c.f948c8 (function `manualInputs`) | GET | `.../api/oee/v3/assets/<assetId>/manualInputs?from=..&to=..` | Bearer | Manual inject; feeds #27 |
| 27 | `http request` / 79dc9619.0b3dd8 (function `evaluateKPIs`) | POST | `https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/evaluateKPIs` | Bearer | Output to debug |
| 30 | `write object` / d0c8a319.27d9d8 | (Insights Hub SDK) | Insights Hub Object Storage (`path`/`mode=object`, no URL in node) | Insights Hub built-in | Writes Parquet built by `Create OEE Parquet` from KPI results (`Prepare OEE KPI records`) |

### Tab `B2 Line OEE Aggregator`
| # | Node (name / id) | Method | URL | Auth | Notes |
|---|---|---|---|---|---|
| 20 | `POST evaluateKPIs` / aec40029.97b64 | POST | `<gatewayBase>/api/oee/v3/expressions/evaluateKPIs` (`gatewayBase` from flow var `lineConfig`) | Bearer; `Content-Type: application/json` | Per asset, rate limited. Output to `Parse KPIs` |
| 21 | `GET manualInputs` / dbefc7b4.d8b91 | GET | `<gatewayBase>/api/oee/v3/assets/<assetId>/manualInputs?from=<scope.from>&to=<scope.to>` | Bearer | Feeds `Merge ManualInputs & Finish Asset` |
| 23 | `POST evaluateKPIs` / e8c0e712.e33e38 | POST | `<gatewayBase>/api/oee/v3/expressions/evaluateKPIs` | Bearer | Variant with minified function code |
| 24 | `GET manualInputs` / bf3b5d93.3bb038 | GET | `<gatewayBase>/api/oee/v3/assets/<assetId>/manualInputs?from=..&to=..` | Bearer | Minified variant of #21 |

### Tab `OEE Daily Report B2`
| # | Node (name / id) | Method | URL | Auth | Trigger / notes |
|---|---|---|---|---|---|
| 28 | `http request` / accc2813.ea716 (function `manualInputs`) | GET | `.../api/oee/v3/assets/<assetId>/manualInputs?from=<now-36h>&to=<now>` | Bearer | Inject cron `59 05 * * *` (daily 05:59). Feeds #29 |
| 29 | `http request` / 7f22f86b.f50388 (function `evaluateKPIs`) | POST | `https://gateway.eu1.mindsphere.io/api/oee/v3/expressions/evaluateKPIs` | Bearer | Output to `Build OEE Daily Report Row`, then Parquet, then #31 |
| 31 | `write object` / d9f435fd.6d55f | (Insights Hub SDK) | Insights Hub Object Storage (`mode=object`) | Insights Hub built-in | Writes the daily report Parquet |

## Findings
- Hardcoded credentials: tab `OEE`, function `Technical user` (client secret and client ID in code). Reported to the user; value not recorded.
- Hardcoded IDs: asset IDs appear in several function nodes and in #5's `mindspherePath` (not secrets).
- Hardcoded dates in #5 (Aug 2026), #13 payload (`from`) and #25 (Sep 2026).
- Token acquisition (#1) is only wired on tab `OEE`. Tabs `Line `, `Line OEE Aggregator`, `B2 Line OEE Aggregator`, `OEE Daily Report B2` read `tenant.get('access_token_OEE')`, so they depend on tab `OEE` running (tenant-wide context).
- Calls use `msg.method`, so the node-level method shows as `use` for 27 nodes; effective methods are in the table.
- Write/destructive calls (ask before testing): #2 (POST/PUT), #3 and #4 (PUT time series), #25 (DELETE time series), #30/#31 (Object Storage writes).
