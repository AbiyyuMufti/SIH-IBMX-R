# Provideam report endpoints

| At a glance | |
|---|---|
| **Purpose** | Record candidate V4 calls for the five Hull reports whose emailed CSV files feed the SharePoint source |
| **Status** | 30/38 retimed definitions return HTTP 200 unchanged. Reports 15-22 return HTTP 500 because they ask for more than 18 standard functions (found 2026-10-30); split into two calls they return HTTP 200. Mode Log and loss by object bodies built and checked against the October 2026 files (2026-11-02) |
| **Request model** | Swagger defines `ReportRequestModel`, but not valid values for its selections |
| **Response model** | Missing from Swagger. Report 23 returned an object with a `processedData` array; 30 rows were observed and raw values were not saved |
| **Samples** | Request/result notes are in `docs/provideam-samples/`; prior redacted probes are in ignored `samples/provideam/` |

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
deliberately invalid `dataSetType` values. The UI's DataSet Templates list
later supplied six names; each returned HTTP 200 with metadata when queried.

| `dataSetType` | UI description | Objects | Fields | Functions | Losses | Periods |
|---|---|---:|---:|---:|---:|---:|
| `dsObjectByPeriod` | Production Trend | 30 | 74 | 133 | 0 | 12 |
| `dsPeriodByObject` | Production Object | 31 | 74 | 138 | 0 | 12 |
| `dsObjectByPeriodAndLoss` | OEE Loss By Period | 30 | 80 | 140 | 8 | 11 |
| `dsPeriodByObjectAndLoss` | OEE Loss By Object | 30 | 80 | 140 | 8 | 11 |
| `dsObjectModeLog` | Mode Log Report | 31 | 86 | 0 | 5 | 11 |
| `dsObjectYieldLog` | Yield Log Report | 29 | 84 | 0 | 5 | 11 |

Counts are the metadata array lengths observed on 2026-10-29 for this tenant.
The source investigation associates Production Trend with Plan OPT, OEE Loss
By Object with Volume Loss Correction, and Mode Log with Daily Line Losses.
Yield Log is a likely template family for Packing Hourly Run Rates based on
the UI label; that mapping still needs a successful report response.

The Swagger spec gives no response schema for the report operations. Do not
infer a response shape from their names. Each of the eight report POST routes
was later probed sequentially with the minimal JSON body `{}`; all returned
HTTP 500. This shows only that the empty-body probes failed. It does not show
whether a valid `ReportRequestModel` would work. The response from
`userview/userview` was not saved because it may contain user data.

The first populated example was sent with an unresolved machine placeholder
substituted and returned HTTP 500. Retimed testing on 2026-10-30 preserved the
saved caller, machine selections and report definitions, replacing only period
values and using `application/json-patch+json`. Report 23 returned HTTP 200
with 30 rows under `processedData`.

## UI-captured report definitions

The user supplied 38 report definitions captured from the Provideam UI. All
use `POST /api/v1/Report/ObjectByPeriod`; the JSON payloads are not all the
same (37 distinct payloads, with entries 35 and 36 identical). Each saved
body was sent unchanged once, sequentially, on 2026-10-29.

- **Result:** 38 of 38 returned HTTP 500 with an empty response body for the
  exact saved bodies tested on 2026-10-29. This was not a valid test of 38
  fully populated report requests.
- **Rows and schema:** None returned for those unchanged bodies; see the
  retimed results below for successful responses.
- **Stored evidence:** The local, ignored report files contain each status
  and response-shape note. Raw report rows were not saved.
- **Invalid inputs found on review:** 32 bodies contain instruction/example
  text in their period values. Report 23 succeeds with that period replaced
  by an actual date. The successful request used the same caller and machine
  selections as the failed test, so those were not the cause for this report.
- **Corrected report 23 result:** HTTP 200; 30 rows under `processedData`.
  The response keys are recorded in the numbered local report file; raw
  values were not saved.
- **Limit of evidence:** The period value and content type both changed from
  the initial request, so their individual effects are not isolated. The
  result does not verify the other 37 report definitions or their mappings.
- **Interpretation:** These results do not identify which saved report is
  scheduled by Power Automate or which CSV it writes to SharePoint.

## Retimed report tests (2026-10-30)

- Replaced only the time selection in each saved payload. Kept each saved
  `userId`, machine selection, fields, functions and other payload values.
- Used `Content-Type: application/json-patch+json`.
- `pdDay`: `[2026-10-29T00:00:00]`; `pdCustom`:
  `[2026-10-28T00:00:00,2026-10-29T00:00:00]`; `pdMonth`: `[10,2026]`.
