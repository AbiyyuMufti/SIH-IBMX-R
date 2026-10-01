# Service status checks

Behaviour: confirm a service is up and your token works, before doing anything else.
Service: OEE app v3. Base URL: `https://gateway.eu1.mindsphere.io/api/oee/v3`. Auth: Bearer token, see [auth.md](auth.md).
Legend: **Tested** = called and verified on 2026-10-02.

## GET /health (Tested)
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

## GET /version (Tested)
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
