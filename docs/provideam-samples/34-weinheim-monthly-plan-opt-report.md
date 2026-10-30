# 34. Weinheim Monthly Plan OPT Report

## Name
Weinheim Monthly Plan OPT Report

## Description
Weinheim Monthly Plan OPT Report

## Endpoint(s)
POST [shared request details](Antoni%20Szklarski%20reports.md#shared-request-details).

## Parameters to replace
- `userId`: keep the UI-generated caller ID; change only for a different account.
- `objects[].objectParam.obMachineID`: choose the machine IDs in scope.
- `periods[].periodParam.pdMonth`: set the requested report period.

## Example parameter to replace
- **Machine IDs:** use the IDs selected for the target site and line.
- **Period (pdMonth):** use the requested period in the format shown in this payload.

## Live API result

- **Tested:** 2026-10-30
- **Request:** POST /api/v1/report/objectbyperiod
- **Period:** `pdMonth` = `[10,2026]`.
- **Content-Type:** application/json-patch+json.
- **Other payload values:** saved caller, machine selection, fields and
  functions retained unchanged.
- **Result:** HTTP 200.
- **Rows:** 93 in `processedData`; response values were not saved.

## SharePoint proof (2026-10-30): SUCCESS

- Rerun with `pdMonth` = `[9,2026]`, everything else unchanged, compared
  with the raw export `sharepoint/source_original/plan_opt/site=Weinheim/ (Sep 2026 file)` (Weinheim Plan OPT).
- Rows API / CSV: 124 / 124; every key matches, Good Parts equal per row.
- **Gotchas:** the API adds one grand-total row; it returns raw values (OEE as
  a fraction, times in seconds, ISO timestamps) where the export shows
  `57.3%`, `08:00:00`, `01/09/2026 06:00:00` and thousands separators.
  Run-rate Capacity is rounded per hour in the export.

## JSON payload

```json
{
  "userId": 2908,
  "formattedJson": false,
  "applyStdTimeCorrection": true,
  "includeGrandTotals": false,
  "objects": [
    {
      "objectParam": {
        "obMachineID": [
          "261",
          "263",
          "264",
          "265",
          "266",
          "267"
        ]
      }
    }
  ],
  "fields": [
    {
      "fieldName": "fdYYYYMMDD"
    },
    {
      "fieldName": "fdAreaName"
    },
    {
      "fieldName": "fdMachineName"
    },
    {
      "fieldName": "fdShiftName"
    },
    {
      "fieldName": "fdShiftStartTime"
    },
    {
      "fieldName": "fdPartName"
    }
  ],
  "functions": [
    {
      "funcName": "fnGoodParts",
      "index": 2
    },
    {
      "funcName": "fnDefectParts",
      "index": 4
    },
    {
      "funcName": "fnTarget",
      "index": 6
    },
    {
      "funcName": "fnCapacity",
      "index": 8
    },
    {
      "funcName": "fnOEE",
      "index": 10
    },
    {
      "funcName": "fnTotalTime",
      "index": 12
    },
    {
      "funcName": "fnPlannedOpT",
      "index": 13
    },
    {
      "funcName": "fnOEETime",
      "index": 14
    },
    {
      "funcName": "fnDowntimeUnits",
      "index": 15
    }
  ],
  "periods": [
    {
      "periodParam": {
        "pdMonth": [
          "[10,2026]"
        ]
      }
    }
  ]
}
```
