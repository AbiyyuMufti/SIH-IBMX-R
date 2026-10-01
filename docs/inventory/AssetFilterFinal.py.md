# Inventory: AssetFilterFinal.py

Source: `source/AssetFilterFinal.py` (Python, 176 lines, uses `requests` and `pandas`). Read only, never executed. Calls are to be re-implemented as JS in `scripts/` later.

## Purpose
Gets a technical token with app credentials, pages through all assets, reads each asset's type to find its aspect names, then reads time series for each asset/aspect in a fixed window and collects the pairs that return an empty result. Writes CSV/TXT files locally (not API calls, ignored here).

## Variables in the script
| Name | Value (non-secret) | Meaning |
|---|---|---|
| `URL` | `https://gateway.eu1.mindsphere.io` | Gateway |
| `TOKEN_ENDPOINT` | `/api/technicaltokenmanager/v3/oauth/token` | Technical Token Manager |
| `IOT_ENDPOINT` | `/api/assetmanagement/v3/assets` (reassigned later in the loops) | Reused variable |
| `appName` / `appVersion` / `hostTenant` / `userTenant` | `simapiapp` / `v1` / `caditiot` / `caditiot` | App identity for the token request body |
| `assetId`, `aspectName` | one asset ID, `CarOPD` | Declared at top, never used in a request |

## Auth
- **Technical Token Manager flow (app credentials)**: header `X-SPACE-AUTH-KEY: Bearer <base64("<hostTenant>-<appName>-<appVersion>:<app credential secret>")>`. The app credential (the part after the colon) is **hardcoded on line 25** in the variable `decode`. Not copied here. See [auth-checklist.md](../auth-checklist.md).
- The response field `access_token` is used as `Authorization: Bearer <token>` for all later calls.

## Calls
| # | Name / location | Method | URL | Params / body | Auth |
|---|---|---|---|---|---|
| 1 | Token, line 35 | POST | `{URL}/api/technicaltokenmanager/v3/oauth/token` | JSON body: `grant_type=client_credentials`, `appName`, `appVersion`, `hostTenant`, `userTenant`. Header `Content-Type: application/json` | `X-SPACE-AUTH-KEY` (hardcoded app credential) |
| 2 | Asset list, line 62 (loop) | GET | `{URL}/api/assetmanagement/v3/assets` | Query `page=<n>` starting at 1. Stops when `page.totalPages` equals the current page. Reads `_embedded.assets[].assetId/name/typeId` | Bearer (token from #1) |
| 3 | Asset type, line 100 (loop per asset) | GET | `{URL}/api/assetmanagement/v3/assettypes/<typeId>` | none. Reads `aspects[].name` | Bearer |
| 4 | Time series, line 151 (loop per asset and aspect) | GET | `{URL}/api/iottimeseries/v3/timeseries/<assetId>/<aspectName>?from=2024-03-29T00:00:00Z&to=2024-06-01T00:00:00Z` | `from`/`to` hardcoded in the URL | Bearer |

All four are read-style (POST #1 only obtains a token).

## Findings
- Hardcoded credential: line 25, variable `decode` (app credential secret, 43 chars). Reported to the user; value not recorded.
- Absolute local paths with a personal user name appear in file-write calls (lines 73, 104, 128, 167, 173). Not copied; no relevance to the API.
- Loop in #3 ends with `current_asset is df_asset.loc[len(df_asset)-1]`, which compares an integer to a row, so it likely never stops cleanly (would end with an `IndexError`). Do not port as-is.
- #4 treats a response of length 0 as "no data" and collects those pairs.
- No explicit timeout, retry, or error handling on any call.
