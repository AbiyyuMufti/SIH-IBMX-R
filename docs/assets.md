# Finding assets and the hierarchy

Behaviour: get the asset IDs that every other call needs, and understand how assets are organised.
Auth: Bearer token for all calls, see [auth.md](auth.md). Base URL: `https://gateway.eu1.mindsphere.io`.
Legend: **Tested** = called and verified. **From source only** = seen in Postman or flows, not called yet.

Two services list assets, with different shapes:
| Service | Path | Returns | State |
|---|---|---|---|
| OEE app | `/api/oee/v3/assets` | Only the assets set up for OEE, as a plain array | Tested |
| Asset Management | `/api/assetmanagement/v3/assets` | All assets in the tenant, with type and parent, paged (`_embedded.assets` + `page`) | From source only |

## OEE: GET /assets (Tested)
| Item | Value |
|---|---|
| Purpose | List the assets known to the OEE app. This is where you get the `assetId` needed by almost every other OEE call |
| Method | `GET` |
| URL | `https://gateway.eu1.mindsphere.io/api/oee/v3/assets` |
| Params | none used in this test. The source flows also pass `filter`, `size`, `page` and `sort` (not tested yet) |
| Headers | `Authorization: Bearer <token>`, `Accept: application/json` |
| Tested | 2026-10-02, HTTP 200 in about 0.35 s, 44 assets returned |

**Example request (Node-RED function node, then an `http request` node set to "use `msg.method`", return "a parsed JSON object")**
```js
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/assets";
msg.headers = {
  "Authorization": "Bearer " + flow.get("access_token_OEE"),
  "Accept": "application/json"
};
msg.payload = null;
return msg;
```

**Example response** (IDs redacted; `msg.payload` is the array itself)
```json
[
  {
    "assetId": "<32-char hex id>",
    "name": "Corniani-3",
    "description": "<free text, may be empty>",
    "isManual": true,
    "isConfigured": true,
    "reasonTreeId": "<32-char hex id>"
  }
]
```
| Field | Type | Meaning |
|---|---|---|
| `assetId` | string (32 hex chars) | Asset ID. Use it in `/assets/{assetId}/...` and in KPI requests |
| `name` | string | Asset name. All 44 names were unique in this tenant |
| `description` | string | Free text. Empty for 14 of 44 assets |
| `isManual` | boolean | `true` for 39 of 44. Presumably "uses manual OEE input"; meaning not confirmed |
| `isConfigured` | boolean | `true` for 38 of 44. Presumably "OEE setup is complete"; meaning not confirmed |
| `reasonTreeId` | string | ID of the reason tree for the asset. Missing on 6 of 44 assets, and the others share only a few trees (see `/reasontrees`, not tested) |

**Gotchas**
- The response is a **plain JSON array**, not an object with `_embedded` and `page`. There is **no pagination information** in the body or in the headers that were checked (`content-type`, `etag`). All 44 assets came back in one response. Whether `size` and `page` change this is not tested.
- This is the OEE app's own asset list. The Asset Management API (`/api/assetmanagement/v3/assets`, used by the Python script) has a different shape (`_embedded.assets` plus `page`). Do not mix the two.
- The asset names suggest a hierarchy (lines such as `Linea 1`, machines such as `02 Filler`), but this response does not say which asset is the parent of which.
