# Smoke check after the Xcelerator IAM / siemens.app move (2026-10-13)

Script: `scripts/smoke-check.js` (read-only: GET, the token POST and one read-style POST, `redirect: 'manual'` everywhere). No fix was made. No flow, doc or default was changed.

## Short answer
- **Old way still works today:** old token endpoint, old gateway host, old paths. 26 of 27 GET calls and `evaluateKPIs` behave as in `docs/` (see the one difference below). No redirect was returned anywhere.
- **New way is not verified.** `XC_TENANT_ID` is missing in `.env`, so the Xcelerator token was skipped. Combinations (b) and (c) could not run.
- **The new host rejects the old token** with HTTP 401 on every family (combination d). That is expected if the new host only accepts Xcelerator tokens, but it is untested with a new token, so it is not proven.

## Token findings
| Item | Result |
|---|---|
| Old token request (client credentials, same as `lib-ih.js`) | HTTP 200, no redirect |
| `iss` claim (old token) | `https://<tenant name>.piam.eu1.mindsphere.io/oauth/token` |
| Claims that carry the tenant (old token) | `ten` only. The value is **7 characters** (the tenant name). The task text says 8 characters; the real length is 7 |
| New token request | **Skipped**: `XC_TENANT_ID` is not in `.env`. Needs the 10-digit tenant ID, then re-run the script |
| `sws.samauth.ten` claim | Not checked (no new token) |

## Calls
Combinations: (a) old host + old token, (b) old host + new token, (c) new host + new token, (d) new host + old token. Paths on the new host use `-1000001700` after the service name. "Docs" = status expected from `docs/endpoints.md`. IDs hidden.

| Call | (a) old/old | (b) old/new | (c) new/new | (d) new/old | Docs |
|---|---|---|---|---|---|
| GET oee `/health` | 200 | not run | not run | 401 | 200 |
| GET oee `/version` | 200 | not run | not run | 401 | 200 |
| GET oee `/assets` | 200 | not run | not run | 401 | 200 |
| GET oee `/assets/{id}` | 200 | not run | not run | 401 | 200 |
| GET oee `/assets/{id}/config` | 200 | not run | not run | 401 | 200 |
| GET oee `/assets/{id}/filterValues` | 200 | not run | not run | 401 | 200 |
| GET oee `/assets/{id}/topDowntimeReasons` | 200 | not run | not run | 401 | 200 |
| GET oee `/assets/{id}/productionTarget` | 200 | not run | not run | 401 | 200 |
| GET oee `/assets/{id}/manualInputs` | 200 | not run | not run | 401 | 200 |
| GET oee `/reasontrees` | 200 | not run | not run | 401 | 200 |
| GET oee `/calendars` | 200 | not run | not run | 401 | 200 |
| GET oee `/stateTables` | 200 | not run | not run | 401 | 200 |
| GET oee `/productCollections` | 200 | not run | not run | 401 | 200 |
| GET oee `/productUnits` | 200 | not run | not run | 401 | 200 |
| GET oee `/qualityCodes` | 200 | not run | not run | 401 | 200 |
| GET oee `/timeModel` | 200 | not run | not run | 401 | 200 |
| GET oee `/measureCollections` | 200 | not run | not run | 401 | 200 |
| GET oee `/rejectReasonCollections` | 200 | not run | not run | 401 | 200 |
| GET oee `/expressions` | 200 | not run | not run | 401 | 200 |
| GET oee `/microStops` | 200 | not run | not run | 401 | 200 |
| GET oee `/application/settings` | 404 | not run | not run | 401 | 404 |
| GET assetmanagement `/assets` (size 1) | 200 | not run | not run | 401 | 200 |
| GET assetmanagement `/assets/root` | 200 | not run | not run | 401 | 200 |
| GET assetmanagement `/assets/{id}` | 200 | not run | not run | 401 | 200 |
| GET assetmanagement `/assets/{id}/aspects` | 200 | not run | not run | 401 | 200 |
| GET assetmanagement `/assettypes` | **200** | not run | not run | 401 | **403** |
| GET iottimeseries `/timeseries/{id}/OEE_Hourly_Entry` (limit 1) | 200 | not run | not run | 401 | 200 |
| POST oee `/expressions/evaluateKPIs` (one asset, 2026-09-30) | 200, 30 results | not run | not run | not run (health was 401) | 30 KPIs |

