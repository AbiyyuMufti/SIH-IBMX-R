# Insights Hub API notes (Reckitt tenant)

## How to read these docs (also for feeding them to another AI)
- Start with this file, then [api-summary.md](api-summary.md) (everything that exists, grouped by behaviour, with test status and order).
- Then open the behaviour file you need. Each endpoint has: purpose, method, URL, params, headers, example request (pasteable into a Node-RED function node), example response, gotchas.
- Every endpoint is labelled **Tested** (called and verified on the Reckitt tenant, date given) or **From source only** (found in Postman, flows or the Python script, not called). Do not treat "from source only" as verified.
- No secrets, tokens or real IDs are in these files. IDs are shown as `<id>` or `{assetId}`; asset and machine names are real.
- Environment: Reckitt tenant, gateway `https://gateway.eu1.mindsphere.io`, read-only (GET), plus one POST to get the token.

Working docs for calling the Siemens Insights Hub APIs found in the Postman collections, Node-RED flows and Python script. Only things we have actually called are marked **Tested**; everything else is marked **From source only**.

## Index
| File | What it covers | State |
|---|---|---|
| [auth.md](auth.md) | How to get a token and use it. Plain-language walkthrough | Tested |
| [service-status.md](service-status.md) | Behaviour: is the service up and does my token work (`/health`, `/version`) | Tested |
| [assets.md](assets.md) | Behaviour: find assets and the hierarchy (OEE and Asset Management lists, the tree, site level) | Tested |
| [timeseries.md](timeseries.md) | Behaviour: read raw machine data (IoT Time Series): parameters, limits, record format | Tested on B2 Line `02 Filler` |
| [manual-inputs.md](manual-inputs.md) | Behaviour: read operator input on a manual asset (GT4): shift entries, hourly entries | Tested on GT4 |
| [kpis.md](kpis.md) | Behaviour: calculated results and reports (production vs target, downtime and status distributions, reject reasons, filter values) and the list of 34 KPI expressions; KPI POSTs not yet | 7 reports + `evaluateKPIs` POST tested |
| [config-and-master-data.md](config-and-master-data.md) | Behaviour: how OEE is set up (`/config`, per-asset sources), reason trees and all master data lists (calendars, time model, products, quality codes, measures, reject reasons, state tables, expressions, operands, micro stops) | Tested (reads) |
| [api-summary.md](api-summary.md) | Everything that exists across all sources, and what we can test | Placeholder, updated as we go |
| [inventory.md](inventory.md) | Per-file list of every outbound call found in the sources | Complete (Phase A) |
| [auth-checklist.md](auth-checklist.md) | Where each credential comes from in the sources (never values) | Complete (Phase A) |

## Worked example: what the first test did
The goal was to prove that our credentials work and that the OEE service answers. Two requests, in this order:

**1. Ask for a token (POST, once).**
- We sent our client ID and secret to the login service of the Reckitt tenant: `https://reckitt.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials`.
- The ID and secret travel in an `Authorization: Basic ...` header (the two joined as `id:secret` and base64-encoded). They come from `.env`, never from code.
- The service answered **HTTP 200** with a JSON object containing a long text called an access token, how long it is valid (`expires_in` = 1799 seconds, about 30 minutes) and its type (`bearer`).
- Nothing was changed on the platform. This is just logging in.

**2. Use the token to call the API (GET, once).**
- We sent `GET https://gateway.eu1.mindsphere.io/api/oee/v3/health` with the header `Authorization: Bearer <the token>`.
- The service answered **HTTP 200** with an **empty body**. For a health check that is the whole answer: "the OEE service is running and accepted your token".

**What the result tells us:** the credentials are valid, the token is accepted by the OEE API, and the gateway and tenant are reachable. It does *not* yet tell us that the user can read data. Reading real data is the next test (`GET /assets`).

Where it lives in this repo: the script is `scripts/test-auth-health.js` (uses `scripts/lib-ih.js`), the saved response is `samples/oee_health.json` (gitignored).

## Second test: `/version` and `/assets`
- `GET /version` returned `{"version": "1.24.39"}`. Asking again **without** a token returned HTTP 403, so assume OEE calls need the token (the Postman collection marks this one as no auth, which is wrong here).
- `GET /assets` returned 44 assets in a plain list (name, description, a few flags and a reason-tree ID). There is no paging information, so the whole list arrived at once. The `assetId` values are what the later tests use.
- Script: `scripts/test-version-assets.js`. Redacted samples: `samples/oee_version.json`, `samples/oee_assets.json`.

