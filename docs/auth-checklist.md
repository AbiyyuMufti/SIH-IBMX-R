# Auth and secrets checklist

Every distinct auth mechanism found in `source/`, where it comes from (file and location only, never values), and what is missing. `.env` placeholder names are in the last column; they are empty and you fill them locally.

Status legend: **inline** = secret typed directly in the source (location listed); **var** = only a variable name in the source, value is elsewhere; **ctx** = comes from Node-RED context at runtime; **none** = no credentials needed.

## 1. Platform IAM token: client credentials with HTTP Basic
`POST https://<tenant>.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials`, header `Authorization: Basic base64(clientId:clientSecret)`. Response `access_token` is then sent as `Authorization: Bearer <token>`. Three tenants appear: `caditiot`, `reckitt`, `greggs`.

| Where | Location | Status | What is needed | `.env` names |
|---|---|---|---|---|
| Testing Postman | Item `Get Token` (#1), `request.auth.basic` (username + password) | **inline** | Client ID and secret for the `caditiot` tenant | `CADIT_CLIENT_ID`, `CADIT_CLIENT_SECRET` |
| Reckitt OEE Postman | Item `Get Token` (#203, root), `request.auth.basic` | **inline** | Client ID and secret for the `reckitt` tenant | `RECKITT_POSTMAN_CLIENT_ID`, `RECKITT_POSTMAN_CLIENT_SECRET` |
| Reckitt OEE Postman | Item `techuser / create TU OEEHUB Admin User` (#200), `request.auth.basic`; token host hardcoded for tenant `greggs` | **inline** | Admin technical user credentials (`greggs`) | `TU_OEEHBUB_ADMIN_USER_USERNAME`, `TU_OEEHBUB_ADMIN_USER_PASSWORD` |
| Reckitt OEE Postman | `techuser / create TU DataIngest` (#199) | var | Values of `TU_DATA_INGEST_USERNAME`, `TU_DATA_INGEST_PASSWORD`; also `PIAM` host (blank in file) and `tenant`/`iam-action=client_credentials.tenant-impersonation` body | `TU_DATA_INGEST_USERNAME`, `TU_DATA_INGEST_PASSWORD`, `PIAM_URL` |
| Reckitt OEE Postman | `techuser / create TU OEEHUB Operator User` (#201) | var | `TU_OEEHBUB_OPERATOR_USER_USERNAME`, `..._PASSWORD` | same names |
| Reckitt OEE Postman | `techuser / create TU OEEHUB  User User` (#202) | var | `TU_OEEHBUB_USER_USER_USERNAME`, `..._PASSWORD` | same names |
| Paul-Flow.json | Tab `OEE`, function `Technical user` (id c6b2a6b3.721a8): variables `tenantName`, `clientId`, `secret` | **inline** | Client ID and secret (tenant `reckitt`) | `RECKITT_OEE_CLIENT_ID`, `RECKITT_OEE_CLIENT_SECRET` |
| farhan-flows.json | Tab `OEE`, function `Technical user` (id 53d5e4a.b48a21c): `tenantName`, `clientId`, `secret` | **inline** | Same pattern as Paul-Flow (check if it is the same client) | same names |
| farhan-flows.json | Functions `build token request`: tab `B2 line OEE` (fb5853b0.867458), tab `GT4 line OEE` (e7b6bcbc.9458c, f66152e5.64853, disabled), tab `GT4 line losses` (3f84e0f5.b85a58, disabled), tab `Delete Timeseries` (45ec1f4d.1eaef8). Literal fallback for `CLIENT_ID` and `CLIENT_SECRET` after `flow.get(...)` | **inline** (fallback) + **var** (`GT4_CLIENT_ID`, `GT4_CLIENT_SECRET`, `clientID`, `tokenSecret`) | Client ID and secret for the `reckitt-supervisor` style client (tenant `reckitt`) | `RECKITT_SUPERVISOR_CLIENT_ID`, `RECKITT_SUPERVISOR_CLIENT_SECRET` |
| farhan-flows.json | Tab `Delete Timeseries`, functions `write config into flow context` and `2 · build token request`: `IH_TOKEN_URL`, `IH_CLIENT_ID`, `IH_CLIENT_SECRET` fed from flow vars `tokenUrl`, `clientID`, `tokenSecret` | var | Where those flow vars are first set is not in the file | `IH_TOKEN_URL`, `IH_CLIENT_ID`, `IH_CLIENT_SECRET` |

## 2. Technical Token Manager: app credentials
`POST https://gateway.eu1.mindsphere.io/api/technicaltokenmanager/v3/oauth/token`, header `X-SPACE-AUTH-KEY: Bearer base64("<hostTenant>-<appName>-<appVersion>:<appCredential>")`, JSON body with `appName`, `appVersion`, `hostTenant`, `userTenant`.

| Where | Location | Status | What is needed | `.env` names |
|---|---|---|---|---|
| AssetFilterFinal.py | Line 25, variable `decode` (the part after the colon is the app credential) | **inline** | App credential for app `simapiapp` v1, tenant `caditiot` | `SIMAPI_APP_CREDENTIAL`; non-secret identifiers `SIMAPI_APP_NAME`, `SIMAPI_APP_VERSION`, `SIMAPI_HOST_TENANT`, `SIMAPI_USER_TENANT` |

## 3. Bearer token produced elsewhere (Node-RED context)
| Where | Location | Status | What is needed |
|---|---|---|---|
| Paul-Flow, farhan-flows, mei-flows | Functions that set `msg.headers.Authorization = "Bearer " + tenant.get("access_token_OEE")` | **ctx** | Nothing extra for us: we do the token call from mechanism 1 ourselves. `tenant` is the Insights Hub tenant-wide context, filled by tab `OEE` (token refreshed every 1140 s in Paul-Flow, once on start in farhan-flows) |
| mei-flows.json | Eight `http request` nodes read the token but this file never creates it | **ctx** | Ask colleague which flow keeps the token alive for it |
| farhan-flows.json | Tab `B2 line OEE` stores token in flow vars `b2_token`; GT4 tabs in `gt4_token`; Delete Timeseries in `token`/`IH_TOKEN` | **ctx** | none |

## 4. Insights Hub built-in auth (no credentials in files)
- `http request` nodes with `useMindsphereAuth=true` / `mindspherePath` (Paul-Flow #5, #15; farhan-flows #27; mei-flows #1, #5) and all SDK nodes (`read timeseries`, `write timeseries`, `read-oee`, `read aggregates`, `create event`, `write object`, `list objects`, `read object`, `subscribe timeseries`, `asset-type`).
- These only work inside the Insights Hub Node-RED runtime. They cannot be called locally; for local tests use mechanism 1 and the REST URLs instead.

## 5. Bearer passed in by the caller (query parameter)
| Where | Location | Status | Notes |
|---|---|---|---|
| farhan-flows.json | Tab `Reckitt - Get Reason Tree Reasons v3`, function `Prepare OEE API request`: token from inbound query `key`, base URL from inbound `Host` header; function `Validate key and reasonTreeId` compares `key` with flow var `REASONS_V3_PUBLIC_KEY` | var | Caller-provided; no value needed from us. `REASONS_V3_PUBLIC_KEY` belongs to an inbound endpoint (out of scope) |

## 6. Output variable
- Postman `TOKEN` (both collections): blank by design, filled by the test script of the token request. No value needed.

## Missing or blank in the sources
| Item | Why it matters |
|---|---|
| Postman environment file(s) | Not provided. Testing collection has blank `HOST`, `API`, `TOKEN`, `TENANT`, `AssetId`, `Aspect`, `tenantId`. OEE collection has blank `PIAM` |
| `flows_cred.json` | Not provided. No Node-RED node has a `credentials` block, so nothing is hidden in an encrypted file for these three exports |
| Flow context values | `GT4_CLIENT_ID`, `GT4_CLIENT_SECRET`, `clientID`, `tokenSecret`, `tokenUrl`, `IH_GATEWAY`, `REASONS_V3_PUBLIC_KEY` have no value in the flow files |
| `PIAM` host for `reckitt`/`greggs` token calls #199, #201, #202 | Blank in Postman; hardcoded hosts appear in #200 (`greggs`) and #203 (`reckitt`) |
| Which tenant is the real target | Defaults mix `caditiot`, `reckitt`, `greggs` |

## Secrets found in source files (location only; never copy values)
| File | Location |
|---|---|
| `CADIT Insights Hub Services Testing.postman_collection.json` | Item `Get Token`, `request.auth.basic` |
| `Reckitt OEE.postman_collection.json` | Items `techuser / create TU OEEHUB Admin User` and `Get Token`, `request.auth.basic` |
| `Paul-Flow.json` | Tab `OEE`, function `Technical user` |
| `farhan-flows.json` | Tab `OEE`, function `Technical user`; five `build token request` functions (tabs `B2 line OEE`, `GT4 line OEE` x2, `GT4 line losses`, `Delete Timeseries`) |
| `AssetFilterFinal.py` | Line 25, variable `decode` |

Recommend treating all of the above as exposed (they live in plain files and have been shared) and rotating them once testing is done.

## Questions to ask your colleague
1. Which tenant and client should we test against? Is it `reckitt` with the OEE technical user, or `caditiot` with the Testing collection client?
2. Do the Postman `Get Token` clients (caditiot and reckitt) and the Node-RED `Technical user` client share the same credentials, and which scopes/roles do they have (read-only vs write)?
3. Can we get a read-only client for exploration, so GET calls cannot change data?
4. What are the values (or the environment file) for `HOST`, `PIAM`, `TENANT` and where do the flow vars `GT4_CLIENT_ID`/`GT4_CLIENT_SECRET`, `tokenUrl`, `clientID`, `tokenSecret` get their values?
5. Is the app `simapiapp` (Technical Token Manager) still active, and is the app credential in `AssetFilterFinal.py` still valid?
6. Which Node-RED flow keeps `tenant.access_token_OEE` fresh for `mei-flows.json`?
7. For the SDK nodes (`read-oee`, `write timeseries`, `create event`, `asset-type`), which exact REST endpoints do they call, if we need to reproduce them outside Insights Hub?
