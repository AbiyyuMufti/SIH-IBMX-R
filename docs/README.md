# Insights Hub API notes (Reckitt tenant)

Working docs for calling the Siemens Insights Hub APIs found in the Postman collections, Node-RED flows and Python script. Only things we have actually called are marked **Tested**; everything else is marked **From source only**.

## Index
| File | What it covers | State |
|---|---|---|
| [auth.md](auth.md) | How to get a token and use it. Plain-language walkthrough | Tested |
| [oee-api.md](oee-api.md) | OEE app v3 endpoints (`/health`, `/version`, `/assets` tested; others listed as from source only) | 3 endpoints tested |
| [api-summary.md](api-summary.md) | Everything that exists across all sources, and what we can test | Placeholder, updated as we go |
| [inventory.md](inventory.md) | Per-file list of every outbound call found in the sources | Complete (Phase A) |
| [auth-checklist.md](auth-checklist.md) | Where each credential comes from in the sources (never values) | Complete (Phase A) |

## Worked example: what the first test did
The goal was to prove that our credentials work and that the OEE service answers. Two requests, in this order:

**1. Ask for a token (POST, once).**
- We sent our client ID and secret to the login service of the Reckitt tenant: `https://reckitt.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials`.
- The ID and secret travel in an `Authorization: Basic ...` header (the two joined as `id:secret` and base64-encoded). They come from `.env`, never from code.
- The service answered **HTTP 200** with a JSON object containing a long text called an access token, how long it is valid (`expires_in` = 1799 seconds, about 30 minutes) and its type (`bearer`).
- Nothing was changed on the platform. This is just logging in.

**2. Use the token to call the API (GET, once).**
- We sent `GET https://gateway.eu1.mindsphere.io/api/oee/v3/health` with the header `Authorization: Bearer <the token>`.
- The service answered **HTTP 200** with an **empty body**. For a health check that is the whole answer: "the OEE service is running and accepted your token".

**What the result tells us:** the credentials are valid, the token is accepted by the OEE API, and the gateway and tenant are reachable. It does *not* yet tell us that the user can read data. Reading real data is the next test (`GET /assets`).

Where it lives in this repo: the script is `scripts/test-auth-health.js` (uses `scripts/lib-ih.js`), the saved response is `samples/oee_health.json` (gitignored).

## Second test: `/version` and `/assets`
- `GET /version` returned `{"version": "1.24.39"}`. Asking again **without** a token returned HTTP 403, so assume OEE calls need the token (the Postman collection marks this one as no auth, which is wrong here).
- `GET /assets` returned 44 assets in a plain list (name, description, a few flags and a reason-tree ID). There is no paging information, so the whole list arrived at once. The `assetId` values are what the later tests use.
- Script: `scripts/test-version-assets.js`. Redacted samples: `samples/oee_version.json`, `samples/oee_assets.json`.

## How we work from here
For every API call we test, we do two things before the next one: save a redacted sample in `samples/`, and write or update the doc for that endpoint here. So reading these docs should always explain the latest call.
