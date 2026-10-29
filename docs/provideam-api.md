# Provideam V4 API

| At a glance | |
|---|---|
| **Host** | `https://rb-api.provideam.com` |
| **Auth** | `apiKey` request header; value loaded from `PROVIDEAM_API_KEY` in `.env`. This is not the Insights Hub API or Bearer auth |
| **Pagination** | List requests use `Skip` and `Take`; the Swagger cap is 100, except `machine/getmodes` (1000). Requests are sent sequentially, at least 300 ms apart |
| **Gotchas** | Swagger has no report response schemas. Missing and invalid `dataSetType` values returned HTTP 200 with `[]`. Retimed report tests returned HTTP 200 for 30/38 definitions; reports 15-22 returned HTTP 500 even with actual date ranges |
| **Status** | All 38 report definitions were retried 2026-10-30 with actual periods. Thirty returned HTTP 200; raw row values were not saved. See [provideam-reports.md](provideam-reports.md) and [provideam-report-mapping.md](provideam-report-mapping.md) |
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

The user later supplied six DataSet Template names. GET requests using those
names returned HTTP 200 with metadata; the observed metadata counts are listed
in [provideam-reports.md](provideam-reports.md). The earlier missing/invalid
probes therefore should not be used to conclude that the metadata is empty.

All eight report POST routes were probed sequentially with an empty JSON
object `{}`; every one returned HTTP 500. On 2026-10-30, the 38 saved report
definitions were retried with only their period values replaced by actual
dates/months; the saved caller IDs, machine selections and report fields were
preserved. All used `Content-Type: application/json-patch+json`. Thirty
returned HTTP 200 and eight (reports 15-22) returned HTTP 500, including after
additional actual-date range retries. Successful responses contained a
`processedData` array; row values were not saved. See the detailed
[live test log](inventory/provideam.live-tests.md) for request evidence and
the schema discrepancy.

The first 38 requests used saved period instruction text unchanged. The
2026-10-30 retest replaced only each period value, retained the saved caller,
machine selection, fields and functions, and used
`Content-Type: application/json-patch+json`. Thirty of 38 returned HTTP 200;
reports 15-22 returned HTTP 500. Their templates include custom functions,
but that shared trait has not been proven to cause the errors. See
`downloads/provideam-samples/provideam-retimed-results.json` for sanitized
status and row-count summaries; no report row values were saved.

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

The empty-body request below is an error probe, not a working report body:

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
