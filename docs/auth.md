# Authentication

State: **Tested** on 2026-10-02 with the Reckitt API technical user.

## Overview
All APIs use a two-step pattern:
1. Exchange a client ID and secret for a short-lived **access token** (OAuth2 client-credentials).
2. Send that token on every API call as `Authorization: Bearer <token>`.

The client ID and secret are the "technical user". In this project they are in `.env` as `RECKITT_API_TECHUSER_CLIENT_ID` and `RECKITT_API_TECHUSER_CLIENT_SECRET`. In Node-RED use `env.get(...)` or a credentials store, never literal text in a function node (several source flows do hardcode them; do not copy that).

## Get a token
| Item | Value |
|---|---|
| Purpose | Log in with the technical user and obtain an access token |
| Method | `POST` |
| URL | `https://reckitt.piam.eu1.mindsphere.io/oauth/token` (the host starts with the tenant name) |
| Query | `grant_type=client_credentials` |
| Body | none |

**Headers**
| Header | Value |
|---|---|
| `Authorization` | `Basic ` + base64(`clientId:clientSecret`) (secret not shown here) |
| `Accept` | `application/json` |

**Response (HTTP 200).** Fields confirmed by the test:
| Field | Type | Meaning |
|---|---|---|
| `access_token` | string | The token (a JWT, about 3.3 thousand characters). Never log it |
| `token_type` | string | `bearer` |
| `expires_in` | number | Seconds until it expires. Observed: `1799` (about 30 minutes) |
| `scope` | string | Present in the response. Content not recorded; may list granted scopes/roles |
| `jti` | string | Present in the response. Token ID, ignore |

These five field names are all the response contains (confirmed on the second test run).

**Example (Node-RED function node, pasteable).** Wire it to an `http request` node set to "use `msg.method`" and "return a parsed JSON object".
```js
const clientId = env.get("RECKITT_API_TECHUSER_CLIENT_ID");
const secret = env.get("RECKITT_API_TECHUSER_CLIENT_SECRET");
msg.method = "POST";
msg.url = "https://reckitt.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials";
msg.headers = {
  "Authorization": "Basic " + Buffer.from(`${clientId}:${secret}`).toString("base64"),
  "Accept": "application/json"
};
return msg;
```
Next function node after the `http request` (stores the token and when it expires):
```js
flow.set("access_token_OEE", msg.payload.access_token);
flow.set("access_token_expires_at", Date.now() + (msg.payload.expires_in - 120) * 1000);
return null;
```
(Insights Hub function nodes can use `tenant.set(...)` instead of `flow.set(...)`, as the source flows do.)

**Gotchas**
- The token lives about 30 minutes. The source flows refresh it every 19 minutes (1140 s), which is safe.
- Wrong client ID or secret gives an HTTP error from the login service (error body not yet captured; not tested on purpose).
- The host depends on the tenant: `reckitt.piam...` here. The sources also contain `greggs` and `caditiot` hosts; those are other tenants.
- This is a POST but it only logs in; it changes nothing on the platform.

## Use the token
Send it on every call:
| Header | Value |
|---|---|
| `Authorization` | `Bearer <access_token>` |
| `Accept` | `application/json` |

The API host for all areas is `https://gateway.eu1.mindsphere.io`, followed by the API path, for example `/api/oee/v3/health`. See [service-status.md](service-status.md) and [assets.md](assets.md).

## Two other auth styles found in the sources (not tested, not used for Reckitt)
- **App credentials** (`AssetFilterFinal.py`): `POST /api/technicaltokenmanager/v3/oauth/token` with header `X-SPACE-AUTH-KEY`. Belongs to the `caditiot` tenant app.
- **Built-in Insights Hub auth** in Node-RED (`http request` nodes with `useMindsphereAuth`, and the SDK nodes): works only inside the Insights Hub runtime.

See [auth-checklist.md](auth-checklist.md) for where each credential appears in the source files.
