# Inventory index

One inventory per source file. Each row in a per-file inventory is one outbound call (name/location, method, URL, how auth is built). No secret values appear in any of them.

| Source file | Type | Inventory | Calls | Breakdown |
|---|---|---|---|---|
| `CADIT Insights Hub Services Testing.postman_collection.json` | Postman | [inventory](inventory/CADIT%20Insights%20Hub%20Services%20Testing.postman_collection.json.md) | 16 | 11 GET, 3 POST, 2 PUT. Asset Management, IoT Time Series, Event Management, token |
| `Reckitt OEE.postman_collection.json` | Postman | [inventory](inventory/Reckitt%20OEE.postman_collection.json.md) | 203 | 72 GET, 60 POST, 43 PUT, 28 DELETE. OEE v3 API (+4 Asset Management, 5 token requests) |
| `Paul-Flow.json` | Node-RED | [inventory](inventory/Paul-Flow.json.md) | 31 | 29 `http request`, 2 `write object`. OEE v3, IoT Time Series, Asset Management, token |
| `farhan-flows.json` | Node-RED | [inventory](inventory/farhan-flows.json.md) | 69 | 34 `http request`, 35 Insights Hub SDK nodes (+1 function flagged by the scanner that makes no call of its own) |
| `mei-flows.json` | Node-RED | [inventory](inventory/mei-flows.json.md) | 22 | 10 `http request`, 12 SDK nodes (`read timeseries`, `write timeseries`) |
| `AssetFilterFinal.py` | Python | [inventory](inventory/AssetFilterFinal.py.md) | 4 | 1 POST (token), 3 GET (assets, asset types, time series) |
| **Total** | | | **345** | |

## Notes on counting
- Node-RED rows count every outbound node, including disabled tabs (marked in each file). Insights Hub SDK nodes (`read timeseries`, `read-oee`, `write timeseries`, `create event`, ...) are counted because they call platform APIs, but they have no URL in the node.
- Several Node-RED `http request` nodes are copies of each other (the same call repeated across tabs), so the number of distinct endpoints is much smaller than the call count.
- Postman `Reckitt OEE` repeats many requests with different bodies (for example `orderSource` variants), so distinct method + path pairs are fewer than 203.

## API areas seen across the files
| Area | Base path | Seen in |
|---|---|---|
| IAM token (client credentials) | `https://<tenant>.piam.eu1.mindsphere.io/oauth/token` | Postman (both), Paul-Flow, farhan-flows |
| Technical Token Manager | `/api/technicaltokenmanager/v3/oauth/token` | AssetFilterFinal.py |
| OEE app v3 | `/api/oee/v3/...` | OEE Postman, Paul-Flow, farhan-flows, mei-flows |
| Asset Management v3 | `/api/assetmanagement/v3/...` | Testing Postman, OEE Postman (MISC folder), Paul-Flow, farhan-flows, Python |
| IoT Time Series v3 | `/api/iottimeseries/v3/timeseries/...` | Testing Postman, Paul-Flow, farhan-flows, Python |
| Event Management v3 | `/api/eventmanagement/v3/...` | Testing Postman, farhan-flows (`create event` SDK node) |
| Object Storage / Integrated Data Lake | via SDK nodes (`write object`, `list objects`, `read object`) | Paul-Flow, farhan-flows |

Gateway host in all files: `https://gateway.eu1.mindsphere.io`.

See also [auth-checklist.md](auth-checklist.md).
