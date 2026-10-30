# Provideam live test log

This companion to
[provideam.swagger.json.md](provideam.swagger.json.md) records the requests
actually sent and the useful shape of each response. Dynamic plant, area,
machine, shift-profile and dictionary IDs are shown as placeholders. Sample
JSON files in `samples/provideam/` are local and git-ignored.

## Connection and hierarchy

### Swagger document

- **Request:** `GET /swagger/v1/swagger.json`; no query or body.
- **Result:** HTTP 200. Saved the Swagger spec locally; it describes 54
  operations. Report operation response schemas are absent.
- **Sample:** `samples/provideam/swagger.json`.

### Plants

- **Request:** `GET /api/v1/plant/getall?Skip=0&Take=100`.
- **Result:** HTTP 200; 13 plant records returned. The key can see the three
  requested sites: Hull, Nottingham and Weinheim.
- **Sample:** `samples/provideam/hierarchy-plants.json`.
- **Skipped:** No other plant pages were needed; the returned list fit in the
  first page.

### Areas and machines

- **Request:** For each visible target plant,
  `GET /api/v1/area/get?PlantID=<plant ID>&Skip=0&Take=100`. Then for each
  returned area, `GET /api/v1/machine/get?AreaID=<area ID>&Skip=0&Take=100`.
- **Result:** HTTP 200. Areas returned: Hull 4, Nottingham 6, Weinheim 2.
  Machine records collected: Hull 58, Nottingham 35, Weinheim 9. These counts
  describe the returned list pages; actual IDs and names stay in local samples.
- **Empty-list behavior:** An area with no machines returned
  `machines: null`, `totalRowCount: 0`, and `recordsReturned: 0`.
- **Samples:** `hierarchy-plant-<n>-areas-page-0.json` and
  `hierarchy-plant-<n>-area-<n>-machines-page-0.json`.
- **Skipped:** No additional pages were needed for the observed areas;
  results were below the requested page size of 100.

### Workcells

- **Request:** `GET /api/v1/workcell/get?plantId=<plant ID>` once per target
  plant; no area filter.
- **Result:** HTTP 200. Returned arrays: Hull 0, Nottingham 9, Weinheim 0.
- **Samples:** `hierarchy-plant-<n>-workcells.json`.

## Machine and reference GETs

Two Hull machines were selected using the overlap of normalized local
Plan OPT, Run Rates, Volume Loss Correction and Line Losses source days. They
are called **machine A** and **machine B** below; their live names and IDs
remain in `samples/provideam/probe-targets.json`.

The common list-call parameters were `Skip=0&Take=100`. For modes,
`Take=1000` was used. The recorded `MachineID`, `machineID`, `machineId` and
`shiftProfileId` values are the selected machine or its profile identifier,
not included here.

| Request actually sent | Result for machine A | Result for machine B |
|---|---|---|
| `GET /api/v1/machine/getmachinesettings?machineID=<machine ID>` | HTTP 200; object containing 107 setting key/value pairs | HTTP 200; object containing 106 setting key/value pairs |
| `GET /api/v1/machine/getmodes?MachineID=<machine ID>&Skip=0&Take=1000` | HTTP 200; 473 mode records | HTTP 200; 321 mode records |
| `GET /api/v1/machine/getmodegroups?MachineID=<machine ID>` | HTTP 200; 6 group records | HTTP 200; 5 group records |
| `GET /api/v1/machine/getmodesubgroups?MachineID=<machine ID>` | HTTP 200; 19 subgroup records | HTTP 200; 21 subgroup records |
| `GET /api/v1/machine/getmachineparts?MachineID=<machine ID>&Skip=0&Take=100` | HTTP 200; 29 part records | HTTP 200; 48 part records |
| `GET /api/v1/machine/getmachinetools?MachineID=<machine ID>&Skip=0&Take=100` | HTTP 200; 1 tool record | HTTP 200; 1 tool record |
| `GET /api/v1/machine/getmachinestations?MachineID=<machine ID>&Skip=0&Take=100` | HTTP 200; 4 station records | HTTP 200; 2 station records |
| `GET /api/v1/machine/getmachineschdowntimes?MachineID=<machine ID>&Skip=0&Take=100` | HTTP 200; `totalRowCount: 0`, collection `null` | HTTP 200; `totalRowCount: 0`, collection `null` |
| `GET /api/v1/machine/getshifts?machineId=<machine ID>` | HTTP 200; 1 shift record | HTTP 200; empty array |
| `GET /api/v1/machine/getprodshifts?machineId=<machine ID>` | HTTP 200; 1 production-shift record | HTTP 200; 1 production-shift record |
| `GET /api/v1/shift/getshiftstartdate?machineId=<machine ID>` | HTTP 200; 19 array entries | HTTP 200; 19 array entries |
| `GET /api/v1/shift/getshift?shiftProfileId=<profile ID>` | HTTP 200; 56 array entries | HTTP 200; 56 array entries |

