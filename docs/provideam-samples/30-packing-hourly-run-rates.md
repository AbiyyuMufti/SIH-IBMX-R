# 30. Packing Hourly Run Rates

## Name
Packing Hourly Run Rates

## Description
For Hourly Run Rate Average Estimation

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
- **Rows:** 181 in `processedData`; response values were not saved.

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
          "169",
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
          "275"
        ]
      }
    }
  ],
  "fields": [
    {
      "fieldName": "fdAreaName"
    },
    {
      "fieldName": "fdMachineName"
    },
    {
      "fieldName": "fdYYYYMMDDHH"
    },
    {
      "fieldName": "fdPartName"
    },
    {
      "fieldName": "fdShiftName"
    }
  ],
  "functions": [
    {
      "funcName": "fnGoodParts",
      "index": 2
    },
    {
      "funcName": "fnCapacity",
      "index": 4
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
