# Provideam API: short explanation

## a. Can the API replace the emailed CSV files?

**Partly—at the connectivity layer.** The API key can read the Hull,
Nottingham and Weinheim hierarchies, and most tested machine data. That proves
the service is reachable. It does not yet prove the reports can replace the
emailed files. The report metadata
lookups returned empty arrays. All eight report POST routes returned HTTP 500
when tested with the minimal empty body `{}`. No API report rows could be
compared with the SharePoint source; a valid request body has not been tested.

## b. How to call it

Use `https://rb-api.provideam.com`. Send the key in the `apiKey` header. The
project client reads `PROVIDEAM_API_KEY` from `.env`; do not print or commit
the value. The client also restricts method/path pairs and spaces calls by at
least 300 ms.

Verified GET example:

```js
import { request } from './provideam-client.js';

const response = await request('GET', '/api/v1/plant/getall', {
  query: { Skip: 0, Take: 100 },
});
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}
```

No working report POST example is known. The smallest empty request below
returned HTTP 500 on all eight report POST routes. This is not a valid report
configuration:

```js
const response = await request(
  'POST',
  '/api/v1/report/objectbyperiod',
  { body: {} },
);
```

## c. Candidate call for each Hull report

| Hull report | Candidate API call | Status |
|---|---|---|
| Plan OPT / Production Trend | `POST /api/v1/report/objectbyperiod` or `periodbyobject` | guess |
| Packing Hourly Run Rates | `POST /api/v1/report/objectyieldlog` | guess |
| OEE Loss / Group by Object | `POST /api/v1/report/objectbyperiodandloss` or `periodbyobjectandloss` | guess |
| Mode Log | `POST /api/v1/report/objectmodelog` | guess |
| Performance Availability | `POST /api/v1/report/currentstatus` | guess |

No report mapping is verified. Full endpoint detail is in
[provideam-reports.md](provideam-reports.md).

## d. What matches the SharePoint files?

The source files and their normalized column names are known. They contain
Plan OPT, hourly run rates, grouped losses and loss events. Some values are
formatted as text, such as percentages, comma-grouped numbers and durations.
The source documentation also describes a 06:00 production-day boundary and a
file date one day after the production day.

None of these details has been compared with API report output. API row
counts, column names, numeric sums, date boundaries, text formatting and
comment content remain unknown. See
[provideam-report-mapping.md](provideam-report-mapping.md).

## e. Gotchas

- The Swagger list endpoints cap `Take` at 100. `machine/getmodes` allows
  1000.
- The five `getavailable*` calls returned HTTP 200 with `[]` for both a
  missing and a deliberately invalid `dataSetType`.
- A zero-row machine list may return `machines: null` with
  `totalRowCount: 0`.
- One current-values call returned HTTP 500; a later call for that selected
  machine returned HTTP 200. All eight empty-body report POST probes returned
  HTTP 500; no valid request was available to test.
- The `userview/userview` response was not saved because this endpoint may
  contain user data.
- The report response schemas and valid request values are absent from the
  Swagger spec.

## f. What is still unknown, and who can answer?

The valid `dataSetType` values, report request arrays, response schemas and
the cause of the report HTTP 500 are unknown. The Provideam API owner or the
Reckitt owner of the saved report definitions can provide a minimal working
request and explain the intended day and grouping rules.

## g. Recommended next step

Ask the owner for a working one-machine, one-day request and the valid
`dataSetType` values. After the HTTP 500 is understood, compare that response
with one normalized Hull day before testing the same call for Nottingham.
