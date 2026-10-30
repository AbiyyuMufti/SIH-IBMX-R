# 14. Hull Site OEE Report (New Std) - Custom

## Name
Hull Site OEE Report (New Std) - Custom

## Description
Hull Site OEE Report with BUP

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
- **Period:** `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]`.
- **Content-Type:** application/json-patch+json.
- **Other payload values:** saved caller, machine selection, fields and
  functions retained unchanged.
- **Result:** HTTP 200.
- **Rows:** 23 in `processedData`; response values were not saved.

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
          "59",
          "65",
          "57",
          "58",
          "154",
          "317",
          "63",
          "221",
          "60",
          "64",
          "61",
          "24",
          "206",
          "30",
          "31",
          "203",
          "202",
          "42",
          "69",
          "68",
          "38",
          "39",
          "40",
          "200",
          "222",
          "275",
          "43"
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
      "index": 8
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Changeover",
      "parameters": [
        "Product Change Over"
      ],
      "index": 9
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
      "index": 10
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "In Process Control",
      "parameters": [
        "In process Quality Control"
      ],
      "index": 11
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Planned Maintenance",
      "parameters": [
        "Planned Maintenance"
      ],
      "index": 12
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Operator Asset Care",
      "parameters": [
        "Operator Asset Care",
        "Operater Asset Care"
      ],
      "index": 13
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Start up & Sanitisation",
      "parameters": [
        "Start Up and Sanitisation",
        "Start-up/End-up & Sanitization"
      ],
      "index": 14
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Refilling Materials",
      "parameters": [
        "Refilling Materials"
      ],
      "index": 15
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Lack of Resources",
      "parameters": [
        "Lack of resources",
        "Lack of Resource"
      ],
      "index": 16
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Quality Issues",
      "parameters": [
        "Quality Issues"
      ],
      "index": 17
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Adjustments",
      "parameters": [
        "Adjustment",
        "Adjustments"
      ],
      "index": 18
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Breakdown",
      "parameters": [
        "Breakdown - Electrical",
        "Breakdown - Mechanical"
      ],
      "index": 19
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Minor Stop",
      "parameters": [
        "Minor Stop"
      ],
      "index": 20
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Reduced Speed",
      "parameters": [
        "Reduced Speed"
      ],
      "index": 21
    },
    {
      "funcName": "fnPCLossSubGroupByCapacity",
      "paramFunctionDisplayName": "Other",
      "parameters": [
        "Other"
      ],
      "index": 22
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
