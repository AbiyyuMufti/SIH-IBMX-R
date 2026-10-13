# Smoke check after the Xcelerator IAM / siemens.app move (2026-10-13)

Script: `scripts/smoke-check.js` (read-only: GET, the token POSTs and one read-style POST, `redirect: 'manual'` everywhere). No fix was made. No flow, doc or default was changed.

## Short answer
- **The new way works.** The Xcelerator token (same credentials) works on the new host `api.eu1.siemens.app` with the suffix `-1000001700` on all three services (oee, assetmanagement, iottimeseries). 26 of 27 GET calls and `evaluateKPIs` behave as before, and `evaluateKPIs` returns the same number of results (30) as on the old host.
- **The old way still works today** (old token, old gateway).
- **The tokens are not interchangeable:** the new token is refused by the old gateway (403), the old token is refused by the new host (401).
- **Token URL:** `https://<10-digit tenant ID>.eu1.sws.siemens.com/oauth` is not the token endpoint. It answers 302 to `http://…/oauth/`, which answers 307 back to `https://…/oauth/`, and no token. The working endpoint is **`/oauth/token`** (POST, HTTP Basic, form body `grant_type=client_credentials`). The path `/oauth/token` was not in the migration notes; it is the same ending as the old IAM and was tried on purpose.

## Combinations
- (a) old host + old token. How it works today.
- (b) old host + new token.
- (c) new host + new token. The target setup.
- (d) new host + old token.

## Token findings
| Item | Old token | New (Xcelerator) token |
|---|---|---|
| Request | POST `https://<tenant name>.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials`, HTTP 200 | POST `https://<tenant ID>.eu1.sws.siemens.com/oauth/token`, HTTP 200, no redirect |
| Response fields | `access_token, token_type, expires_in, scope, jti` | same five fields, `expires_in` 1799 |
| `iss` | `https://<tenant name>.piam.eu1.mindsphere.io/oauth/token` | `https://<tenant ID>.eu1.sws.siemens.com/oauth/token` |
| Tenant claim | `ten`: 7 characters (the tenant name; the notes say 8) | `sws.samauth.ten`: 10 digits |
| Other tenant claims | none | `sws.samauth.app.ten`, `sws.samauth.ten.extId`, `orig_ten`: 10 digits; `sws.samauth.ten.name`: 7 characters (the tenant name) |

The two `/oauth` and `http://…/oauth/` attempts were only redirects (302, then 307 back to https). Credentials were sent once over plain http to the redirect target on the user's approval; it answered with the redirect only.

## Calls
"Docs" = status expected from `docs/endpoints.md`. IDs hidden. New-host paths have `-1000001700` after the service name. No call returned a redirect.

