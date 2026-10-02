# Test log

History of what was called, in order, with the script and sample for each step. Read this only if you want to know how a finding was obtained. The findings themselves are in the behaviour files listed in [README.md](README.md).

All tests: tenant `reckitt`, user = API technical user, 2026-10-02. All calls are GET except the token POST and the three calculation POSTs (tests 7 and 8). Scripts are in `scripts/`, redacted samples in `samples/` (gitignored, not part of the repo).

## Test 1: login and health (what the first test did)
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

## Test 2: `/version` and `/assets`
- `GET /version` returned `{"version": "1.24.39"}`. Asking again **without** a token returned HTTP 403, so assume OEE calls need the token (the Postman collection marks this one as no auth, which is wrong here).
- `GET /assets` returned 44 assets in a plain list (name, description, a few flags and a reason-tree ID). There is no paging information, so the whole list arrived at once. The `assetId` values are what the later tests use.
- Script: `scripts/test-version-assets.js`. Redacted samples: `samples/oee_version.json`, `samples/oee_assets.json`.

## Test 3: the hierarchy, paging, assets and reason trees
- The Asset Management list rebuilds the same tree you see in the Insights Hub UI (reckitt > EU > Hull > Bottles > B2 Line > 7 machines). 246 assets in total, 44 of them in the OEE list. **Asset Management needs `Accept: application/hal+json`**; with `application/json` it fails with HTTP 500.
- OEE `/assets` ignores `size` and `page`: always all 44.
- `B2 Line` and its 7 machines are OEE assets; `GT4` is, but its 10 machines are not. `Hull` (a site) is **not** an OEE asset: OEE returns 404 for it.
- Reason trees are the lists of downtime and loss reasons per asset (22 trees; `B2 Line Reason Tree` has 1034 reasons in a flat list with `parentId`).
- Scripts: `scripts/test-assets-paging-detail.js`, `scripts/test-asset-tree.js`, `scripts/test-hull-reasontrees.js`.

## Test 4: raw machine data (time series)
- `02 Filler` (B2 Line, automatic) has 6 aspects; 4 hold data, `OEE_MachineState` and `OEE_MachineSpeed` are empty for the last 30 days.
- Limits found: **max 2000 records per call, max 90 days per range**. A busy aspect fills the 2000 cap in about 30 minutes, so long ranges must be read in small windows.
- Counters (`GoodParts`, `BadParts`) are cumulative; records are sparse; every variable has a `_qc` quality field.
- Script: `scripts/test-timeseries.js`. Redacted samples: `samples/ts_02_filler_*.json`.

## Test 5: operator input on GT4 (manual OEE), windows 24 h, 48 h, 7 d
- OEE `manualInputs` returns an object `{ manualInputs, virtualPeriods }`: one entry per 12-hour shift (order, product, counts, reject reasons, downtime reasons) plus the empty slots. GT4 had 1 entry in 24 h and 48 h, 2 in 7 d (little data, looks like test use).
- The `OEE_Hourly_Entry` time series holds the hourly entries from the operators' form. Three fields are JSON stored in text, and `ActorEmail` is personal data.
- Units differ: milliseconds in the OEE service, minutes in the hourly entries.
- Reports tested: `productionTarget`, `downtimeReasons`, `topDowntimeReasons`, `topRejectReasons`. The `statusId` in `downtimeReasons` is the key for status-level calls.
- Script: `scripts/test-manual-inputs.js`. Redacted samples: `samples/oee_manualinputs_gt4.json` and others.

## Test 6: remaining reports and all master data lists (B2 Line and GT4)
- Reports: `downtimeDistribution`, `statusDistribution`, `filterValues`, `measure`. Duration is a string on B2 Line and a number on GT4. B2 Line has a `##MICROSTOPS##` pseudo-reason (2108 occurrences in 7 d).
- Per-asset setup: each source has a `mode` (`CONNECTED` for B2 Line, `MANUAL` for GT4, `STATUS_RULE`, `CALCULATED`) and counters have a `valueType` (`CNT_PROGRESSIVE` or `CNT_DIFF`).
- Master data: 12 lists plus their nested lists. `/timeModel` and `/microStops` are single objects, `/measureCollections` always returns exactly 100, `/application/settings` returns 404.
- Scripts: `scripts/test-asset-reports.js`, `scripts/test-master-data.js` (helper `scripts/lib-probe.js`).

## Test 7: Asset Management types (denied) and the KPI POST
- `/assettypes`, `/assettypes/{id}` and `/aspecttypes` return **403 Access Denied** for the API technical user (it can read assets and aspects only).
- `POST /expressions/evaluateKPIs` (approved, same call as Paul-Flow): HTTP 200 in under 1 s, 30 KPIs with `value` and a `humanFormula`. B2 Line 24 h: OEE 0.42, Performance 2.17 (above 100 %, looks like a configuration or data problem), GT4 48 h: OEE 0.12. `recursive: true` gave 21 extra operand rows but the same values.
- Script: `scripts/test-am-types.js`, `scripts/test-kpi-post.js`.

## Test 8: the other two calculation POSTs
- `POST /expressions/{id}/evaluate` calculates one expression; `groupedByDateTime: true` gives one value per hour (`groups`); `recursive: true` also returns the expressions and operands it depends on. Works for the auxiliary expressions too.
- `POST /assets/{id}/timeModelCategoryDistribution` returns the machine timeline in segments (B2 Line, 24 h: 469 segments, 14.2 h run and 9.9 h unplanned downtime, matching the KPI call). **Manual assets (GT4) are refused with HTTP 400.**
- Paul-Flow's daily report writes every returned KPI as a Parquet column; its other tabs pick OEE, Availability, Performance, Quality and the parts and time KPIs.
- Script: `scripts/test-kpi-post2.js`.

## Test 9: report data coverage cross-check
- Per-site OEE asset counts (walk to `basicsite` / `basicarea`): Hull 17, Mira 15, Tuzla 6, STP 4, Weinheim 1, Nottingham 1. 6 assets are unconfigured and answer HTTP 400.
- `topDowntimeReasons` for all 44 OEE assets over 30 days: only Hull (and 1.6 h on one Mira asset) has data; Hull top-level reasons are dominated by `Unplanned Downtime`, `Lack of resources` and blank-path micro stops; `Breakdown` is 17 h, 5 events, 1 asset.
- `evaluateKPIs` on GT4 (7 d) with `SHIFT`, `PRODUCT` and `ORDER` filter values (same approved POST): filters work; `Theoretical output` is not split by order; `missingMapping` flags missing production periods.
- `downtimeReasons` paging: `page` and `size` work, `limit` is ignored. All 232 B2 Line rows in 24 h are `Unplanned Downtime` with no sub-path.
- B2 Line shift calendar, B2 Line product list (123 products), comments on B2 Line (empty), asset description baselines (23 of 44).
- Script: `scripts/test-report-coverage.js`. Result: `prompt-response/report-data-coverage.md`.