## Third test: the hierarchy, paging, assets and reason trees
- The Asset Management list rebuilds the same tree you see in the Insights Hub UI (reckitt > EU > Hull > Bottles > B2 Line > 7 machines). 246 assets in total, 44 of them in the OEE list. **Asset Management needs `Accept: application/hal+json`**; with `application/json` it fails with HTTP 500.
- OEE `/assets` ignores `size` and `page`: always all 44.
- `B2 Line` and its 7 machines are OEE assets; `GT4` is, but its 10 machines are not. `Hull` (a site) is **not** an OEE asset: OEE returns 404 for it.
- Reason trees are the lists of downtime and loss reasons per asset (22 trees; `B2 Line Reason Tree` has 1034 reasons in a flat list with `parentId`).
- Scripts: `scripts/test-assets-paging-detail.js`, `scripts/test-asset-tree.js`, `scripts/test-hull-reasontrees.js`.

## Fourth test: raw machine data (time series)
- `02 Filler` (B2 Line, automatic) has 6 aspects; 4 hold data, `OEE_MachineState` and `OEE_MachineSpeed` are empty for the last 30 days.
- Limits found: **max 2000 records per call, max 90 days per range**. A busy aspect fills the 2000 cap in about 30 minutes, so long ranges must be read in small windows.
- Counters (`GoodParts`, `BadParts`) are cumulative; records are sparse; every variable has a `_qc` quality field.
- Script: `scripts/test-timeseries.js`. Redacted samples: `samples/ts_02_filler_*.json`.

## Fifth test: operator input on GT4 (manual OEE), windows 24 h, 48 h, 7 d
- OEE `manualInputs` returns an object `{ manualInputs, virtualPeriods }`: one entry per 12-hour shift (order, product, counts, reject reasons, downtime reasons) plus the empty slots. GT4 had 1 entry in 24 h and 48 h, 2 in 7 d (little data, looks like test use).
- The `OEE_Hourly_Entry` time series holds the hourly entries from the operators' form. Three fields are JSON stored in text, and `ActorEmail` is personal data.
- Units differ: milliseconds in the OEE service, minutes in the hourly entries.
- Reports tested: `productionTarget`, `downtimeReasons`, `topDowntimeReasons`, `topRejectReasons`. The `statusId` in `downtimeReasons` is the key for status-level calls.
- Script: `scripts/test-manual-inputs.js`. Redacted samples: `samples/oee_manualinputs_gt4.json` and others.

## Sixth test: remaining reports and all master data lists (B2 Line and GT4)
- Reports: `downtimeDistribution`, `statusDistribution`, `filterValues`, `measure`. Duration is a string on B2 Line and a number on GT4. B2 Line has a `##MICROSTOPS##` pseudo-reason (2108 occurrences in 7 d).
- Per-asset setup: each source has a `mode` (`CONNECTED` for B2 Line, `MANUAL` for GT4, `STATUS_RULE`, `CALCULATED`) and counters have a `valueType` (`CNT_PROGRESSIVE` or `CNT_DIFF`).
- Master data: 12 lists plus their nested lists. `/timeModel` and `/microStops` are single objects, `/measureCollections` always returns exactly 100, `/application/settings` returns 404.
- Scripts: `scripts/test-asset-reports.js`, `scripts/test-master-data.js` (helper `scripts/lib-probe.js`).

## Seventh test: Asset Management types (denied) and the KPI POST
- `/assettypes`, `/assettypes/{id}` and `/aspecttypes` return **403 Access Denied** for the API technical user (it can read assets and aspects only).
- `POST /expressions/evaluateKPIs` (approved, same call as Paul-Flow): HTTP 200 in under 1 s, 30 KPIs with `value` and a `humanFormula`. B2 Line 24 h: OEE 0.42, Performance 2.17 (above 100 %, looks like a configuration or data problem), GT4 48 h: OEE 0.12. `recursive: true` gave 21 extra operand rows but the same values.
- Script: `scripts/test-am-types.js`, `scripts/test-kpi-post.js`.

## How the docs are organised
Files are grouped by **behaviour** (what you want to do), not by service. Each endpoint states its service and base path. Planned files, created as soon as something in them is tested: `events.md`, `write-calls.md`, `nodered-sdk-nodes.md`. The full list of what exists is in [api-summary.md](api-summary.md).

## How we work from here
For every API call we test, we do two things before the next one: save a redacted sample in `samples/`, and write or update the doc for that endpoint here. So reading these docs should always explain the latest call.
