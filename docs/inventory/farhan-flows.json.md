# Inventory: farhan-flows.json

Source: `source/farhan-flows.json` (Node-RED flows export, 344 nodes, 25 tabs). Outbound calls only. `http in` / `http response` nodes (14 each) are ignored (out of scope).
Generated with the help of `scripts/helper-nodered-outline.js` (secrets redacted). No `flows_cred.json` provided; no node carries a `credentials` block.
Disabled tabs: `GT4 line losses`, `GT4 line OEE` (two tabs with this name), `Flow 15`. Rows from disabled tabs are marked **(disabled)**.

## Outbound node summary
| Kind | Count |
|---|---|
| `http request` nodes | 34 (31 via `msg.url`/`msg.method`; 3 with the Insights Hub fields `mindspherePath`/`useMindsphereAuth`, 1 of which is an active GET) |
| Function nodes using fetch/axios/http | 1 flagged by the scanner (`plan requests`, tab `GT4 line OEE`, disabled). It only builds job objects for the `http request` node, it does not call anything itself |
| Insights Hub SDK nodes (`read timeseries`, `write timeseries`, `read-oee`, `read aggregates`, `list objects`, `read object`, `create event`, `subscribe timeseries`, `asset-type`) | 35 |

## Auth mechanisms
| # | Mechanism | Where | Notes |
|---|---|---|---|
| A | **Client-credentials token, Basic auth** built in a function | Tab `OEE`, function `Technical user`: tenant name, client ID and client secret **hardcoded in the code**. Token saved with `tenant.set('access_token_OEE', ...)` (function `save token to flow`). Fired once on start by an inject | Same pattern as Paul-Flow.json. Used by tabs `OEE`, `Flow 14`, `Flow 15`, `V3` via `tenant.get('access_token_OEE')` |
| B | **Client-credentials token, Basic auth** with a default secret in code | Functions named `build token request` in tabs `B2 line OEE` (active), `GT4 line OEE` (2, disabled), `GT4 line losses` (disabled), `Delete Timeseries`. Pattern: `CLIENT_ID = flow.get(...) \|\| "<literal>"`, `CLIENT_SECRET = flow.get(...) \|\| "<literal>"`. **Literal fallback secret in each function** | Flow vars: `GT4_CLIENT_ID`, `GT4_CLIENT_SECRET` (B2 and GT4 tabs), `clientID`, `tokenSecret` (Delete Timeseries). Client ID default is a hardcoded literal; token URL hardcoded `https://<tenant>.piam.eu1.mindsphere.io/oauth/token` with body `grant_type=client_credentials`. Token stored in flow var `b2_token` / `gt4_token` / `token` |
| C | **Client-credentials token, values from flow context** | Tab `Delete Timeseries`, function `2 · build token request`: `IH_TOKEN_URL`, `IH_CLIENT_ID`, `IH_CLIENT_SECRET` read from flow vars, filled by function `write config into flow context` from flow vars `tokenUrl`, `clientID`, `tokenSecret` | Where those flow vars are first set is not in the file. Token kept in flow var `IH_TOKEN` |
| D | **Bearer passed in by the caller** | Tab `Reckitt - Get Reason Tree Reasons v3`, function `Prepare OEE API request`: token from inbound query parameter `key`, base URL from the inbound `Host` header | Outbound side of an inbound endpoint (inbound endpoint itself out of scope). Also checks `key` against flow var `REASONS_V3_PUBLIC_KEY` in `Validate key and reasonTreeId` |
| E | **Insights Hub built-in auth** | `http request` nodes with `useMindsphereAuth`, and all SDK nodes | No credentials in the file |

Locations of hardcoded secrets (values not copied): see Findings.

## Calls: `http request` nodes
Base `https://gateway.eu1.mindsphere.io`. Node IDs given so you can search for them in the editor.

