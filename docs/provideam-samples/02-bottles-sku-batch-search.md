# 02. Bottles SKU / Batch Search

## Name
Bottles SKU / Batch Search

## Description
Hull Liquids SKU Batch

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
- **Rows:** 12 in `processedData`; response values were not saved.

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
          "24",
          "30",
          "31",
          "203",
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
      "fieldName": "fdPlantName"
    },
    {
      "fieldName": "fdAreaName"
    },
    {
      "fieldName": "fdMachineName"
    },
    {
      "fieldName": "fdPartDesc"
    },
    {
      "fieldName": "fdBatchName"
    }
  ],
  "functions": [
    {
      "funcName": "fnPlannedOpT",
      "index": 2
    },
    {
      "funcName": "fnGoodParts",
      "index": 4
    },
    {
      "funcName": "fnCapacity",
      "index": 6
    },
    {
      "funcName": "fnOEECapacity",
      "index": 12
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Quality Issues",
      "parameters": [
        "Quality Issues"
      ],
      "index": 13
    }
  ],
  "customFunctions": [
    {
      "customFuncName": "Hourly Run Rate Cap/OpT",
      "customFunctionGuid": "b1d5b3f0-8ab7-4ceb-be9a-73af59d27d1c",
      "index": 8,
      "customCalculation": "fnCapacity|/|fnPlannedOpT|*|3600|"
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
