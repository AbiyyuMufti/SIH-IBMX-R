# OEE API v3

Base URL: `https://gateway.eu1.mindsphere.io/api/oee/v3`
Auth: Bearer token, see [auth.md](auth.md).
Legend: **Tested** = called and verified. **From source only** = seen in Postman or flows, not called yet. Full list of known paths: [api-summary.md](api-summary.md).

## Tested endpoints

### GET /health
| Item | Value |
|---|---|
| Purpose | Check that the OEE service is up and that your token is accepted |
| Method | `GET` |
| URL | `https://gateway.eu1.mindsphere.io/api/oee/v3/health` |
| Params | none |
| Headers | `Authorization: Bearer <token>`, `Accept: application/json` |
| Tested | 2026-10-02, API technical user, HTTP 200 in about 1.4 s |

**Example request (Node-RED function node, then an `http request` node set to "use `msg.method`", return "a UTF-8 string")**
```js
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/health";
msg.headers = {
  "Authorization": "Bearer " + flow.get("access_token_OEE"),
  "Accept": "application/json"
};
msg.payload = null;
return msg;
```

**Example response**
- Status: `200`
- Headers: none of `content-type`, `etag`, `x-request-id` were returned (only these were checked)
- Body: **empty**

**Gotchas**
- Empty body is normal. Treat HTTP 200 as "healthy". If you set the `http request` node to return a parsed JSON object, the payload will just be an empty string; "a UTF-8 string" is the simplest setting for this call (not verified in Node-RED).
- A 200 here only proves the token and the service work. It does not prove the technical user is allowed to read OEE data. Test `GET /assets` for that.
- Not tested without a token. `/version` was (see below) and it needs one, so `/health` very likely does too.

### GET /version
| Item | Value |
|---|---|
| Purpose | Return the version of the OEE service |
| Method | `GET` |
| URL | `https://gateway.eu1.mindsphere.io/api/oee/v3/version` |
| Params | none |
| Headers | `Authorization: Bearer <token>`, `Accept: application/json` |
| Tested | 2026-10-02, HTTP 200 in about 1.3 s |

**Example request:** same function node as `/health`, with `msg.url` ending in `/version`.

**Example response** (`content-type: application/json;charset=utf-8`)
```json
{ "version": "1.24.39" }
```
| Field | Type | Meaning |
|---|---|---|
| `version` | string | Service version (the value seen on 2026-10-02) |

**Gotchas**
- **Needs a token.** Called without the `Authorization` header it returns **HTTP 403**. The Postman collection marks this request as "no auth"; that is wrong for this tenant.
- Unlike `/health`, the answer is JSON, so the `http request` node can return a parsed JSON object.

### GET /assets
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

## From source only (not tested)
Listed so you know what exists. Details and the full list of 68 GET paths are in [api-summary.md](api-summary.md).
| Method and path | Purpose |
|---|---|
| `GET /assets/{assetId}`, `/config`, `/manualInputs`, `/productionTarget`, `/downtimeReasons` and more | Per-asset data and setup |
| `GET /reasontrees`, `/calendars`, `/productCollections`, `/expressions`, `/operands`, ... | Master data |
| `POST /expressions/evaluateKPIs` and related | KPI calculation (read-style POST) |

Write and delete calls (POST, PUT, DELETE for comments, sources, assignments, settings, and so on) exist but are out of scope unless you approve them.