### Tab `OEE` (active)
| # | Node / id | Method | URL | Auth | Trigger / notes |
|---|---|---|---|---|---|
| 23 | `http request` / 83d9312d.14a928 | POST | `https://<tenantName>.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials` | Basic (A) | Inject once on start. Response to `save token to flow` |
| 24 | `http request` / f34ebfc8.36768 | PUT if `eTag`, else POST | `/api/oee/v3/assets/${assetId}/manualInputs[/${periodId}]` | Bearer `tenant.access_token_OEE`, `If-Match: eTag` on PUT | Triggered by inbound endpoint `entry` (out of scope). Write call |
| 25 | `http request` / c9c9f502.bbdb3 | PUT | `/api/iottimeseries/v3/timeseries/${assetId}/${aspectName}` | Bearer | Triggered by inbound endpoint `ts`. Writes time series. `ret=txt` |
| 26 | `http request` / b266682b.3d8ef | PUT | same as #25 | Bearer | Inbound endpoint `oee` (writes `OEE_Hourly_Entry`-style record). Writes time series |
| 27 | `http request` / 675dc95e.0de54 | GET | `/api/iottimeseries/v3/timeseries/<assetId>/OEE_Hourly_Entry?from=2026-08-27T06:00:00.000Z&to=...&limit=2000&sort=asc&latestValue=false` (via `mindspherePath`) | Insights Hub built-in (E) | Manual inject, output to debug |