These are observed response counts, not assertions about whether a particular
configuration is complete or correct.

### Current values

- **Request:** `GET /api/v1/machine/getmachinecurrentvalues?machineID=<machine ID>`.
- **Result:** An initial request returned HTTP 500. A later request for machine
  A returned HTTP 200 with a JSON object of current machine values. The object
  contains production, mode, shift and current-time fields; values are not
  reproduced here.
- **Retry 2026-10-30:** machine A (B2 Auto) HTTP 200 again; machine B (SP6)
  HTTP 500 with no body. The error is per machine, not a first-call glitch.
  Do not assume it works for every machine.
- **Sample:** `samples/provideam/machine-1-current-values.json`.

### Mode types and dictionary

- **Request:** `GET /api/v1/mode/getmodetypes`; no query or body.
- **Result:** HTTP 200; 6 key/value records.
- **Sample:** `samples/provideam/mode-types.json`.

- **Request:** `GET /api/v1/dictionary/get`; no query or body was supplied.
- **Result:** HTTP 200; a dictionary object with 2,776 key/value entries.
- **Sample:** `samples/provideam/dictionary.json`.

## Report metadata and report request

For each metadata endpoint below, two calls were sent: first with no query
parameter, then with `dataSetType=__invalid_probe__`.

| Request | Result without `dataSetType` | Result with `dataSetType=__invalid_probe__` |
|---|---|---|
| `GET /api/v1/report/getavailableobjects` | HTTP 200, empty array | HTTP 200, empty array |
| `GET /api/v1/report/getavailablefields` | HTTP 200, empty array | HTTP 200, empty array |
| `GET /api/v1/report/getavailablefunctions` | HTTP 200, empty array | HTTP 200, empty array |
| `GET /api/v1/report/getavailablelosses` | HTTP 200, empty array | HTTP 200, empty array |
| `GET /api/v1/report/getavailableperiods` | HTTP 200, empty array | HTTP 200, empty array |

The user then supplied six DataSet Template names. Each was passed as
`dataSetType` to all five metadata endpoints. All 30 GETs returned HTTP 200:

| `dataSetType` | Objects | Fields | Functions | Losses | Periods |
|---|---:|---:|---:|---:|---:|
| `dsObjectByPeriod` | 30 | 74 | 133 | 0 | 12 |
| `dsPeriodByObject` | 31 | 74 | 138 | 0 | 12 |
| `dsObjectByPeriodAndLoss` | 30 | 80 | 140 | 8 | 11 |
| `dsPeriodByObjectAndLoss` | 30 | 80 | 140 | 8 | 11 |
| `dsObjectModeLog` | 31 | 86 | 0 | 5 | 11 |
| `dsObjectYieldLog` | 29 | 84 | 0 | 5 | 11 |

Counts are metadata array lengths observed on 2026-10-29. No metadata item
values were added to this log.

- **Report request sent:** `POST /api/v1/report/objectbyperiod`, JSON body
  `{}`.
- **Result:** HTTP 500. No report rows or usable response schema were
  obtained.
- **Sample:** `samples/provideam/objectbyperiod-empty-request.json`.
- **Follow-up:** After the user explicitly requested tests of the remaining
  report routes, each allowlisted route was called once, sequentially, with
  the same minimal `{}` body. Every response was HTTP 500:

  | Request | Result | Saved evidence |
  |---|---|---|
  | `POST /api/v1/report/objectbyperiodandloss` | HTTP 500 | `samples/provideam/api-v1-report-objectbyperiodandloss-empty-request.json` |
  | `POST /api/v1/report/periodbyobject` | HTTP 500 | `samples/provideam/api-v1-report-periodbyobject-empty-request.json` |
  | `POST /api/v1/report/periodbyobjectandloss` | HTTP 500 | `samples/provideam/api-v1-report-periodbyobjectandloss-empty-request.json` |
  | `POST /api/v1/report/currentstatus` | HTTP 500 | `samples/provideam/api-v1-report-currentstatus-empty-request.json` |
  | `POST /api/v1/report/userview/userview` | HTTP 500 | Status-only sample; response body not saved because this endpoint may contain user data |
  | `POST /api/v1/report/objectmodelog` | HTTP 500 | `samples/provideam/api-v1-report-objectmodelog-empty-request.json` |
  | `POST /api/v1/report/objectyieldlog` | HTTP 500 | `samples/provideam/api-v1-report-objectyieldlog-empty-request.json` |

