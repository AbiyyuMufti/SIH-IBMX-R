# 28. Nottingham Plan OPT Report

## Name
Nottingham Plan OPT Report

## Description
Nottingham Plan OPT Report

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
- **Rows:** 74 in `processedData`; response values were not saved.

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
          "250",
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
        "pdDay": [
          "[2026-10-29T00:00:00]"
        ]
      }
    }
  ]
}
```
