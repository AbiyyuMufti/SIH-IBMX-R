# Endpoint reference (all tested calls)

| At a glance | |
|---|---|
| **Use it to** | Look up one call fast: method, path, parameters, what comes back, and which file explains it |
| **Scope** | Only calls that were **tested** on the `reckitt` tenant on 2026-10-02 with the API technical user. Write calls are not listed here (see [api-summary.md](api-summary.md)) |
| **Hosts** | Login `https://reckitt.piam.eu1.mindsphere.io`; API gateway `https://gateway.eu1.mindsphere.io` (paths below are relative to the gateway) |
| **Auth** | `Authorization: Bearer <token>` on every call, see [auth.md](auth.md). How to wire it in Node-RED: [quickstart.md](quickstart.md) |

## Conventions that apply to every call
| Topic | Rule |
|---|---|
| Services | **OEE** `/api/oee/v3`, **Asset Management** `/api/assetmanagement/v3`, **IoT Time Series** `/api/iottimeseries/v3` |
| `Accept` header | OEE and Time Series: `application/json`. **Asset Management: `application/hal+json`** (with `application/json` it fails with HTTP 500 "No acceptable representation") |
| IDs | 32-character hex strings. The `assetId` is the same in all three services. **Names are not unique** (two assets called `GT4`), always use IDs |
| Time | ISO 8601 UTC (`2026-10-01T00:00:00.000Z`) in `from`, `to` and in responses |
| Units | OEE durations are **milliseconds** (a few come as strings, for example `topDowntimeReasons`). OEE ratios are fractions (1 = 100 %). Hourly operator entries use **minutes** |
| List shapes | OEE: mostly an object with one named array (`{ "reasons": [...] }`), some plain arrays (`/assets`, `/calendars`, `/productUnits`, top reasons). Asset Management: HAL (`_embedded`, `_links`, `page`). Time Series: plain array of records |
| Paging | **OEE lists are not paged** (`size`/`page` ignored; `/measureCollections` always returns exactly 100). **Asset Management** pages with `size` and `page` (0-based; 246 assets = 2 pages of 200). **Time Series** has no paging: `limit` max 2000, range max 90 days, read in windows |
| Errors | OEE: `{ "errors": [ { "code", "logref", "message" } ] }`. Time Series: `{ "timestamp", "status", "error", "message", "path" }` with codes in the message (`[6009]` limit or range, `[6410]` unknown aspect). Asset Management: `{ "errors": [ { "code", "message" } ] }` |
| Status codes seen | 200 OK, 400 bad parameters or unsupported asset, 403 no permission (or missing token), 404 unknown asset or resource, 500 wrong `Accept` header on Asset Management |
| Permissions | The API technical user can read everything below **except** Asset Management types (`/assettypes`, `/aspecttypes`: HTTP 403) |

## 1. Login and service status
| Method | Path | Purpose | Params / body | Returns | Doc |
|---|---|---|---|---|---|
| POST | `https://reckitt.piam.eu1.mindsphere.io/oauth/token` | Get a Bearer token | Query `grant_type=client_credentials`; header `Authorization: Basic base64(id:secret)` | `{ access_token, token_type, expires_in (about 1799), scope, jti }` | [auth.md](auth.md) |
| GET | `/api/oee/v3/health` | Service up and token accepted | none | HTTP 200, empty body | [service-status.md](service-status.md) |
| GET | `/api/oee/v3/version` | Service version | none | `{ "version": "..." }`. HTTP 403 without a token | [service-status.md](service-status.md) |

