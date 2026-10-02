# Quickstart: from nothing to OEE numbers in Node-RED

| At a glance | |
|---|---|
| **Use it to** | Copy a working Node-RED setup: login, one reusable "call API" function, and four example calls (assets, hierarchy, raw data, KPIs) |
| **Status** | The calls behind every example are **Tested** (see the linked files). The Node-RED function code on this page was **not run inside Node-RED**; it follows the tested requests exactly and mirrors the source flows |
| **Needs** | Two environment variables on the Node-RED runtime: `RECKITT_API_TECHUSER_CLIENT_ID`, `RECKITT_API_TECHUSER_CLIENT_SECRET` (never type them into a node) |
| **Hosts** | Login `https://reckitt.piam.eu1.mindsphere.io`, API `https://gateway.eu1.mindsphere.io` |

## The flow in one picture
```
[inject: on start + every 25 min] -> (A) token request -> [http request] -> (B) save token
                                                                                  
[your trigger] -> (C) call API -> [http request] -> (D) check response -> your logic
```
Both `http request` nodes use the same settings: **Method = "use `msg.method`"** (set by message), **Return = "a parsed JSON object"**. Leave the URL field empty, the function nodes set `msg.url` and `msg.headers`.

> Insights Hub Node-RED also offers `tenant.set` / `tenant.get` (tenant-wide context) instead of `flow.set` / `flow.get`. The source flows use it so several tabs share one token. Replace `flow` by `tenant` below if you want that.

## A. Token request (function node)
```js
const clientId = env.get("RECKITT_API_TECHUSER_CLIENT_ID");
const secret = env.get("RECKITT_API_TECHUSER_CLIENT_SECRET");
msg.method = "POST";
msg.url = "https://reckitt.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials";
msg.headers = {
  "Authorization": "Basic " + Buffer.from(`${clientId}:${secret}`).toString("base64"),
  "Accept": "application/json"
};
msg.payload = null;
return msg;
```

## B. Save token (function node)
```js
if (!msg.payload || !msg.payload.access_token) {
  node.error("Token request failed, HTTP " + msg.statusCode, msg);
  return null;
}
flow.set("access_token", msg.payload.access_token);
flow.set("access_token_expires_at", Date.now() + (msg.payload.expires_in - 120) * 1000);  // expires_in is about 1799 s
return null;
```
Details and the response fields are in [auth.md](auth.md).

## C. Call API (function node, reusable for every endpoint in these docs)
Set `msg.req` before this node. It builds the URL, query string, headers and body.
```js
const r = msg.req;                       // { method?, path, query?, body?, hal? }
const token = flow.get("access_token");
if (!token || Date.now() > (flow.get("access_token_expires_at") || 0)) {
  node.error("No valid token yet: run the token flow first", msg);
  return null;
}
const q = Object.entries(r.query || {})
  .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
msg.method = r.method || "GET";
msg.url = "https://gateway.eu1.mindsphere.io" + r.path + (q ? "?" + q : "");
msg.headers = {
  "Authorization": "Bearer " + token,
  // Asset Management fails with HTTP 500 for application/json: set r.hal = true for /api/assetmanagement/...
  "Accept": r.hal ? "application/hal+json" : "application/json"
};
if (msg.method === "POST") {
  msg.headers["Content-Type"] = "application/json";
  msg.payload = r.body;
} else {
  msg.payload = null;
}
return msg;
```

## D. Check response (function node)
```js
if (msg.statusCode === 401) { flow.set("access_token", null); }   // token expired: next run gets a new one
if (msg.statusCode < 200 || msg.statusCode >= 300) {
  node.error("HTTP " + msg.statusCode + " " + JSON.stringify(msg.payload).slice(0, 300), msg);
  return null;
}
return msg;
```
Error bodies differ per service (OEE: `{"errors":[{code,logref,message}]}`; time series and Asset Management differ), see [endpoints.md](endpoints.md).

## Four example calls (set `msg.req`, then wire into node C)

**1. List the OEE assets and pick an `assetId`** ([assets.md](assets.md))
```js
msg.req = { path: "/api/oee/v3/assets" };
return msg;
```
Result: `msg.payload` is an array of `{ assetId, name, description, isManual, isConfigured, reasonTreeId }` (44 in this tenant).

**2. Read the hierarchy (Asset Management, page 0)** ([assets.md](assets.md))
```js
msg.req = { path: "/api/assetmanagement/v3/assets", query: { size: 200, page: 0 }, hal: true };
return msg;
```
Result: `msg.payload._embedded.assets[]` with `assetId`, `name`, `parentId`, `typeId`; `msg.payload.page.totalPages` tells if you need page 1. Tree-building code is in [assets.md](assets.md).

**3. Latest raw value of a machine** ([timeseries.md](timeseries.md))
```js
msg.req = { path: "/api/iottimeseries/v3/timeseries/" + msg.assetId + "/OEE_Prerequisites", query: { limit: 1 } };
return msg;
```
Result: `msg.payload` is an array with one record (`GoodParts`, `BadParts`, `_time`, ...). For a time range add `from` and `to` (ISO, UTC), at most 2000 records and 90 days.

**4. Calculate OEE and all other KPIs for the last 24 hours** ([kpis.md](kpis.md))
```js
const to = new Date();
const from = new Date(to.getTime() - 24 * 3600 * 1000);
msg.req = {
  method: "POST",
  path: "/api/oee/v3/expressions/evaluateKPIs",
  body: {
    assetId: msg.assetId,
    scope: {
      from: from.toISOString(),
      to: to.toISOString(),
      filter: [{ key: "PRODUCT", value: [] }, { key: "ORDER", value: [] }, { key: "SHIFT", value: [] }],
      recursive: false,
      groupedByDateTime: false
    }
  }
};
return msg;
```
Then, after node D, pick the values you need:
```js
const kpi = {};
for (const r of msg.payload.results) kpi[r.name] = r.value;      // 30 KPIs by name
msg.payload = { oee: kpi["OEE"], availability: kpi["Availability"], performance: kpi["Performance"], quality: kpi["Quality"] };
return msg;
```
Ratios are fractions (0.42 = 42 %), times are milliseconds. `evaluateKPIs` is a POST but only calculates (tested, nothing stored). It works for OEE assets only, and the numbers depend on the asset's configuration.

## What to read next
| You want to | Open |
|---|---|
| Know every tested call at a glance | [endpoints.md](endpoints.md) |
| Understand the asset tree, find lines and machines | [assets.md](assets.md) |
| Read machine signals | [timeseries.md](timeseries.md) |
| Read what operators entered (GT4, Mira) | [manual-inputs.md](manual-inputs.md) |
| Get KPIs, downtime, rejects, and see every formula | [kpis.md](kpis.md) |
| Look up calendars, products, reasons, setup | [config-and-master-data.md](config-and-master-data.md) |

## Running the same calls outside Node-RED
`scripts/lib-ih.js` has `getToken()` and `apiGet()` (Node 18+ native `fetch`, reads `.env`). The `scripts/test-*.js` files show each call with real output shapes. Run them with `node scripts/<file>.js`.