### Tab `Flow 14` (active) / `V3` (active) / `Flow 15` **(disabled)**
These three tabs repeat the same three calls as tab `OEE` (#24-#26), each behind its own inbound endpoint and each reading `tenant.get('access_token_OEE')`.
| Tab | Manual-inputs write (POST/PUT) | Time-series write (PUT) | Time-series write (PUT) |
|---|---|---|---|
| `Flow 14` | #29 / 8a49df78.23b398 | #28 / b9d64d2e.b86af (endpoint `oee v2`) | #30 / 76f91600.9730d (endpoint `ts v2`) |
| `V3` | #34 / d4359d33.4285 | #35 / 45b4bbc.15ecf44 | #36 / 95917c6e.de68a |
| `Flow 15` (disabled) | #31 / a88ccc30.9e295 | #32 / df2f9659.4c3188 | #33 / 7e1495be.68e42c |

URLs, methods and auth are identical to #24 (`/api/oee/v3/assets/${assetId}/manualInputs[/${periodId}]`) and #25 (`/api/iottimeseries/v3/timeseries/${assetId}/${aspectName}`). All are write calls.

### Tab `B2 line OEE` (active; hourly inject)
| # | Node / id | Method | URL | Auth | Notes |
|---|---|---|---|---|---|
| 15 | `POST token` / 8d5f3a81.adfbb8 | POST | `https://reckitt.piam.eu1.mindsphere.io/oauth/token` (body `grant_type=client_credentials`) | Basic (B) | Inject `hourly` (3600 s). Saves `b2_token` |
| 16 | `GET children` / 1af996fb.069101 | GET | `/api/assetmanagement/v3/assets?size=200&filter=<parent filter>` | Bearer `b2_token` | Lists the line's machines |
| 17 | `distribution / volume` / cef870f7.ca33e | POST and GET (one message per job) | POST `/api/oee/v3/assets/<assetId>/timeModelCategoryDistribution` (body `force`, `from`, `to`, `filter`); GET `/api/oee/v3/assets/<assetId>` and `/api/oee/v3/assets/<assetId>/productionTarget?from=..&to=..&filter=..` | Bearer `b2_token` | Jobs built by `plan requests`; results go to `tag response` / `resultant + line OEE` |
| 18 | `PUT line aspect` / 38ef6769.213258 | PUT | `/api/iottimeseries/v3/timeseries/<lineAssetId>/OEE_Hourly_Entry` and `.../OEE_Prerequisites` | Bearer `b2_token` | Writes line OEE results. Write call. Actor email default is set in function `build line records` |
SDK nodes in this tab: `list objects` (f982d423.6664f8), `read object` (48669246.f6af34, reads an `.xlsx` from the Integrated Data Lake path `/integrated-data-lake/product-master/...`).

### Tab `Delete Timeseries` (active; inbound endpoint `GET /deleteTimeseries` triggers it, inbound out of scope)
| # | Node / id | Method | URL | Auth | Notes |
|---|---|---|---|---|---|
| 22 | `POST token` / 302e4c96.42f18c | POST | `https://reckitt.piam.eu1.mindsphere.io/oauth/token` | Basic (B) | Inject `Admin CMD` once on start; response to `write config into flow context` |
| 19 | `PIAM token` / 734b1193.1bd8e | POST | `IH_TOKEN_URL` (flow var) | Basic from `IH_CLIENT_ID`/`IH_CLIENT_SECRET` (C) | Step 2 of the delete flow; saves `IH_TOKEN` |
| 20 | `read points` / 859c7452.00f7 | GET | `<IH_GATEWAY>/api/iottimeseries/v3/timeseries/<assetId>/<aspect>?from=..&to=..` | Bearer `IH_TOKEN` | Reads the window before deleting |
| 21 | `DELETE points` / 4808f20d.3e3c2c | DELETE | `<IH_GATEWAY>/api/iottimeseries/v3/timeseries/<assetId>/<aspect>?from=..&to=..` | Bearer | **Destructive.** Has a dry-run mode. Do not call |

### Tab `Reckitt - Get Reason Tree Reasons v3` (active)
| # | Node / id | Method | URL | Auth | Notes |
|---|---|---|---|---|---|
| 37 | `GET OEE reason tree reasons` / 27d7d61d.2849b2 | GET | `<inbound Host header>/api/oee/v3/reasonTrees/<reasonTreeId>/reasons` | Bearer from inbound query `key` (D) | Response is forwarded by `Forward status and body`. Base URL comes from the incoming request, not from a variable |

### Tabs `GT4 line OEE` **(disabled)** and `GT4 line losses` **(disabled)**
| # | Tab / node / id | Method | URL | Auth | Notes |
|---|---|---|---|---|---|
| 4 | losses / `POST token` / 647c4616.c91c5 | POST | `https://reckitt.piam.eu1.mindsphere.io/oauth/token` | Basic (B) | Inject every 3600 s |
| 5 | losses / `GET downtimeReasons` / 58def188.2a0af | GET | `/api/oee/v3/assets/<assetId>/downtimeReasons` | Bearer `gt4_token` | |
| 6 | losses / `PUT timeseries` / cb899e66.a3076 | PUT | `/api/iottimeseries/v3/timeseries/<lineAsset>/<GT4_TARGET_ASPECT>` | Bearer | Write |
| 7, 10 | OEE / `POST token` / 4fe08817.f680a8, 146acbb6.439f9c | POST | `https://reckitt.piam.eu1.mindsphere.io/oauth/token` | Basic (B) | Inject hourly |
| 8, 13 | OEE / `GET (volume / downtime / tree)` / 91ce5745.bc4c68, 71c766a0.62e14 | GET | `/api/oee/v3/assets/<assetId>/productionTarget?from=..&to=..&filter=..&force=true`, `/api/oee/v3/assets/<assetId>/downtimeReasons?...`, `/api/oee/v3/reasontrees/<treeId>/reasons?includeTimeModel=true` | Bearer `gt4_token` | URLs prepared by `plan requests` / `plan data requests` |
| 9 | OEE / `PUT line timeseries` / 3588ae03.b157e2 | PUT | `/api/iottimeseries/v3/timeseries/<lineAsset>/<GT4_TARGET_ASPECT>` | Bearer | Write |
| 11 | OEE / `GET children` / 8f666640.a543b | GET | `/api/assetmanagement/v3/assets?size=200&filter=...` | Bearer | |
| 12 | OEE / `GET asset config` / 6147a89f.d77ef8 | GET | `/api/oee/v3/assets/<assetId>/config` | Bearer | |
| 14 | OEE / `PUT line aspect` / 60e35931.4d8df8 | PUT | `/api/iottimeseries/v3/timeseries/<lineAssetId>/OEE_Hourly_Entry` and `/OEE_Prerequisites` | Bearer | Write |
| (3) | OEE / function `plan requests` / f4915c07.44f828 | - | Builds the jobs above; no call of its own | - | Flagged by the scanner only |

## Calls: Insights Hub SDK nodes (no URL in the node)
These nodes call platform APIs internally with the runtime's identity. Underlying API is inferred from the node type; confirm with the colleague if exact endpoints are needed.

| Node type | Count | Tabs / node names | Inferred API | Direction |
|---|---|---|---|---|
| `read timeseries` | 14 | `Flow 1` (Cartoner, CasePacker, Depalletizer, Filler, Palletizer, CARTONER), `Flow 4` (4), `Flow 11` (Read GT4), `OEE` (Hourly Data, TS), `Flow 16` (B2 Counters). Asset and aspect IDs and variable lists are in `topic`/`topicData` | IoT Time Series v3 read | Read |
| `read aggregates` | 2 | `Flow 5` (b997f68e.63ce58), `Flow 16` (d9f1e040.bd3398) | IoT Time Series Aggregates | Read |
| `read-oee` | 11 | `Flow 2` (7), `Flow 5`, `OEE` (1a8a1609.c3d89a), `GT4 line OEE` (2, disabled). Config: `assetId`, `kpiIds`, `period`, `mode` | OEE app v3 KPI read | Read |
| `list objects` / `read object` | 2 / 1 | `B2 line OEE`, `Flow 17` | Integrated Data Lake (Object Storage) | Read |
| `subscribe timeseries` | 1 | `OEE` (dbcc39bb.240ee) on `OEE_Hourly_Entry/Statuses`, feeds `create event` | Time series subscription | Read |
| `create event` | 1 | `OEE` (3d78a1e6.d7684e) | Event Management v3 | **Write** |
| `write timeseries` | 2 | `Flow 1` (7456b95e.0b7e9 on `OEE_MachineState/Status_MachineState`; 4c33cd1.49db1b4 is unconfigured) | IoT Time Series v3 write | **Write** |
| `asset-type` | 1 | `Flow 11` (59bbd17.2326bb) | Asset Management v3 (read or write unknown) | Unknown |

## Findings
- **Hardcoded secrets** (values not copied):
  - Tab `OEE`, function `Technical user` (53d5e4a.b48a21c): client ID and client secret literals.
  - Fallback client secret literal inside `build token request` functions: tab `B2 line OEE` (fb5853b0.867458), tab `GT4 line OEE` (e7b6bcbc.9458c, f66152e5.64853), tab `GT4 line losses` (3f84e0f5.b85a58), tab `Delete Timeseries` (45ec1f4d.1eaef8). A hardcoded client ID default is in the same functions.
- Personal/identifying data in code: default `ActorEmail` strings in `build line records` (tabs `B2 line OEE` and `GT4 line OEE`). Not copied.
- Flow variables expected but whose values are not in the file: `GT4_CLIENT_ID`, `GT4_CLIENT_SECRET`, `clientID`, `tokenSecret`, `tokenUrl`, `REASONS_V3_PUBLIC_KEY`, `IH_GATEWAY`, `GT4_TARGET_ASPECT`, `B2_*`/`GT4_*` window and nominal-output settings.
- Comments inside several functions note that bearer tokens are printed to the debug pane. Not an API issue, but worth fixing in the source flows.
- Write/destructive (ask before testing): #18, #21 (DELETE), #6, #9, #14, #24-#26, #28-#36, SDK `write timeseries` and `create event`.