- **Interpretation:** All seven remaining requested routes returned HTTP 500
  to the empty-body probe. This does not prove that a valid
  `ReportRequestModel` would fail. No valid request body is known.
- **Provided-schema probe:** The user supplied an Object By Period body with
  `userId`, `formattedJson`, `applyDSTimeCorrection`,
  `includeGrandTotals`, `objects[].objectParam.oeeMachineID`,
  `fields[].fieldName`, and `functions[].funcName/index`. The placeholder
  machine value `"a"` was replaced with the selected Hull machine ID. The
  body was sent once to `POST /api/v1/report/objectbyperiod`; it returned
  HTTP 500 with no JSON response body. The redacted sample is
  `samples/provideam/objectbyperiod-provided-schema.json`.
- **Schema discrepancy:** The supplied body uses `applyDSTimeCorrection` and
  singular `objectParam`. The saved Swagger model instead declares
  `applyStdTimeCorrection` and plural `objectParams`. No corrected-body retry
  was made, so the outcome does not establish whether the Swagger-shaped
  request succeeds.
- **Not established:** Valid `dataSetType` values, report request contents,
  report response columns, dates, numeric values and row counts.

### UI-captured report definitions (2026-10-29)

- **Requests:** 38 sequential `POST /api/v1/Report/ObjectByPeriod` calls,
  using the individual JSON bodies captured from the Provideam UI unchanged.
- **Result:** All 38 returned HTTP 500 with an empty response body.
- **Bodies:** All 38 parse as JSON; there are 37 distinct payloads, with
  definitions 35 and 36 identical. The bodies use singular `objectParam` and
  `periodParam`; Swagger declares `objectParams` and `periodParams`. The
  same caller ID was used for all 38; it also worked in the corrected report
  23 request, so it was not the cause for that report. Thirty-two contain
  instruction/example text in their period values. These were not valid tests
  of 38 fully populated report requests.
- **Evidence:** Per-report outcomes are recorded alongside the ignored local
  report definitions. No raw response data was saved.
- **Correction (2026-10-30):** Report 23 was tested with
  `pdDay: ["[2026-10-29T00:00:00]"]` and
  `Content-Type: application/json-patch+json`; it returned HTTP 200 with 30
  `processedData` rows. The same caller and machine selections as the failed
  test were used, so they were not the issue for report 23. Period value and
  content type both changed; their separate effects are not isolated.
  Response values were inspected in memory and not saved.
- **SharePoint mapping:** The successful report 23 output does not identify
  which definition is scheduled or which Power Automate flow writes it.

### Retimed UI-captured report definitions (2026-10-30)

- **Requests:** All 38 report definitions were sent sequentially to
  `POST /api/v1/report/objectbyperiod`, changing only the period value in each
  saved request. Caller ID, machine selection and remaining payload values
  were kept unchanged. Content type was
  `application/json-patch+json`.
- **Periods:** `pdDay` used `[2026-10-29T00:00:00]`; `pdCustom` used
  `[2026-10-28T00:00:00,2026-10-29T00:00:00]`; `pdMonth` used `[10,2026]`.
- **Result:** 30/38 returned HTTP 200 with `processedData`; six successful
  responses had zero rows. Reports 15-22 returned HTTP 500.
- **Retries:** Report 15 was retried with
  `[2026-10-29T00:00:00,2026-10-30T00:00:00]`; reports 16-22 were retried
  with the full October range
  `[2026-10-01T00:00:00,2026-11-01T00:00:00]`. All eight still returned
  HTTP 500. These eight templates share custom-function entries, but the
  cause has not been established.
- **Evidence:** Per-report status and row counts are in the ignored
  `docs/provideam-samples/provideam-retimed-results.json` and the local
  report index. No row values were saved.

## Deliberately not called

These requests were skipped by scope or safety rule; they were not tested:

- Account login/refresh and account responses.
- `GET /api/v1/area/getoperators` and all `contactlist/*` endpoints.
- Area or machine configuration/write operations, including `area/setpart`,
  machine setting/part/downtime writes and current-value updates.
- `POST /api/v1/services/start` and `POST /api/v1/services/stop`.
- Other Swagger operations not needed for the requested hierarchy,
  machine/reference reads or candidate report investigation.

## Can this replace the emailed CSV inputs?

Not proven. Thirty report calls returned `processedData`, but no row values
were saved for source comparison. API output has not been compared with the
normalized SharePoint source for row counts, columns, daily boundaries,
numeric sums, formatted values, machine-name exclusions or Mode Log comments.
See [provideam-report-mapping.md](../provideam-report-mapping.md) for the
comparison checklist.
