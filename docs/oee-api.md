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
- In the Postman collection `health` uses Bearer auth, while `version` is set to no auth. Not verified which of them really needs the token.

## From source only (not tested)
Listed so you know what exists. Details and the full list of 68 GET paths are in [api-summary.md](api-summary.md).
| Method and path | Purpose |
|---|---|
| `GET /version` | Service version (Postman marks it as no auth) |
| `GET /assets` | List assets (paginated). Source of asset IDs for all other calls |
| `GET /assets/{assetId}`, `/config`, `/manualInputs`, `/productionTarget`, `/downtimeReasons` and more | Per-asset data and setup |
| `GET /reasontrees`, `/calendars`, `/productCollections`, `/expressions`, `/operands`, ... | Master data |
| `POST /expressions/evaluateKPIs` and related | KPI calculation (read-style POST) |

Write and delete calls (POST, PUT, DELETE for comments, sources, assignments, settings, and so on) exist but are out of scope unless you approve them.
