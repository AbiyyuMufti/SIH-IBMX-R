# Provideam V4 API

| At a glance | |
|---|---|
| **Host** | `https://rb-api.provideam.com` |
| **Auth** | `apiKey` request header; value loaded from `PROVIDEAM_API_KEY` in `.env`. This is not the Insights Hub API or Bearer auth |
| **Pagination** | List requests use `Skip` and `Take`; the Swagger cap is 100, except `machine/getmodes` (1000). Requests are sent sequentially, at least 300 ms apart |
| **Gotchas** | Swagger has no report response schemas. Missing and invalid `dataSetType` values returned HTTP 200 with `[]`. All eight tested report POST routes returned HTTP 500 to an empty `{}` body; no valid request was established |
| **Status** | Live hierarchy and most requested machine GETs verified 2026-10-28. Report endpoints were probed, but no report data was returned. See [provideam-reports.md](provideam-reports.md) and [provideam-report-mapping.md](provideam-report-mapping.md) |
| **Safe client** | [`scripts/provideam-client.js`](../scripts/provideam-client.js): fixed host and exact method/path allowlist; rejects redirects; does not retry; redacts sensitive and operator/user fields before saving samples |

## What was verified

The API key can see the three requested plants: Hull, Nottingham and Weinheim.
The hierarchy was read with `plant/getall`, `area/get`, `machine/get` and
`workcell/get`. The live identifiers and machine names are only in the ignored
`samples/provideam/` directory.

Machine GETs were tested for two Hull machines. Settings, modes, mode groups,
mode subgroups, parts, tools, stations, shifts, production shifts, scheduled
downtimes and shift lookups returned HTTP 200. `mode/getmodetypes` and
`dictionary/get` also returned HTTP 200. Current values returned HTTP 500 once
and HTTP 200 on a later request for the first selected machine; it was not
tested on the second. Treat this operation as unstable, not as a dependable
source.

An empty machine list was observed as `machines: null` with
`totalRowCount: 0`. The hierarchy reader treats that exact zero-row response
as an empty page. Other missing or malformed response shapes remain errors.

## Report metadata and errors

The five metadata endpoints are:

| Method and path | Missing `dataSetType` | Deliberately invalid `dataSetType` |
|---|---|---|
| `GET /api/v1/report/getavailableobjects` | HTTP 200, `[]` | HTTP 200, `[]` |
| `GET /api/v1/report/getavailablefields` | HTTP 200, `[]` | HTTP 200, `[]` |
| `GET /api/v1/report/getavailablefunctions` | HTTP 200, `[]` | HTTP 200, `[]` |
| `GET /api/v1/report/getavailablelosses` | HTTP 200, `[]` | HTTP 200, `[]` |
| `GET /api/v1/report/getavailableperiods` | HTTP 200, `[]` | HTTP 200, `[]` |

These results do not reveal valid dataset types. Do not treat the empty lists as
evidence that a report has no fields or no periods.

All eight report POST routes that were in scope were subsequently probed
sequentially with an empty JSON object `{}`. Every one returned HTTP 500. The
`userview/userview` response was not saved because it may contain user data.
These validation probes do not prove that the endpoints fail with a valid
`ReportRequestModel`; no accepted request body is known. See the detailed
[live test log](inventory/provideam.live-tests.md) for each route and its
saved evidence.

## Request example

This GET was verified live. It requests the first page, with the Swagger page
limit:

```js
import { request } from './provideam-client.js';

const response = await request('GET', '/api/v1/plant/getall', {
  query: { Skip: 0, Take: 100 },
});
if (!response.ok) {
  throw new Error(`Provideam returned HTTP ${response.status}`);
}
```

The report POST wrapper is implemented, but no report body is known to work:

```js
const response = await request(
  'POST',
  '/api/v1/report/objectbyperiod',
  { body: {} },
);
```

This empty body was the validation probe and returned HTTP 500. It is not a
working report request. The client allowlist contains only individually
selected read endpoints and candidate report paths. It excludes account,
operator/contact, configuration-write and service start/stop operations.

## Inventory and evidence

The full Swagger operation list, parameters, allowlist status and live
verification status is generated at
[provideam.swagger.json.md](inventory/provideam.swagger.json.md):

```powershell
node scripts/helper-swagger-markdown.js
```

Redacted real responses and the retrieved Swagger document are in the ignored
`samples/provideam/` folder. No machine IDs or names are in tracked docs.
“Verified live” means the endpoint returned a usable HTTP response during this
investigation; it does not mean every returned field or business rule is
understood. Report calls with only a 5xx remain unverified.

Run the local allowlist and redaction checks without network access:

```powershell
node scripts/test-provideam-client.js
```
