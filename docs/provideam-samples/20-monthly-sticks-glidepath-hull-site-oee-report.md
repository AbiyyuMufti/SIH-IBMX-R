# 20. Monthly Sticks Glidepath Hull Site OEE Report

## Name
Monthly Sticks Glidepath Hull Site OEE Report

## Description
Hull Site OEE Report (New Std) - Daily

## Endpoint(s)
POST [shared request details](Antoni%20Szklarski%20reports.md#shared-request-details).

## Parameters to replace
- `userId`: keep the UI-generated caller ID; change only for a different account.
- `objects[].objectParam.obMachineID`: choose the machine IDs in scope.
- `periods[].periodParam.pdCustom`: set the requested report period.

## Example parameter to replace
- **Machine IDs:** use the IDs selected for the target site and line.
- **Period (pdCustom):** use the requested period in the format shown in this payload.

## Live API result

- **Tested:** 2026-10-30
- **Request:** POST /api/v1/report/objectbyperiod
- **Period:** `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]`.
- **Content-Type:** application/json-patch+json.
- **Other payload values:** saved caller, machine selection, fields and
  functions retained unchanged.
- **Result:** HTTP 500.
- **Rows:** No `processedData` row array returned; response values were
  not saved.

## Retry 2026-10-30: SUCCESS with a split

- **Status:** SUCCESS when split into two calls; the body as saved still
  returns HTTP 500.
- **Gotcha:** Provideam returns HTTP 500 (empty body) when `functions` has
  more than 18 entries. This body has 20. Found by bisecting report 15: 18
  functions = HTTP 200, 19 = HTTP 500, whichever subgroups are taken. Not the
  custom function, grand totals, subtotals or the period type.
- **Working requests:** same fields, machines, period and custom function;
  call A without the two `fnPCLossGroupByCapacity` entries, call B with only
  those two (custom function dropped). Join A and B on the field columns.
- **Result:** both calls HTTP 200, 7 rows each for
  `pdCustom` = `[2026-10-29T00:00:00,2026-10-30T00:00:00]`.

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
          "38",
          "39",
          "40",
          "200",
          "222",
          "275"
        ]
      }
    }
  ],
  "fields": [
    {
      "fieldName": "fdPlantName",
      "subtotal": true
    },
    {
      "fieldName": "fdAreaName",
      "subtotal": true
    },
    {
      "fieldName": "fdMachineName"
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
      "index": 9
    },
    {
      "funcName": "fnPCLossGroupByCapacity",
      "paramFunctionDisplayName": "Planned Loss",
      "parameters": [
        "Planned Loss"
      ],
      "index": 10
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Changeover",
      "parameters": [
        "Product Change Over"
      ],
      "index": 11
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Meals & Breaks",
      "parameters": [
        "Meal & Breaks",
        "Breaks and Meal",
        "Meals & Breaks",
        "Meal Break"
      ],
      "index": 12
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "In Process Control",
      "parameters": [
        "In process Quality Control"
      ],
      "index": 13
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Planned Maintenance",
      "parameters": [
        "Planned Maintenance"
      ],
      "index": 14
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Operator Asset Care",
      "parameters": [
        "Operator Asset Care",
        "Operater Asset Care"
      ],
      "index": 15
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Start up & Sanitisation",
      "parameters": [
        "Start Up and Sanitisation",
        "Start-up/End-up & Sanitization"
      ],
      "index": 16
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Refilling Materials",
      "parameters": [
        "Refilling Materials"
      ],
      "index": 17
    },
    {
      "funcName": "fnPCLossGroupByCapacity",
      "paramFunctionDisplayName": "Unplanned Loss",
      "parameters": [
        "Unplanned Loss"
      ],
      "index": 18
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Lack of Resources",
      "parameters": [
        "Lack of resources",
        "Lack of Resource"
      ],
      "index": 19
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Quality Issues",
      "parameters": [
        "Quality Issues"
      ],
      "index": 20
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Adjustments",
      "parameters": [
        "Adjustment",
        "Adjustments"
      ],
      "index": 21
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Breakdown",
      "parameters": [
        "Breakdown - Electrical",
        "Breakdown - Mechanical"
      ],
      "index": 22
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Minor Stop",
      "parameters": [
        "Minor Stop"
      ],
      "index": 23
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Reduced Speed",
      "parameters": [
        "Reduced Speed"
      ],
      "index": 24
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Other",
      "parameters": [
        "Other"
      ],
      "index": 25
    }
  ],
  "customFunctions": [
    {
      "customFuncName": "Hourly Run Rate Cap/OpT",
      "customFunctionGuid": "b1d5b3f0-8ab7-4ceb-be9a-73af59d27d1c",
      "index": 7,
      "customCalculation": "fnCapacity|/|fnPlannedOpT|*|3600|"
    }
  ],
  "periods": [
    {
      "periodParam": {
        "pdCustom": [
          "[2026-10-01T00:00:00,2026-11-01T00:00:00]"
        ]
      }
    }
  ]
}
```
