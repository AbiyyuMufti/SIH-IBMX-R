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
- **Skipped:** The equivalent call for machine B was not made after the error.
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

- **Report request sent:** `POST /api/v1/report/objectbyperiod`, JSON body
  `{}`.
- **Result:** HTTP 500. No report rows or usable response schema were
  obtained.
- **Sample:** `samples/provideam/objectbyperiod-empty-request.json`.
- **Skipped after error:** The other candidate report POSTs were not called:
  `objectbyperiodandloss`, `periodbyobject`, `periodbyobjectandloss`,
  `objectmodelog`, `objectyieldlog` and `currentstatus`. The investigation
  stopped after this was the second HTTP 500 observed, as required.
- **Not established:** Valid `dataSetType` values, report request contents,
  report response columns, dates, numeric values and row counts.

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

Not proven. Hierarchy and most machine/reference GETs work, but no report call
returned usable rows. Therefore no API output was compared with the
normalized SharePoint source for row counts, columns, daily boundaries,
numeric sums, formatted values, machine-name exclusions or Mode Log comments.
See [provideam-report-mapping.md](../provideam-report-mapping.md) for the
comparison checklist and the request to ask the Provideam API owner.
