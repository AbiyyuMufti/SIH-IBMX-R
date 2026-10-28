# Provideam report endpoints

| At a glance | |
|---|---|
| **Purpose** | Record candidate V4 calls for the five Hull reports whose emailed CSV files feed the SharePoint source |
| **Status** | No report response has been verified. Endpoint names below are guesses from the API operation names and the initial investigation checklist |
| **Request model** | Swagger defines `ReportRequestModel`, but not valid values for its selections |
| **Response model** | Missing from Swagger. All eight report POST routes returned HTTP 500 to an empty request |
| **Samples** | Redacted request attempts and metadata responses are in ignored `samples/provideam/` |

## What the Swagger spec establishes

All report calls use a JSON `ReportRequestModel`. It has these properties:

| Property | Swagger shape |
|---|---|
| `userId` | integer |
| `formattedJson`, `applyStdTimeCorrection`, `includeGrandTotals` | boolean |
| `objects` | array of `ReportObjectModel`; `objectParams` is a map of string arrays |
| `fields` | array of `ReportFieldModel`; `fieldName` and `subtotal` |
| `functions` | array of `ReportFunctionModel`; function name, parameters, display name and index |
| `customFunctions` | array of custom function name, GUID, index and calculation |
| `periods`, `periodExclusion` | arrays of `ReportPeriodModel`; `periodParams` is a map of string arrays |
| `losses` | array of `ReportLossModel`; `lossParams` is a map of string arrays |

This describes field types, not accepted object names, field names, grouping
keys, functions, periods or loss values. The `getavailableobjects`,
`getavailablefields`, `getavailablefunctions`, `getavailablelosses` and
`getavailableperiods` endpoints returned empty arrays for missing and
deliberately invalid `dataSetType` values. No valid values were found.

The Swagger spec gives no response schema for the report operations. Do not
infer a response shape from their names. Each of the eight report POST routes
was later probed sequentially with the minimal JSON body `{}`; all returned
HTTP 500. This shows only that the empty-body probes failed. It does not show
whether a valid `ReportRequestModel` would work. The response from
`userview/userview` was not saved because it may contain user data.

## Report candidates

“Guess” means the endpoint has not returned report data. Requests and expected
columns below are not tested API behavior.

### Plan OPT — Production Trend, day

- **Purpose in the source files:** production by date, area, machine, shift
  segment and part. The normalized source type is `plan_opt`.
- **Candidate endpoints:** `POST /api/v1/report/objectbyperiod` or
  `POST /api/v1/report/periodbyobject` — **guess**.
- **Empty-body probes:** `objectbyperiod` and `periodbyobject` each returned
  HTTP 500 for `{}`. No valid machine/day request is known.
- **Working request:** none known.
- **Response schema:** unknown; no Swagger response schema or successful
  response.
- **Source quirks to check after a successful call:** the source day is
  06:00–06:00; file dates are one day later; values are formatted text,
  including comma-grouped numbers, percentages and `HH:MM:SS` durations.
  The source notes define OEE as Good Parts divided by Capacity.

### Packing Hourly Run Rates

- **Purpose in the source files:** hourly Good Parts and Capacity by area,
  machine, part and shift. The normalized source type is `run_rates`.
- **Candidate endpoint:** `POST /api/v1/report/objectyieldlog` — **guess**.
- **Empty-body probe:** `{}` returned HTTP 500.
- **Working request:** none known.
- **Response schema:** unknown.
- **Source quirks to check:** hourly grain, hour boundary, part and shift
  labels, and whether API values are numbers or preformatted text.

### OEE Loss — Group by Object

- **Purpose in the source files:** daily loss time and units grouped by
  machine and loss hierarchy. The normalized source type is
  `volume_loss_correction`.
- **Candidate endpoints:** `POST /api/v1/report/objectbyperiodandloss` or
  `POST /api/v1/report/periodbyobjectandloss` — **guess**.
- **Empty-body probes:** `objectbyperiodandloss` and
  `periodbyobjectandloss` each returned HTTP 500 for `{}`.
- **Working request:** none known.
- **Response schema:** unknown.
- **Source quirks to check:** loss Group, SubGroup and Desc labels, duration
  units, Loss Units, and the 06:00 production-day boundary.

### Mode Log

- **Purpose in the source files:** loss events with start time, machine, part,
  shift, loss hierarchy, duration and comment. The normalized source type is
  `line_losses`.
- **Candidate endpoint:** `POST /api/v1/report/objectmodelog` — **guess**.
- **Empty-body probe:** `{}` returned HTTP 500.
- **Working request:** none known.
- **Response schema:** unknown.
- **Source quirks to check:** event grain, local versus UTC time, and whether
  the comment text is returned.

### Performance Availability

- **Purpose in the source files:** daily Availability and Performance values.
  This report is not currently represented by a normalized source type.
- **Candidate endpoint:** `POST /api/v1/report/currentstatus` — **guess based
  only on the operation name**.
- **Empty-body probe:** `{}` returned HTTP 500.
- **Working request:** none known.
- **Response schema:** unknown.
- **Source quirks to check:** whether the endpoint returns a period report or
  only a current snapshot, and how its percentages are calculated.

### User View Report

- **Endpoint:** `POST /api/v1/report/userview/userview`.
- **Empty-body probe:** `{}` returned HTTP 500.
- **Working request and response schema:** unknown.
- **Privacy:** The response body was not saved because this endpoint may
  include user data.

## Request placeholder

Every candidate above shares the Swagger request model, but this is a shape
outline, not a working request. The arrays and map keys must come from valid
live metadata and a successful small report call:

```json
{
  "formattedJson": false,
  "applyStdTimeCorrection": false,
  "includeGrandTotals": false,
  "objects": [],
  "fields": [],
  "functions": [],
  "customFunctions": [],
  "periods": [],
  "periodExclusion": [],
  "losses": []
}
```

Do not use this empty body as a production request. It is included to show
the documented model only; the observed empty-body report call failed.