| Call | (a) old/old | (b) old/new | (c) new/new | (d) new/old | Docs |
|---|---|---|---|---|---|
| GET oee `/health` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/version` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/assets` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/assets/{id}` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/assets/{id}/config` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/assets/{id}/filterValues` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/assets/{id}/topDowntimeReasons` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/assets/{id}/productionTarget` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/assets/{id}/manualInputs` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/reasontrees` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/calendars` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/stateTables` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/productCollections` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/productUnits` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/qualityCodes` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/timeModel` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/measureCollections` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/rejectReasonCollections` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/expressions` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/microStops` | 200 | 403 | 200 | 401 | 200 |
| GET oee `/application/settings` | 404 | 403 | 404 | 401 | 404 |
| GET assetmanagement `/assets` (size 1) | 200 | 403 | 200 | 401 | 200 |
| GET assetmanagement `/assets/root` | 200 | 403 | 200 | 401 | 200 |
| GET assetmanagement `/assets/{id}` | 200 | 403 | 200 | 401 | 200 |
| GET assetmanagement `/assets/{id}/aspects` | 200 | 403 | 200 | 401 | 200 |
| GET assetmanagement `/assettypes` | **200** | 403 | **200** | 401 | **403** |
| GET iottimeseries `/timeseries/{id}/OEE_Hourly_Entry` (limit 1) | 200 | 403 | 200 | 401 | 200 |
| POST oee `/expressions/evaluateKPIs` (one asset, 2026-09-30) | 200, 30 results | not run (health 403) | 200, 30 results | not run (health 401) | 30 KPIs |

Hosts: (a), (b) `gateway.eu1.mindsphere.io`; (c), (d) `api.eu1.siemens.app`.

## Differences from `docs/`
1. **`GET assettypes` returns 200, docs say 403** (`docs/endpoints.md`, `docs/assets.md`, `docs/README.md` item 9). It is 200 on the old host and on the new host, so it is not caused by the migration. The technical user may have more permission now. The user should confirm before the docs are changed.
2. **Old tenant claim:** `ten` is 7 characters, the notes say 8.
3. **Token URL:** `/oauth` (notes) is not the token endpoint; `/oauth/token` is.
4. **Cross use of tokens fails:** (b) 403 and (d) 401. Docs do not cover this.
5. **Host and paths:** new host and the `-1000001700` suffix are not in `docs/` yet.

Everything else matches `docs/`.

## What must change (not done yet)
| File | Change |
|---|---|
| `scripts/vfc/c1-config.js` | `gateway` is `https://gateway.eu1.mindsphere.io`. Change to `https://api.eu1.siemens.app`. Add the tenant ID and the service suffix `-1000001700` as settings. The tenant ID is a credential-like value: keep the placeholder in the committed file |
| `scripts/vfc/s2-token-request.js` | Token URL is built from the tenant name plus `.piam.eu1.mindsphere.io/oauth/token`. Change to `https://<tenant ID>.eu1.sws.siemens.com/oauth/token`. Body can stay as the VFC http request sends it; the script used a form body (`grant_type=client_credentials`) |
| Request nodes in `scripts/vfc/` (`d4-*`, `d7-*`, `r3-*`, `r4-*`, and any other `s*`/`d*` node with `/api/...`) | Host comes from `cfg.gateway`, but the path `/api/oee/v3/...` is typed in the code. The suffix must be added: `/api/oee-1000001700/v3/...`. Best through one shared helper or a config value (`cfg.oeeBase`, `cfg.amBase`, `cfg.tsBase`), so one change covers all nodes |
| `scripts/lib-ih.js` (and the `test-*.js` scripts that use it) | Defaults `gateway`, `tokenUrl`, `oeePath` point to the old host and path. Add `XC_TENANT_ID`, the new host, the suffix and the new token request. Keep a switch to run the old way until the old gateway is gone |
| `flows/vfc-*.json` (generated) | Rebuild with the build scripts after the changes above. Do not hand-edit. The `http request` nodes take the URL from `msg.url`, so they should not need a change; the user checks this in the VFC. Also check the lake and log flows for any typed host |
| `docs/auth.md`, `docs/endpoints.md`, `docs/README.md`, `docs/auth-checklist.md`, `docs/quickstart.md`, `docs/service-status.md` | Hosts, token URL, paths with suffix, token claims. Plus the other docs that name the gateway (`assets.md`, `kpis.md`, `timeseries.md`, `manual-inputs.md`, `config-and-master-data.md`, `api-summary.md`, `test-log.md`, `inventory*`) |
| `.env` | `XC_TENANT_ID` is now set. The VFC needs the same value in the Config node |

## Still open
- The old gateway works today. When it stops, and whether it redirects then, is not known.
- Only GET calls and `evaluateKPIs` were checked. The other two read-style POSTs (`evaluate`, `timeModelCategoryDistribution`) and the data lake / Power BI parts were not.
- Whether the VFC runtime itself allows the new host and token URL was not checked (it needs a run in the VFC).
- Whether the Xcelerator technical user role gives the same data as before (the same 30 KPI results suggest yes, but only one asset and one day were compared).