Host in (a): `gateway.eu1.mindsphere.io`. Host in (d): `api.eu1.siemens.app`. Redirects: none in any call, so no Location host to report.

`evaluateKPIs` result count: old host 30. New host: not comparable yet (no new token).

## Differences from `docs/`
1. **`GET /api/assetmanagement/v3/assettypes` returned 200, docs say 403** (`docs/endpoints.md`, `docs/assets.md`, `docs/README.md` item 9). Not caused by the migration as far as we can tell (the call ran on the old host with the old token). The technical user may now have more permission. Needs a check by the user before the docs are changed.
2. **Tenant claim length:** `ten` is 7 characters, the migration notes say 8.
3. **Combination (d)** (new host, old token) returns 401 on every family. Docs do not cover the new host.

Everything else on the old host matched `docs/`.

## What is still unknown
- Whether the new token works (needs `XC_TENANT_ID`), and its claim `sws.samauth.ten`.
- The exact suffix for oee, assetmanagement and iottimeseries. I used `-1000001700` for all three as instructed; a 401 does not prove the path exists or does not exist.
- The auth style of the new OAuth endpoint: the script sends HTTP Basic plus a form body `grant_type=client_credentials` (untested).
- Whether the old gateway keeps working after the cut-over date (it works today).

## What must change (not done yet; depends on the new token test)
| File | Change |
|---|---|
| `scripts/vfc/c1-config.js` | `gateway` is hardcoded (`https://gateway.eu1.mindsphere.io`). Becomes `https://api.eu1.siemens.app`. Add the tenant ID and the service suffix as settings |
| `scripts/vfc/s2-token-request.js` | Token URL is built from the tenant name plus `.piam.eu1.mindsphere.io/oauth/token`. Needs the `https://<tenant ID>.eu1.sws.siemens.com/oauth` form |
| Other function nodes in `scripts/vfc/` (`d4-*`, `d7-*`, `r3-*`, `r4-*` request nodes) | They use `cfg.gateway` (host is fine) but write `/api/oee/v3/...` in the code. The suffix needs a shared helper or a config value, so one change covers all nodes |
| `scripts/lib-ih.js` | Defaults for `gateway`, `tokenUrl` and `oeePath` point to the old host and path. Add `XC_TENANT_ID`, a new host and suffix, and the new token request. Also `scripts/test-*.js` that use them |
| Generated flows `flows/vfc-*.json` | Contain the old host and token URL as built from the files above. Rebuild with `node scripts/build-vfc-site-flows.js` and the other build scripts, do not hand-edit. The VFC `http request` nodes take the URL from `msg.url`, so no node needs its own host change, but the user must confirm in the VFC |
| `docs/auth.md`, `docs/endpoints.md`, `docs/README.md`, `docs/auth-checklist.md`, `docs/quickstart.md`, `docs/service-status.md` | Hosts, token URL, paths, token claims. Plus the other docs that name the gateway (`assets.md`, `kpis.md`, `timeseries.md`, `manual-inputs.md`, `config-and-master-data.md`, `api-summary.md`, `test-log.md`, `inventory*`) |
| `.env` | Add `XC_TENANT_ID` (not set), then re-run `node scripts/smoke-check.js` |

## Next step
Add `XC_TENANT_ID` to `.env` and re-run the script. Combinations (b) and (c) and the `evaluateKPIs` result comparison fill in then. If (c) fails with 404 for a family, the suffix for that service differs and the Location header or the Siemens migration page must supply it.
