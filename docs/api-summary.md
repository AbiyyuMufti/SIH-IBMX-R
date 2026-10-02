# API overview: what exists, what is tested, what is not

| At a glance | |
|---|---|
| **Use it to** | See every API found in the source files, grouped by what you want to do, with its test status. For the tested details go to [endpoints.md](endpoints.md) |
| **Tenant** | `reckitt`. Gateway `https://gateway.eu1.mindsphere.io`, login `https://reckitt.piam.eu1.mindsphere.io` |
| **Sources** | 2 Postman collections, 3 Node-RED flow files, 1 Python script (per-call lists: [inventory.md](inventory.md)) |
| **Done** | All read-style OEE calls, Asset Management reads (types denied), Time Series reads, 3 calculation POSTs |
| **Not done** | Write calls (deliberately skipped), Event Management (other tenant), Node-RED SDK nodes (no URL) |

## What exists, grouped by behaviour
| Behaviour | APIs | What it gets you | Status | Details |
|---|---|---|---|---|
| **Log in** | IAM `POST /oauth/token` | A 30-minute Bearer token | Tested | [auth.md](auth.md) |
| **Check the service** | OEE `/health`, `/version` | Up/down check and version. Both need the token | Tested | [service-status.md](service-status.md) |
| **Find assets** | OEE `/assets`, `/assets/{id}`; Asset Management `/assets`, `/assets/root`, `/assets/{id}`, `/assets/{id}/aspects`, `/assettypes`, `/aspecttypes` | Asset IDs and the hierarchy (246 assets, 44 with OEE) | Tested. Types: **denied (403)** | [assets.md](assets.md) |
| **Read raw machine data** | IoT Time Series `/timeseries/{assetId}/{aspect}` | Counters, states, speeds, sensors. Max 2000 records and 90 days per call | Tested on B2 Line | [timeseries.md](timeseries.md) |
| **Read operator input** | OEE `/assets/{id}/manualInputs`, `/comment`; time series `OEE_Hourly_Entry` | What operators entered by hand (GT4, later Mira) | Tested on GT4 | [manual-inputs.md](manual-inputs.md) |
| **Read calculated results** | OEE reports (`productionTarget`, `downtimeReasons`, `topDowntimeReasons`, `topRejectReasons`, `statusDistribution`, `downtimeDistribution`, `filterValues`) and POSTs `evaluateKPIs`, `/expressions/{id}/evaluate`, `timeModelCategoryDistribution` | OEE, availability, performance, quality and 26 other KPIs; downtime and reject breakdowns; machine timeline | Tested (the 3 POSTs were approved by the user) | [kpis.md](kpis.md) |
| **Read configuration and master data** | OEE `/assets/{id}/config` and sources, `/reasontrees`, `/calendars`, `/timeModel`, `/productCollections`, `/productUnits`, `/qualityCodes`, `/measureCollections`, `/rejectReasonCollections`, `/stateTables`, `/expressions`, `/operands`, `/microStops`, `/application/settings` | How OEE is set up and the formulas behind the KPIs | Tested | [config-and-master-data.md](config-and-master-data.md) |
| **Events** | Event Management `/events`, job status | Platform events. Only in the `caditiot` Postman collection | Not tested (other tenant, low priority) | [inventory](inventory/CADIT%20Insights%20Hub%20Services%20Testing.postman_collection.json.md) |
| **Change data** | OEE POST, PUT, DELETE; time series PUT, DELETE; event create and delete | Write operator input, change setup, delete data | **Not tested, skipped on purpose** | see below |
| **Only inside Insights Hub Node-RED** | SDK nodes (`read-oee`, `read timeseries`, `write timeseries`, `create event`, Object Storage nodes) | The same data through built-in nodes, no URL | Not callable locally | [inventory.md](inventory.md) |

