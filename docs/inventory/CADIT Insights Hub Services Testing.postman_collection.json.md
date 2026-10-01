# Inventory: CADIT Insights Hub Services Testing.postman_collection.json

Source: `source/CADIT Insights Hub Services Testing.postman_collection.json` (Postman v2.1, 16 requests, flat: no folders)

## Collection-level settings
| Item | Value |
|---|---|
| Collection auth | none (each request sets its own) |
| Collection pre-request / test scripts | present but empty |
| Variables | `HOST`, `API`, `TOKEN`, `TENANT`, `AssetId`, `Aspect`, `tenantId` (all blank); `eventId` (set, an ID, not a secret) |
| Environment file | not provided |

## Auth flow
- Request #1 gets a token with HTTP Basic auth (username + password typed directly into the request, not variables). See [auth-checklist.md](../auth-checklist.md).
- Request #1 test script reads `access_token` from the response and stores it in the environment variable `TOKEN`.
- All other requests use Bearer auth with `{{TOKEN}}`.

## Calls
Counts: 16 total (11 GET, 3 POST, 2 PUT). Only GETs are safe to test by default.

| # | Name | Method | URL | Auth | Notes |
|---|---|---|---|---|---|
| 1 | Get Token | POST | `https://caditiot.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials` | Basic (inline user/password) | Test script saves `access_token` to `TOKEN`. Hardcoded host, not `{{HOST}}` |
| 2 | Retrieve Asset | GET | `{{HOST}}/api/assetmanagement/v3/assets` | Bearer `{{TOKEN}}` | |
| 3 | Create Asset Type | PUT | `{{HOST}}/api/assetmanagement/v3/assettypes/{{tenantId}}.Large_Mixing_Plant` | Bearer `{{TOKEN}}` | Raw JSON body (name, parentTypeId `core.basicdevice`, aspects) |
| 4 | Create AspectType | PUT | `{{HOST}}/api/assetmanagement/v3/aspecttypes/caditiot.testaspect` | Bearer `{{TOKEN}}` | Raw JSON body (variables list) |
| 5 | Retrieve AspectType | GET | `{{HOST}}/api/assetmanagement/v3/aspecttypes` | Bearer `{{TOKEN}}` | Has a raw body attached to a GET (probably copy of #4, ignored) |
| 6 | Retrieve Asset by Asset ID | GET | `{{HOST}}/api/assetmanagement/v3/assets/{{AssetId}}` | Bearer `{{TOKEN}}` | |
| 7 | Retrieve Aspect | GET | `{{HOST}}/api/assetmanagement/v3/assets/{{AssetId}}/aspects` | Bearer `{{TOKEN}}` | |
| 8 | Retrieve TimeSeries Data | GET | `{{HOST}}/api/iottimeseries/v3/timeseries/{{AssetId}}/{{Aspect}}?from=2026-01-08T16:41:47.700Z&to=2026-01-08T17:41:47.700Z` | Bearer `{{TOKEN}}` | `from`/`to` hardcoded |
| 9 | Retrieve Events | GET | `{{HOST}}/api/eventmanagement/v3/events` | Bearer `{{TOKEN}}` | |
| 10 | Retrieve Cases | GET | `{{HOST}}/api/eventmanagement/v3/events` | Bearer `{{TOKEN}}` | Same URL as #9; name says "Cases", probably a placeholder |
| 11 | Retrieve Event Types | GET | `{{HOST}}/api/eventmanagement/v3/events` | Bearer `{{TOKEN}}` | Same URL as #9; name says "Event Types", probably a placeholder |
| 12 | Retrieve Event by Event ID | GET | `{{HOST}}/api/eventmanagement/v3/events/{{eventId}}` | Bearer `{{TOKEN}}` | |
| 13 | Delete Event | POST | `{{HOST}}/api/eventmanagement/v3/deleteEventsJobs` | Bearer `{{TOKEN}}` | Body: filter by timestamp range + `typeId`. Destructive, do not call without approval |
| 14 | Create Event | POST | `{{HOST}}/api/eventmanagement/v3/createEventsJobs` | Bearer `{{TOKEN}}` | Body: `events[]` with `typeId`, `entityId`, `description`, `timestamp` |
| 15 | Get Delete Job Status | GET | `{{HOST}}/api/eventmanagement/v3/deleteEventsJobs/<job-id>` | Bearer `{{TOKEN}}` | Job ID hardcoded in URL |
| 16 | Get Create Job Status | GET | `{{HOST}}/api/eventmanagement/v3/createEventsJobs/<job-id>` | Bearer `{{TOKEN}}` | Job ID hardcoded in URL |

## Findings
- Credentials are hardcoded in request #1 (Basic auth username and password). Location: item "Get Token" > `request.auth.basic`. Not copied anywhere.
- `HOST` is blank. Presumably the tenant gateway, probably `https://<tenant>.<region>.mindsphere.io`-style, but not stated in this file. Must be confirmed.
- Variables `API`, `TENANT` are declared but not used by any request.
- Pre-request scripts: none with content.
- APIs referenced: Asset Management v3, IoT Time Series v3, Event Management v3, plus the IAM token endpoint.
