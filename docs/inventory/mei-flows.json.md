# Inventory: mei-flows.json

Source: `source/mei-flows.json` (Node-RED flows export, 117 nodes, 5 tabs). Outbound calls only. Generated with the help of `scripts/helper-nodered-outline.js` (secrets redacted). No `flows_cred.json` provided; no node carries a `credentials` block.
Disabled tabs: `B2 Line Bad Parts`, `B2 Line OEE`, `Test B2 Line Write Reject reasons`. Rows from disabled tabs are marked **(disabled)**.

## Outbound node summary
| Kind | Count |
|---|---|
| `http request` nodes | 10 (8 with a Bearer token from `tenant` context, 2 with `useMindsphereAuth=true` and a relative URL) |
| Function nodes using fetch/axios/http | 0 |
| Insights Hub SDK nodes | 12 (9 `read timeseries`, 3 `write timeseries`) |

## Auth
- There is **no token request in this file**. Eight `http request` nodes read `tenant.get("access_token_OEE")` (tenant-wide context) and send `Authorization: Bearer <token>`. The token must be produced by another flow in the same tenant (the `Technical user` pattern in Paul-Flow.json / farhan-flows.json, tab `OEE`).
- Two nodes (#1, #5) use `useMindsphereAuth=true` with a relative path (`/api/oee/v3/...`), so the Insights Hub runtime adds the auth.
- No secrets found in this file.

## Calls: `http request` nodes
Base `https://gateway.eu1.mindsphere.io` (hardcoded in each URL-building function).
| # | Tab / node / id | Method | URL | Auth | Trigger / notes |
|---|---|---|---|---|---|
| 1 | `Test B2 Line Write Reject reasons` **(disabled)** / `http request` / befb7f5f.a232f | GET | `/api/oee/v3/rejectReasonCollections/${collectionId}/rejectReasons` (relative, `API="/api/oee/v3"`) | Insights Hub built-in | Manual inject. Output to `Reject Reasons Lookup` |
| 2 | same tab **(disabled)** / `http request` / f3dfc25b.fd6c28 | GET | `/api/oee/v3/assets/<assetId>/manualInputs?from=<today 00:00 UTC>&to=<now>` | Bearer `tenant.access_token_OEE` | Manual inject. Reads manual inputs |
| 3 | same tab **(disabled)** / `http request` / 52b7debd.3f9c4 | POST | `/api/oee/v3/assets/<assetId>/manualInputs` | Bearer | Manual inject. Writes reject-reason manual inputs. Write call |
| 4 | same tab **(disabled)** / `http request` / ab0a43fa.167aa8 | POST | `/api/oee/v3/assets/<assetId>/manualInputs` | Bearer | Body built by `Create payload for manualInputs`. Write call |
| 5 | `B2 Line Filler Write Reject reasons` / `http request` / f60543cc.3d16a | GET | `/api/oee/v3/rejectReasonCollections/${collectionId}/rejectReasons` | Insights Hub built-in | Manual inject. Output to `Reject Reasons Lookup` |
| 6 | same tab / `http request` / d1c7add4.b1041 | GET | `/api/oee/v3/assets/<assetId>/manualInputs?from=<today 00:00 UTC>&to=<now>` | Bearer | Inject every 1800 s. Output to function that stores `virtualPeriods` and the active period in flow context |
| 7 | same tab / `http request` / fa1c001a.07e65 | POST | `/api/oee/v3/assets/<assetId>/manualInputs` | Bearer | Manual inject, debug output. Write call |
| 8 | same tab / `http request` / 5212f449.47f79c | POST | `/api/oee/v3/assets/<assetId>/manualInputs` | Bearer | Manual inject; payload from `Create payload for manualInputs` (3 variants). Skips periods already sent (flow vars `manualInputSent_<period>`). Write call |
| 9 | `B2 Line Bad Parts` **(disabled)** / `http request` / 8a259b24.7ebfc8 (function `manual inputs request`) | GET | `/api/oee/v3/assets/<assetId>/manualInputs?from=<today 00:00 UTC>&to=<now>` | Bearer | Inject every 3600 s. Builds the current virtual period |
| 10 | same tab **(disabled)** / `http request` / 92967253.1294c | POST | `/api/oee/v3/expressions/evaluateKPIs` (body `assetId`, `from`, `to`) | Bearer | Per period. Result feeds a Bad Parts calculation and a `write timeseries` node |

(Full URL prefix is `https://gateway.eu1.mindsphere.io` for #2-#4, #6-#10; asset IDs are hardcoded in the functions.)

## Calls: Insights Hub SDK nodes (no URL in the node)
| # | Tab / node / id | Type | What | Direction | Trigger |
|---|---|---|---|---|---|
| 11 | `Test B2 Line Write Reject reasons` **(disabled)** / `read timeseries` / 7567b8d4.ae19f8 | read timeseries | Filler aspect `B2_Line_Filler_OEE_Automatic`, variables `Filler_Reject_*` | Read | every 1800 s |
| 12-15 | `B2 Line OEE` **(disabled)** / `read timeseries` (e6863385.ef08d8, 5b70fec6.789d98, 538857d.b453da8, eb0e0b8d.30a4f8) | read timeseries | Cartoner, Filler, Labeller `BadParts`; Antares `Antares_Track_And_Trace/Lot` | Read | every 300 s |
| 16 | `B2 Line Filler Write Reject reasons` / `read timeseries` / de4dd1d5.a77438 | read timeseries | Filler `B2_Line_Filler_OEE_Automatic` reject variables | Read | every 1800 s |
| 17-19 | `B2 Line Bad Parts V2` / `read timeseries` (1f8e1c91.6578d3, 32bc9310.1e9ec4, b6188a5d.1d552) | read timeseries | `02 Filler`, `03 Labeller`, `04 Cartoner` `OEE_Prerequisites/BadParts` (Cartoner uses `B2_Line_Cartoner_OEE_Automatic/BadParts`) | Read | every 300 s |
| 20 | `B2 Line OEE` **(disabled)** / `write timeseries` / c2529317.dc59a | write timeseries | `B2 Line` `OEE_Prerequisites/BadParts` | **Write** | upstream |
| 21 | `B2 Line Bad Parts` **(disabled)** / `write timeseries` / 3c46bfca.5db72 | write timeseries | same target | **Write** | after #10 |
| 22 | `B2 Line Bad Parts V2` / `write timeseries` / 5b24ec0d.c679ac | write timeseries | `B2 Line` `OEE_Prerequisites/BadParts` (sum of Filler, Labeller, Cartoner rejects) | **Write** | after the three reads (#17-#19), every 300 s. **Active** |

## Findings
- No credentials in this file. It depends on `tenant.access_token_OEE` being set by a token flow elsewhere (not in this file); if run alone, calls #2-#4, #6-#10 fail with 401.
- Only the `B2 Line Filler Write Reject reasons` and `B2 Line Bad Parts V2` tabs are active. Active write calls: #7, #8 (POST manualInputs), #22 (write timeseries).
- Hardcoded asset IDs in every URL-building function (not secrets).