## 2. Assets and hierarchy
| Method | Path | Purpose | Params / body | Returns | Doc |
|---|---|---|---|---|---|
| GET | `/api/oee/v3/assets` | The OEE assets (44) | none effective | Array of `{ assetId, name, description, isManual, isConfigured, reasonTreeId }` | [assets.md](assets.md) |
| GET | `/api/oee/v3/assets/{assetId}` | OEE alert thresholds | none | `{ assetId, thresholds: { warnings[], errors[] } }`. 404 for non-OEE assets (for example a site) | [assets.md](assets.md) |
| GET | `/api/assetmanagement/v3/assets` | All assets with parent and type (246) | `size`, `page` (0-based), `filter` | `{ _embedded.assets[], _links, page }`. Needs `hal+json` | [assets.md](assets.md) |
| GET | `/api/assetmanagement/v3/assets?filter={"parentId":"<id>"}` | Children of one asset | JSON filter, URL-encoded | Same shape | [assets.md](assets.md) |
| GET | `/api/assetmanagement/v3/assets/root` | The top asset | none | One asset with `hierarchyPath` | [assets.md](assets.md) |
| GET | `/api/assetmanagement/v3/assets/{assetId}` | One asset with ancestors | none | Asset with `hierarchyPath`, `_links` | [assets.md](assets.md) |
| GET | `/api/assetmanagement/v3/assets/{assetId}/aspects` | Aspect names of an asset | none | `{ _embedded.aspects[], page }` | [assets.md](assets.md) |
| GET | `/api/assetmanagement/v3/assettypes`, `/assettypes/{id}`, `/aspecttypes` | Type definitions | | **HTTP 403** for this user | [assets.md](assets.md) |

## 3. Raw machine data
| Method | Path | Purpose | Params / body | Returns | Doc |
|---|---|---|---|---|---|
| GET | `/api/iottimeseries/v3/timeseries/{assetId}/{aspectName}` | Stored values of one aspect | `from`, `to` (max 90 days), `limit` (max 2000), `sort` (`asc` default, `desc`). With no `from`/`to` and `limit=1` you get the latest record | Array of `{ <variable>, <variable>_qc, _time }`. `[]` if no data. 404 `[6410]` for an unknown aspect | [timeseries.md](timeseries.md) |

## 4. Operator input
| Method | Path | Purpose | Params / body | Returns | Doc |
|---|---|---|---|---|---|
| GET | `/api/oee/v3/assets/{assetId}/manualInputs` | Shift entries entered by operators | `from`, `to` | `{ manualInputs[], virtualPeriods[] }` | [manual-inputs.md](manual-inputs.md) |
| GET | `/api/iottimeseries/v3/timeseries/{assetId}/OEE_Hourly_Entry` | Hourly entries from the operators' form | `from`, `to`, `limit` | Array of hourly records (JSON inside text fields, contains `ActorEmail`) | [manual-inputs.md](manual-inputs.md) |
| GET | `/api/oee/v3/assets/{assetId}/comment` | Standalone status comments | `from`, `to` | Array (empty for GT4) | [manual-inputs.md](manual-inputs.md) |