- **Result:** 30/38 returned HTTP 200 with a `processedData` array. Six
  successful responses had zero rows. The other 8 (reports 15-22) returned
  HTTP 500.
- Reports 15-22 were retried with actual `pdCustom` ranges: report 15 for
  `[2026-10-29T00:00:00,2026-10-30T00:00:00]`; reports 16-22 for the full
  October range `[2026-10-01T00:00:00,2026-11-01T00:00:00]`. All eight still
  returned HTTP 500.
- **Cause found (2026-10-30, report 15, one day):** the request fails when
  `functions` holds more than 18 entries. Base 4 + both loss-group functions
  + the first 12 subgroups (18) returns HTTP 200; adding a 13th returns
  HTTP 500, whichever 12 subgroups are taken first. Each subgroup alone with
  both groups returns HTTP 200, the custom function is not the cause
  (removing it still fails), and `includeGrandTotals`, field subtotals and
  `pdDay` do not change the result. Reports 15-22 have 20 functions.
- **Workaround:** two calls with the same fields, period and machines, each
  with at most 18 functions (for example: without the two
  `fnPCLossGroupByCapacity` entries, and with only those two), then join on
  the field columns. Both halves returned HTTP 200 for reports 15-22
  (report 22 Tubs: 0 rows on 2026-10-29). Not reported to Provideam yet.
- Only status, row count and response-shape metadata were recorded; report
  values were not saved. See the ignored local
  `docs/provideam-samples/provideam-retimed-results.json` and the
  per-report index for outcomes.

The existing source investigation identifies the SharePoint report families
as Plan OPT (Production Trend), Packing Hourly Run Rates, OEE Loss (Group by
Object), and Mode Log. Performance Availability is also described, but was
not found in the Power BI model. The successful report definition, scheduled
report's exact Power Automate schedule and destination are not established by
the successful response; see [provideam-source.md](provideam-source.md).

## Report candidates

The operation candidates below were hypotheses before the UI captures. All 38
captured definitions use `POST /api/v1/Report/ObjectByPeriod`; their mapping to
the source report families and their expected columns remain unverified.

### Plan OPT — Production Trend, day

- **Purpose in the source files:** production by date, area, machine, shift
  segment and part. The normalized source type is `plan_opt`.
- **Captured UI route:** `POST /api/v1/Report/ObjectByPeriod`, shared by all
  38 saved definitions. Corrected report 23 returned 30 rows; whether it is
  the SharePoint Plan OPT definition remains unconfirmed.
- **Empty-body probes:** `objectbyperiod` and `periodbyobject` each returned
  HTTP 500 for `{}`. A corrected report 23 machine/day request is documented
  below.
- **Provided-schema probe:** The first supplied populated request to
  `objectbyperiod` returned HTTP 500; see
  `samples/provideam/objectbyperiod-provided-schema.json` for the redacted
  request and response status.
- **Schema discrepancy:** The first supplied request used
  `applyDSTimeCorrection`; the successful report 23 request uses
  `applyStdTimeCorrection` and singular `objectParam` / `periodParam`.
  Therefore the Swagger boolean spelling and singular wrappers work in the
  successful request.
- **Working request:** report 23 with `pdDay: ["[2026-10-29T00:00:00]"]`
  and `Content-Type: application/json-patch+json`.
- **Observed response:** 30 rows under `processedData`, with fields
  `fdYYYYMMDD`, `fdAreaName`, `fdMachineName`, `fdShiftName`,
  `fdShiftStartTime`, `fdPartName`, `fnGoodParts_0`, `fnDefectParts_0`,
  `fnTarget_0`, `fnCapacity_0`, `fnOEE_0`, `fnTotalTime_0`,
  `fnPlannedOpT_0`, `fnOEETime_0`, and `fnDowntimeUnits_0`, plus `rowDesc`.
  No Swagger response schema exists.
- **Source quirks to check after a successful call:** the source day is
  06:00–06:00; file dates are one day later; values are formatted text,
  including comma-grouped numbers, percentages and `HH:MM:SS` durations.
  The source notes define OEE as Good Parts divided by Capacity.

### Packing Hourly Run Rates

- **Purpose in the source files:** hourly Good Parts and Capacity by area,
  machine, part and shift. The normalized source type is `run_rates`.
- **Captured UI route:** `POST /api/v1/Report/ObjectByPeriod`, shared by all
  38 saved definitions. The Yield Log DataSetType is a possible match, not a
  confirmed mapping.
