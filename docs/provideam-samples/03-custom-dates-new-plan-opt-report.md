# 03. Custom Dates New Plan OPT Report

## Name
Custom Dates New Plan OPT Report

## Description
New Plan OPT Report

## Endpoint(s)
POST [shared request details](Antoni%20Szklarski%20reports.md#shared-request-details).

## Parameters to replace
- `userId`: keep the UI-generated caller ID; change only for a different account.
- `objects[].objectParam.obMachineID`: choose the machine IDs in scope.
- `periods[].periodParam.pdCustom`: set the requested report period.

## Example parameter to replace
- **Machine IDs:** use the IDs selected for the target site and line.
- **Period (pdCustom):** use the requested period in the format shown in this payload.

Make sure to replace the period parameters with the correct format.

Example: "[2019-07-31T00:00:00]" or "[18,2019-07-31T00:00:00]" (if using ShiftID).

## Live API result

- **Tested:** 2026-10-30
- **Request:** POST /api/v1/report/objectbyperiod
- **Period:** `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]`.
- **Content-Type:** application/json-patch+json.
- **Other payload values:** saved caller, machine selection, fields and
  functions retained unchanged.
- **Result:** HTTP 200.
- **Rows:** 64 in `processedData`; response values were not saved.

## JSON payload

```json
{
  "userId": 2908,
  "formattedJson": false,
  "applyStdTimeCorrection": true,
  "includeGrandTotals": true,
  "objects": [
    {
      "objectParam": {
        "obMachineID": [
          "297",
          "164",
          "165",
          "59",
          "65",
          "57",
          "58",
          "167",
          "166",
          "269",
          "270",
          "209",
          "210",
          "154",
          "317",
          "63",
          "207",
          "221",
          "60",
          "64",
          "169",
          "61",
          "213",
          "214",
          "211",
          "24",
          "206",
          "30",
          "31",
          "203",
          "202",
          "42",
          "69",
          "68",
          "218",
          "216",
          "212",
          "38",
          "39",
          "40",
          "200",
          "222",
          "275",
          "249",
          "215",
          "43"
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
        "pdCustom": [
          "[2026-10-28T00:00:00,2026-10-29T00:00:00]"
        ]
      }
    }
  ]
}
```
