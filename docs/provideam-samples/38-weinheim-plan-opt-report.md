# 38. Weinheim Plan OPT Report

## Name
Weinheim Plan OPT Report

## Description
Weinheim Plan OPT Report

## Endpoint(s)
POST [shared request details](Antoni%20Szklarski%20reports.md#shared-request-details).

## Parameters to replace
- `userId`: keep the UI-generated caller ID; change only for a different account.
- `objects[].objectParam.obMachineID`: choose the machine IDs in scope.
- `periods[].periodParam.pdDay`: set the requested report period.

## Example parameter to replace
- **Machine IDs:** use the IDs selected for the target site and line.
- **Period (pdDay):** use the requested period in the format shown in this payload.

## Live API result

- **Tested:** 2026-10-30
- **Request:** POST /api/v1/report/objectbyperiod
- **Period:** `pdDay` = `[2026-10-29T00:00:00]`.
- **Content-Type:** application/json-patch+json.
- **Other payload values:** saved caller, machine selection, fields and
  functions retained unchanged.
- **Result:** HTTP 200.
- **Rows:** 0 in `processedData`; response values were not saved.

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
        "pdDay": [
          "[2026-10-29T00:00:00]"
        ]
      }
    }
  ]
}
```