- **Retimed calls:** Related saved templates returned HTTP 200; see the
  numbered local report index. The exact SharePoint definition is not
  identified.
- **Empty-body probe:** `{}` returned HTTP 500.
- **Response schema:** no Swagger response schema.
- **Source quirks to check:** hourly grain, hour boundary, part and shift
  labels, and whether API values are numbers or preformatted text.

### OEE Loss — Group by Object

- **Purpose in the source files:** daily loss time and units grouped by
  machine and loss hierarchy. The normalized source type is
  `volume_loss_correction`.
- **Captured UI route:** `POST /api/v1/Report/ObjectByPeriod`, shared by all
  38 saved definitions. The `dsPeriodByObjectAndLoss` template label matches
  this source family, but no successful output confirms a saved definition.
- **Empty-body probes:** `objectbyperiodandloss` and
  `periodbyobjectandloss` each returned HTTP 500 for `{}`.
- **Working request (built 2026-11-02, not a saved definition):**
  `POST /api/v1/report/periodbyobjectandloss`, `application/json-patch+json`,
  the caller and `objects` of the site's plan OPT report, `pdDay` or
  `pdMonth`, fields `fdShiftStartDate`, `fdMachineName`,
  `fdOEELossLvl3Type`, `fdOEELossLvl3SubGroup`, `fdOEELossLvl3Desc`,
  functions `fnTime` (index 1) and `fnLossUnits` (index 2) and
  `losses: [{"lossParam": {"lsOEELossLvl3Desc": []}}]`. Without `losses`,
  or with three `losses` entries, it returns HTTP 500.
- **Response schema:** `processedData` holds only the machine rows; the
  values are in `processedLossData`, one row per shift date, machine and
  loss (`fnTime_0` in seconds, `fnLossUnits_0`). `fdShiftStartDate` is text
  `M/D/YYYY 12:00:00 AM`. It also returns non-loss types (`GoodParts`,
  `Run`, `Cycles`, defects): the SharePoint file keeps only the site's loss
  groups (Hull `Not Logged`, `Planned Loss`, `Unplanned Loss`; Nottingham
  `Not Logged`, `Planned Losses`, `Unplanned Losses`).
- **Checked:** see "October 2026 against the SharePoint files" below.

### Mode Log

- **Purpose in the source files:** loss events with start time, machine, part,
  shift, loss hierarchy, duration and comment. The normalized source type is
  `line_losses`.
- **Captured UI route:** `POST /api/v1/Report/ObjectByPeriod`, shared by all
  38 saved definitions. The `dsObjectModeLog` template label matches this
  source family, but no successful output confirms a saved definition.
- **Empty-body probe:** `{}` returned HTTP 500.
- **Working request (built 2026-11-02, not a saved definition):**
  `POST /api/v1/report/objectmodelog`, `application/json-patch+json`, the
  caller and `objects` of the site's plan OPT report, `pdDay` or `pdMonth`,
  no functions, fields `fdStartTime`, `fdMachineName`, `fdPartName`,
  `fdShiftName`, `fdOEELossLvl3Type`, `fdOEELossLvl3SubGroup`,
  `fdOEELossLvl3Desc`, `fdTime`, `fdShiftStartDate`, `fdModeComment`.
- **Response schema:** `processedData`, one row per mode event, local wall
  clock times (`2026-10-29T06:00:00`), `fdTime` in seconds,
  `fdOEELossLvl3Type` = the file's `OEELossLvl3Group`, `fdModeComment` =
  `Comment`. It also returns the `Run` events: the SharePoint file has none.
- **Checked:** see "October 2026 against the SharePoint files" below.

## October 2026 against the SharePoint files (2026-11-02)
Hull and Nottingham, October 2026, every source type, compared row by row
with `sharepoint/source/<type>/site=<Site>/<type>_2026-10.csv` (the files
of the Friday upload). API rows narrowed to the machines of the file (the
bodies will hold exactly those machines), `Run` dropped from the Mode Log,
the correction narrowed to the file's loss groups. Keys: plan = machine,
shift, shift start, part; run rates = machine, hour, part, shift; losses =
start time, machine, description; correction = shift date, machine, group,
subgroup, description. Values: plan Good Parts, Total Time, Planned OpT,
Capacity; run rates Good Parts, Capacity; losses duration; correction time
and loss units.

