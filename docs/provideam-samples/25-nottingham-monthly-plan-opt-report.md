# 25. Nottingham Monthly Plan OPT Report

## Name
Nottingham Monthly Plan OPT Report

## Description
Nottingham Monthly Plan OPT Report

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
- **Rows:** 2580 in `processedData`; response values were not saved.

## SharePoint proof (2026-10-30): SUCCESS

- Rerun with `pdMonth` = `[9,2026]`, everything else unchanged, compared
  with the raw export `sharepoint/source_original/plan_opt/site=Nottingham/Sep2026-notts_monthly_opt_volume.csv` (Nottingham Plan OPT).
- Rows API / CSV: 2744 / 2744; every key matches, Good Parts equal per row.
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
          "32",
          "33",
          "34",
          "20",
          "22",
          "12",
          "19",
          "170",
          "140",
          "311",
          "25",
          "84",
          "246",
          "18",
          "49",
          "141",
          "142",
          "9",
          "54",
          "13",
          "55",
          "56",
          "47",
          "177",
          "85",
          "127",
          "50",
          "51",
          "53",
          "89",
          "120",
          "119",
          "124",
          "125",
          "122",
          "123",
          "121",
          "52",
          "243",
          "80",
          "298",
          "253",
          "254",
          "312",
          "105",
          "102",
          "103",
          "117",
          "106",
          "129",
          "190",
          "115",
          "107",
          "108",
          "104",
          "114",
          "155",
          "70",
          "78",
          "99",
          "101",
          "100",
          "90",
          "96",
          "98",
          "97",
          "91",
          "92",
          "94",
          "95",
          "93",
          "86",
          "88"
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
