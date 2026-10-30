# 13. Hull Not Staffed, Scheduled & CAPEX times

## Name
Hull Not Staffed, Scheduled & CAPEX times

## Description
for monthly reporting

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
      "funcName": "fnGoodParts",
      "index": 2
    },
    {
      "funcName": "fnPlannedOpT",
      "index": 4
    },
    {
      "funcName": "fnOEECapacity",
      "index": 6
    },
    {
      "funcName": "fnLossTypeTime",
      "paramFunctionDisplayName": "Production Not Scheduled",
      "parameters": [
        "Production not scheduled",
        "Production Not Scheduled"
      ],
      "index": 7
    },
    {
      "funcName": "fnLossTypeTime",
      "paramFunctionDisplayName": "NPD / CapEx & Trials",
      "parameters": [
        "NPD/Capex & Trials",
        "NPD / CapEX & Trials"
      ],
      "index": 8
    },
    {
      "funcName": "fnLossTypeTime",
      "paramFunctionDisplayName": "Not Staffed Time",
      "parameters": [
        "Not staffed time",
        "Not Staffed Time"
      ],
      "index": 9
    },
    {
      "funcName": "fnPCLossTypeByPlannedOpT",
      "paramFunctionDisplayName": "Planned Loss",
      "parameters": [
        "Planned Loss"
      ],
      "index": 10
    },
    {
      "funcName": "fnPCLossTypeByPlannedOpT",
      "paramFunctionDisplayName": "Unplanned Loss",
      "parameters": [
        "Unplanned Loss",
        "Unplanned loss"
      ],
      "index": 11
    }
  ],
  "customFunctions": [
    {
      "customFuncName": "Accounted time",
      "customFunctionGuid": "57144eeb-fef3-4e62-af05-117157fd45b7",
      "index": 12,
      "customCalculation": "fnOEECapacity|+|paramfn_Planned Loss|+|paramfn_Unplanned Loss|"
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
