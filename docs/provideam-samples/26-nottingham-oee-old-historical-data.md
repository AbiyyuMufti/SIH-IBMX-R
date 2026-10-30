# 26. Nottingham OEE OLD Historical DATA

## Name
Nottingham OEE OLD Historical DATA

## Description
bottom text

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
- **Rows:** 98 in `processedData`; response values were not saved.

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
      "fieldName": "fdMachineName"
    }
  ],
  "functions": [
    {
      "funcName": "fnOEE",
      "index": 2
    },
    {
      "funcName": "fnAvailability",
      "index": 4
    },
    {
      "funcName": "fnPerformance",
      "index": 5
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