## Coverage by service
| Service | Base path | Seen in | Tested | Not tested |
|---|---|---|---|---|
| IAM token | `https://<tenant>.piam.eu1.mindsphere.io/oauth/token` | all Postman, Paul-Flow, farhan-flows | `reckitt` | Other tenants (`caditiot`, `greggs`) and the other `techuser` token requests |
| Technical Token Manager | `/api/technicaltokenmanager/v3/oauth/token` | `AssetFilterFinal.py` | no | App credentials for the `caditiot` tenant, not for `reckitt` |
| OEE app | `/api/oee/v3` | OEE Postman, Paul-Flow, farhan-flows, mei-flows | about 50 GET paths, 3 POSTs | Single-item reads by ID of lists already tested, and all writes |
| Asset Management | `/api/assetmanagement/v3` | Testing + OEE Postman, Paul-Flow, farhan-flows, Python | assets, root, one asset, children by filter, aspects | Types (HTTP 403) |
| IoT Time Series | `/api/iottimeseries/v3/timeseries/...` | Testing Postman, Paul-Flow, farhan-flows, Python | read | PUT (write), DELETE |
| Event Management | `/api/eventmanagement/v3` | Testing Postman, farhan-flows (SDK node) | no | all |

**OEE GET paths left untested** (all are single-item reads by ID of lists that were tested, or returned no data): `/assets/{id}/comment/{commentId}`, `/assets/{id}/manualInputs/{id}`, `.../measureAssignment/{id}`, `.../workorderAssignment/{id}`, `/calendars/{id}/calendarEvents/{id}`, `/timeModel/{id}/categories/{id}`, `/productCollections/{id}/products/{id}`, `/productUnits/{id}`, `/qualityCodes/{id}`, `/measureCollections/{id}`, `/measureCollections/{id}/measures/{id}`, `/rejectReasonCollections/{id}`, `/rejectReasonCollections/{id}/rejectReasons/{id}`, `/reasontrees/{id}/reasons/{id}`, `/stateTables/{id}/states/{id}`.

## How data gets in (context from the user)
- **B2 Line:** automatic. Real assets connected through **MindConnect**, so machine signals arrive in the time series by themselves (asset types `B2_Line_*_Asset_OEE_Automatic`).
- **GT4, and soon Mira:** **manual OEE**. Operators enter data through a digital form in Insights Hub. It lands in OEE manual inputs and in the `OEE_Hourly_Entry` aspect.
- `isManual` is `true` for 39 of 44 OEE assets, including `B2 Line`, so it probably means "manual input is allowed", not "data is only manual" (not confirmed).
- Consequence for the API: `timeModelCategoryDistribution` works only on automatic assets, and the operator-input reads only show data for manual ones.

## Write calls (not tested, skipped on purpose)
Postman holds about 60 POST, 43 PUT and 28 DELETE requests for the OEE service. The sources contain no description of them; the meanings below are inferred from names, bodies and the flows. Nothing here was run.
| Group | What it does (inferred) | Count | Risk |
|---|---|---|---|
| Notifications (`/notifications/iot`, `/notifications/provisioning`) | Platform-internal: "new data arrived" notifications; provisioning looks like tenant set-up (`action: "PROVISION"`) | 2 POST | High. Do not use |
| Rewrite status history (`merge`, `split`, `status/overwrite`, `status/replace`) | Merge or split status periods, change reasons over a range | 2 POST, 2 PUT | High: rewrites downtime history of real assets |
| Change how an asset is calculated (`orderSource`, `productSource`, `designSpeedSource`, `stateTableSource`) | Switch a source between connected, manual and fixed | 11 POST | High: changes OEE for real assets |
| Operator input (`manualInputs`, `comment`, `measureAssignment`, `workorderAssignment`) | Create shift entries, comments, measures, work orders | 4 POST | Medium: changes the reports of that asset |
| Create master data (calendars, products, units, quality codes, categories, reason trees and reasons, measures, reject reasons, state tables) | Add reference data | about 23 POST | Low to medium |
| Time series write and delete | `PUT` and `DELETE /timeseries/{assetId}/{aspect}` used by the source flows to store calculated OEE and to clean up | PUT, DELETE | High for DELETE |

Ideas if you later want to test writes (not done): send an invalid body to one create endpoint (for example `POST /productUnits`) to learn whether the technical user may write at all (403 vs 400), and use a sandbox asset such as `Hull > Test Line` if your colleague confirms it is one.

## Where to find things
| You want | Open |
|---|---|
| Start using the API | [quickstart.md](quickstart.md) |
| One call fast | [endpoints.md](endpoints.md) |
| Which source file calls what | [inventory.md](inventory.md) and `inventory/` |
| Where credentials come from, and questions for your colleague | [auth-checklist.md](auth-checklist.md) |
| How each finding was obtained | [test-log.md](test-log.md) |