## 5. Reports and KPIs
| Method | Path | Purpose | Params / body | Returns | Doc |
|---|---|---|---|---|---|
| GET | `/api/oee/v3/assets/{assetId}/productionTarget` | Production vs target over time | `from`, `to` | `{ total[], good[], rejected[], target[] }` of `{ time, value }` (about 1000 points) | [kpis.md](kpis.md) |
| GET | `/api/oee/v3/assets/{assetId}/downtimeReasons` | Downtime rows with reasons | `from`, `to` | `{ _embedded.downtimeReasons[], page, ... }` (default page size 25) | [kpis.md](kpis.md) |
| GET | `/api/oee/v3/assets/{assetId}/topDowntimeReasons` | Ranked downtime reasons | `from`, `to` | Array (`duration` is a string, ms) | [kpis.md](kpis.md) |
| GET | `/api/oee/v3/assets/{assetId}/topRejectReasons` | Ranked reject reasons | `from`, `to` | Array | [kpis.md](kpis.md) |
| GET | `/api/oee/v3/assets/{assetId}/statusDistribution`, `/downtimeDistribution` | Time split by status or downtime reason | `from`, `to` | `{ totalCount, totalDuration, average, median, path, distribution[] }` | [kpis.md](kpis.md) |
| GET | `/api/oee/v3/assets/{assetId}/filterValues` | Values usable as filters | `from`, `to` | `{ filterValues: [ { key, value[] } ] }` (`order`, `product`, `shift`) | [kpis.md](kpis.md) |
| GET | `/api/oee/v3/assets/{assetId}/measure` | Measure collection of the asset | none | `{ measureCollectionId }` or `{}` | [kpis.md](kpis.md) |
| POST | `/api/oee/v3/expressions/evaluateKPIs` | All 30 KPIs for one asset and period | Body `{ assetId, scope: { from, to, filter[], recursive, groupedByDateTime } }` | `{ scope, results[ { name, value, humanFormula, ... } ], took, missingMapping, productUnit }` | [kpis.md](kpis.md) |
| POST | `/api/oee/v3/expressions/{expressionId}/evaluate` | One expression, optionally per hour | Same body | Same envelope with 1 result; `groups[]` per hour if `groupedByDateTime` | [kpis.md](kpis.md) |
| POST | `/api/oee/v3/assets/{assetId}/timeModelCategoryDistribution` | Machine timeline in segments | Body `{ from, to, filter[], force? }` (flat, no `scope`) | `{ from, to, filter, distribution[] }`. **HTTP 400 for manual assets** (GT4) | [kpis.md](kpis.md) |

All three POSTs only calculate; nothing was seen to be stored. They are the only POSTs in this file besides the token.

## 6. Configuration and master data (all GET, OEE service)
| Path | Returns | Doc |
|---|---|---|
| `/assets/{assetId}/config` | Where counts, order, product, speed and state come from, plus calendar and list IDs. Shape differs per asset | [config-and-master-data.md](config-and-master-data.md) |
| `/assets/{assetId}/calendar`, `/productCollection`, `/rejectReasonCollection`, `/measure` | One ID each (`{ calendarId }` and so on) | same |
| `/assets/{assetId}/orderSource`, `/productSource`, `/designSpeedSource`, `/stateTableSource`, `/operandInstancesSource` | Source configuration with `mode` (`CONNECTED`, `MANUAL`, `STATUS_RULE`, `CALCULATED`) | same |
| `/assets/{assetId}/status/{statusId}/measureAssignment`, `/workorderAssignment` | Empty lists in the tests. `statusId` comes from `downtimeReasons` | same |
| `/reasontrees`, `/reasontrees/{id}`, `/reasontrees/{id}/reasons` | 22 trees; reasons are a flat list (1034 for one tree) with `parentId` | same |
| `/calendars`, `/calendars/{id}`, `/calendars/{id}/calendarEvents?from&to` | Shift calendars and their recurring events | same |
| `/timeModel`, `/timeModel/{id}/categories` | One object; 20 time categories (`Run`, `Planned stop`, `Availability loss`, ...) | same |
| `/productCollections`, `/productCollections/{id}`, `/productCollections/{id}/products` | Products with design speed | same |
| `/productUnits`, `/qualityCodes` | Units; quality-code mappings | same |
| `/measureCollections`, `/measureCollections/{id}/measures` | Measures (the list is capped at 100) | same |
| `/rejectReasonCollections`, `/rejectReasonCollections/{id}/rejectReasons` | Reject reasons as a tree via `parentId` | same |
| `/stateTables`, `/stateTables/{id}`, `/stateTables/{id}/states` | Machine state code to reason mapping | same |
| `/expressions`, `/expressions/{id}`, `/operands` | The 34 KPI expressions and their formulas; operands | [kpis.md](kpis.md) |
| `/microStops` | One object: the micro-stop rule | [config-and-master-data.md](config-and-master-data.md) |
| `/application/settings` | HTTP 404 in this tenant | same |

## Not in this file
- Everything not tested: write calls (POST, PUT, DELETE on manual inputs, comments, setup, master data, time series), Event Management (other tenant), and the Insights Hub Node-RED SDK nodes (no URL to call). See [api-summary.md](api-summary.md).