| Site | Type | Call | Matched rows | Value differences |
|---|---|---|---|---|
| Hull | plan OPT | report 23, one call per day | 1,064 of 1,064 | 14, all 30 Oct |
| Hull | run rates | report 30, one call per day | 8,159 of 8,211 | 116, all 30 Oct |
| Hull | line losses | Mode Log, `pdMonth` | 15,286 of 15,295 | 0 |
| Hull | correction | loss call, `pdMonth` | 6,379 of 6,383 | 20, 29 and 30 Oct |
| Nottingham | plan OPT | report 25, `pdMonth` | 2,647 of 2,648 | 23, 29 and 30 Oct |
| Nottingham | run rates | report 24, `pdMonth` | 18,983 of 19,150 | 100, all 30 Oct |
| Nottingham | line losses | Mode Log, one call per day | 19,712 of 19,721 | 5, 29 and 30 Oct |
| Nottingham | correction | loss call, `pdMonth` | 9,698 of 9,705 | 13, 29 and 30 Oct |

- 1 to 28 October are equal in every type. Every other difference is on
  29 and 30 Oct (the files were exported during 30 Oct; the entries were
  edited later) or is a row the files do not have yet (31 Oct, and the
  hours of 1 Nov before 06:00 that belong to production day 31 Oct).
- Run rates rows the files have and the API does not: the hours 00:00 to
  05:00 of 1 Oct (production day 30 Sep). The API month runs from 06:00 on
  the 1st to 05:00 on the 1st of the next month.
- Machines the API returns and the files do not (left out by the bodies):
  Hull `GT4 - Auto` (plan, losses), `6 Tonne`, `Vacumix`, `D2`, `D3`
  (losses, correction); Nottingham `N11 Auto` (losses, 46,173 events in
  the month), `Basing7`, `O5`.
- Time and size: one day per call takes 1 to 7 s, the largest day is
  Nottingham's Mode Log (1.26 MB, about 4,000 rows). Month calls: Mode Log
  and correction 6 to 25 s (Hull Mode Log 9.1 MB); Hull report 11 for the
  month did not answer within 5 minutes (twice a network timeout), so
  the live flow calls one day at a time.
- Weinheim (report 38, one day): equal to the file on 13 Oct; rows up to
  22 Oct, none from 23 to 30 Oct.

### October 2026 recreated from the API (2026-11-02)
The API responses were written as the normalized source CSVs (rules below),
built with `scripts/local-report-build.js` (the flow code) and compared with
the Friday files in the lake: same schema, and every row of 1 to 28 Oct
equal (all columns but `loaded_at`) in `Plan_OPT_EU`, `Time_Utilisation_EU`,
`Daily_Losses_EU`, `Run_Rates_EU`, `Volume_CoV_EU`, Hull and Nottingham,
except 4 Nottingham loss comments that the old export cut at a quote. The
10 month files replaced the Friday ones in `eu_report/report/`, the 8 source
CSVs the ones in `eu_report/pbi_report/source/` (both verified). The new
files hold 29 to 31 Oct with the final values. As in the Friday files, a
loss after midnight of the last production day keeps its own date (1 Nov)
in the October file.

Source CSV rules (from the API row to the SharePoint export text):
- Columns and order of `sharepoint/source/<type>/` (`docs/sharepoint-files.md`).
- Machines: only those of the site's SharePoint file of that type.
- Line losses: `Run` events left out; `PartName` = `fdPartDesc`, not
  `fdPartName` (that is the part code).
- Correction: only the site's loss groups of the file (see above).
- Run rates: calendar hours (`YYYY-MM-DD HH:00:00`), so the month needs the
  previous production day too (00:00 to 05:00 on the 1st); Good Parts and
  Capacity rounded to whole numbers.
- Plan OPT: Good Parts and Defect Parts whole numbers; Target, Capacity,
  Downtime Units 2 decimals; OEE `x 100` with 1 decimal and `%`, rounded half
  up after `toPrecision(12)` (0.5125 = 51.3%).
- Durations `HH:MM:SS`, seconds rounded half to even (11376.5 s = 03:09:36).
- Times `YYYY-MM-DD HH:MM:SS`; the correction date comes as
  `M/D/YYYY 12:00:00 AM`.
- Text: a value wrapped in quotes loses them (part names); a tab becomes a
  space (comments).

### Performance Availability

- **Purpose in the source files:** daily Availability and Performance values.
  This report is not currently represented by a normalized source type.
- **Captured UI route:** `POST /api/v1/Report/ObjectByPeriod`, shared by all
  38 saved definitions. No dedicated Availability/Performance DataSetType
  was identified.
- **Retimed calls:** Reports 07 and 31 returned HTTP 200 with 43 and 21 rows;
  no row values were saved.
- **Empty-body probe:** `{}` returned HTTP 500.
- **Response schema:** no Swagger response schema.
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
