# 32. SAP OEE Targets

## Name
SAP OEE Targets

## Description
SAP OEE Targets

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
- **Rows:** 43 in `processedData`; response values were not saved.

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
          "215"
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
    },
    {
      "fieldName": "fdTargetRate"
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
      "funcName": "fnOEE",
      "index": 6
    },
    {
      "funcName": "fnAvailability",
      "index": 7
    },
    {
      "funcName": "fnPerformance",
      "index": 8
    },
    {
      "funcName": "fnQuality",
      "index": 9
    },
    {
      "funcName": "fnTarget",
      "index": 10
    },
    {
      "funcName": "fnTargetOEE",
      "index": 11
    },
    {
      "funcName": "fnTargetRate",
      "index": 12
    },
    {
      "funcName": "fnPCTarget",
      "index": 13
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
