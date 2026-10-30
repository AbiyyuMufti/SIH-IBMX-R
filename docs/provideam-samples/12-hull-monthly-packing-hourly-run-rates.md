# 12. Hull Monthly Packing Hourly Run Rates

## Name
Hull Monthly Packing Hourly Run Rates

## Description
Hull Monthly Packing Hourly Run Rates

## Endpoint(s)
POST [shared request details](Antoni%20Szklarski%20reports.md#shared-request-details).

## Parameters to replace
- `userId`: keep the UI-generated caller ID; change only for a different account.
- `objects[].objectParam.obMachineID`: choose the machine IDs in scope.
- `periods[].periodParam.pdMonth`: set the requested report period.

## Example parameter to replace
- **Machine IDs:** use the IDs selected for the target site and line.
- **Period (pdMonth):** use the requested period in the format shown in this payload.

Make sure to replace the period parameters with the correct format.

Example: "[2019-07-31T00:00:00]" or "[18,2019-07-31T00:00:00]" (if using ShiftID).

## Live API result

- **Tested:** 2026-10-30
- **Request:** POST /api/v1/report/objectbyperiod
- **Period:** `pdMonth` = `[10,2026]`.
- **Content-Type:** application/json-patch+json.
- **Other payload values:** saved caller, machine selection, fields and
  functions retained unchanged.
- **Result:** HTTP 200.
- **Rows:** 7889 in `processedData`; response values were not saved.

## SharePoint proof (2026-10-30): SUCCESS

- Rerun with `pdMonth` = `[9,2026]`, everything else unchanged, compared
  with the raw export `sharepoint/source_original/run_rates/site=Hull/Hull_Sep2026-monthly_run_rates.csv` (Hull Run Rates).
- Rows API / CSV: 7871 / 7871; every key matches, Good Parts equal per row.
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
        "pdMonth": [
          "[10,2026]"
        ]
      }
    }
  ]
}
```
