# Platform switch (legacy / Xcelerator)

| At a glance | |
|---|---|
| **What this is** | The Reckitt tenant moved to the Siemens Xcelerator IAM and the `siemens.app` domain on 2026-10-12. The old setup still works, so both are supported. One setting chooses which one every flow and script uses |
| **The switch** | VFC: `platform` in node `1.1 CONFIG` (Config tab). Scripts: `IH_PLATFORM` in `.env`. Values `legacy` or `xcelerator`. **No default**: if it is missing or misspelled the Config node stores nothing (red status, error message) and the scripts stop |
| **Status** | Tested 2026-10-13: token and API calls on both platforms from a laptop and from the VFC; mock proof that the rebuilt flows give the same requests, logs and rows on both. The rebuilt flows are not yet imported and run in the VFC |
| **Not covered** | The data lake base path on xcelerator is `/datalake-<tenant id>/v3` (no `/api`), tested on 2026-10-14, see [datalake-files.md](datalake-files.md). The Python lake client and Power BI were not looked at |

## Decision and cutover checklist (2026-10-13)
The VFC will use `xcelerator` from now on, and the move is imminent (decision of the user). `legacy` stays supported in the code until the old setup is switched off. What to do at the cutover:
1. Config tab, node `1.1 CONFIG`: set `platform` = `xcelerator` and `xcTenantId` (the 10-digit tenant ID). The technical user (client ID and secret) is the same on both platforms.
2. Import the rebuilt flows of every tab. Run the Config tab first, then each flow with `dryRun` true. In the debug sidebar check that the requests go to `https://api.eu1.siemens.app/api/<service>-1000001700/v3/...`.
3. Check the data lake in the VFC: the `read object` and `write object` nodes, and the address of the `http in` endpoint of `docs/lake-api.md`. **Not tested on xcelerator.** The Python script (`parquet/request_data.py`) calls a host of `eu1.mindsphere.io`: it is not known whether this host changes.
4. Scripts on the laptop: `IH_PLATFORM=xcelerator` and `XC_TENANT_ID` in `.env`.
5. Do not run the same flow twice (legacy and xcelerator tab copies) against the same data.

## What differs
| | `legacy` | `xcelerator` |
|---|---|---|
| Token request | `POST https://<tenant name>.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials`, Basic auth, no body | `POST https://<10-digit tenant ID>.eu1.sws.siemens.com/oauth/token`, Basic auth, **form body** `grant_type=client_credentials` with `Content-Type: application/x-www-form-urlencoded` |
| API host | `https://gateway.eu1.mindsphere.io` | `https://api.eu1.siemens.app` |
| OEE path | `/api/oee/v3/...` | `/api/oee-1000001700/v3/...` |
| Asset Management path | `/api/assetmanagement/v3/...` | `/api/assetmanagement-1000001700/v3/...` |
| Time Series path | `/api/iottimeseries/v3/...` | `/api/iottimeseries-1000001700/v3/...` |
| Token claims | `ten` (tenant name, 7 characters) | `sws.samauth.ten` (10 digits); also `sws.samauth.app.ten`, `sws.samauth.ten.extId`, `orig_ten` (10 digits) and `sws.samauth.ten.name` (the name) |
| `iss` | `https://<tenant name>.piam.eu1.mindsphere.io/oauth/token` | `https://<tenant ID>.eu1.sws.siemens.com/oauth/token` |
| Token lifetime | `expires_in` 1799 | same, same five fields (`access_token`, `token_type`, `expires_in`, `scope`, `jti`) |

The suffix `1000001700` is the same for all three services (it also ends the launchpad URL). The same technical user (client ID and secret) works on both platforms.

**A token only works on its own platform.** The new token on the old gateway gives HTTP 403, the old token on the new host gives HTTP 401. So the token address, the host and the paths must change together: this is why they come from one switch.

The path `https://<tenant ID>.eu1.sws.siemens.com/oauth` (no `/token`) is not the token endpoint: it answers 302 to an `http://` address, which answers 307 back to `https://.../oauth/`, with no token.

## How it is built
- **VFC.** Node `1.1 CONFIG` (`scripts/vfc/c1-config.js`) has `platform`, `tenantName` (legacy) and `xcTenantId` (xcelerator). From them it builds three addresses once and stores them with the other settings: `cfg.tokenUrl` (plus `cfg.tokenForm`), `cfg.oeeBase`, `cfg.amBase`. The token node (`s2-token-request.js`) and the 13 request nodes only use these. The old `cfg.gateway` no longer exists.
- **Scripts.** `scripts/lib-ih.js` reads `IH_PLATFORM` (and `XC_TENANT_ID` for xcelerator) from `.env`. `cfg.oeePath`, `cfg.amPath`, `cfg.tsPath` and `apiPath()` give the right paths. Tests: `node scripts/test-vfc-flow.js ... platform=legacy|xcelerator` (also `TEST_PLATFORM`).
- **Switching in the VFC.** Change the word in `1.1 CONFIG`, click `Apply`. The settings are stored in global context, so the next run of any flow uses the new platform. Going back is the same edit.
- **Importing.** Import the rebuilt tabs as new tabs and delete the old ones (do not import over an existing tab). Import the Config tab first and fill in client ID, secret, tenant ID and `platform`. Tabs that were not rebuilt (Lake API) do not need an import. The old disabled tabs read `cfg.gateway`, which is gone: re-import them before enabling.

## What was tested (2026-10-13)
| Test | Result |
|---|---|
| `scripts/smoke-check.js` from a laptop: 27 read calls and `evaluateKPIs` on 4 combinations (old host or new host, with the old or the new token) | Old host + old token and new host + new token: 26 of 27 as in the docs, `evaluateKPIs` 30 results on both. The two mixed combinations fail (403 and 401) |
| Probe tab in the VFC, new platform | Token 200 (first try, form body), OEE health, OEE assets, Asset Management assets and `evaluateKPIs` (30 results) all 200 |
| Probe tab in the VFC, old platform | Same five results, 200 and 30 results |
| `node scripts/test-platform-switch.js` (449 checks) | The flows from before the switch (read from git) and the rebuilt flows give identical requests (after mapping host and suffix), logs, errors, parquet rows and lake files, on both platforms, in 22 mock scenarios. On `xcelerator` every API call uses the new host and the suffix |
| `test-vfc-log.js`, `test-vfc-pbi-direct.js`, `test-vfc-powerbi.js` (`platform=legacy` and `platform=xcelerator`) | All pass |
| Config node with a missing, misspelled or incomplete setting | Stores nothing, clears the old settings, red status |

## Differences found while testing (not caused by the switch)
- **Asset Management types.** `GET /assettypes` returned HTTP 200 on both platforms. [assets.md](assets.md) and [endpoints.md](endpoints.md) say 403 (tested 2026-10-02). The permission of the technical user has probably changed; not yet confirmed with Reckitt.
- **Number of OEE assets.** `GET /oee/v3/assets` returned 55 assets (the 2026-10-02 notes say 44), on both platforms. The per-asset analyses in the other docs still describe the 44 of that day.
- **`tenantId` in Asset Management assets.** The field holds the tenant name on `legacy` and the 10-digit tenant ID on `xcelerator` (and the `_links` point to the new host). Our flows read neither. Anything outside this repo that reads `tenantId` would see a changed value.

## Open
- When the old gateway stops, and whether it will redirect: not known (ask the account administrator).
- The `datalake` service path suffix is untested, so `scripts/datalake-download.js` and the data lake tests stay on the old path.
