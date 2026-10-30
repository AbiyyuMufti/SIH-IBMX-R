## Shared request details

- **Method:** POST
- **Endpoint:** `https://rb-api.provideam.com/api/v1/Report/ObjectByPeriod`
- All 38 report definitions use this endpoint. Each linked file keeps its
  own UI-captured JSON payload; there are 37 distinct payloads, with reports
  35 and 36 currently identical.
- The values that may need changing are the caller `userId`, the machine
  selection at `objects[].objectParam.obMachineID`, and the selected period
  under `periods[].periodParam`. The period selector differs by report.

## Retimed API results (2026-10-30)

All 38 requests used the saved report body with only its period value
replaced. The saved `userId`, machine selection and report fields/functions
were kept unchanged. All requests used
`Content-Type: application/json-patch+json`.

For `pdDay`, the date was `[2026-10-29T00:00:00]`; for `pdCustom`, the
date window was `[2026-10-28T00:00:00,2026-10-29T00:00:00]`; for
`pdMonth`, the value was `[10,2026]`. Reports 15-22 were also retried:
report 15 with `[2026-10-29T00:00:00,2026-10-30T00:00:00]` and reports
16-22 with the full October window
`[2026-10-01T00:00:00,2026-11-01T00:00:00]`; all eight still returned
HTTP 500. Row counts of zero below are HTTP 200 responses with an empty
`processedData` array.

| No. | Report | Period used for latest result | Result |
|---:|---|---|---|
| 01 | B2 Packing Hourly Run Rates | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 37 processedData rows |
| 02 | Bottles SKU / Batch Search | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 12 processedData rows |
| 03 | Custom Dates New Plan OPT Report | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 64 processedData rows |
| 04 | Custom Nottingham Packing Hourly Run Rates | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 1388 processedData rows |
| 05 | Custom Nottingham Plan OPT Report | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 191 processedData rows |
| 06 | Custom Packing Hourly Run Rates | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 468 processedData rows |
| 07 | Custom PERFORMANCE AVAILABILITY DAILY REPORT | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 43 processedData rows |
| 08 | Custom Weinheim Packing Hourly Run Rates | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 0 processedData rows |
| 09 | Custom Weinheim Plan OPT Report | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 0 processedData rows |
| 10 | Gemma Nottingham Plan OPT Report | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 73 processedData rows |
| 11 | Hull Monthly New Plan OPT Report | `pdMonth` = `[10,2026]` | HTTP 200; 1031 processedData rows |
| 12 | Hull Monthly Packing Hourly Run Rates | `pdMonth` = `[10,2026]` | HTTP 200; 7889 processedData rows |
| 13 | Hull Not Staffed, Scheduled & CAPEX times | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 23 processedData rows |
| 14 | Hull Site OEE Report (New Std) - Custom | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 23 processedData rows |
| 15 | Hull Site OEE Report Detail for Checks | `pdCustom` = `[2026-10-29T00:00:00,2026-10-30T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (32 rows each), see gotcha below |
| 16 | Monthly Blisters Glidepath Hull Site OEE | `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (7 rows each), see gotcha below |
| 17 | Monthly Bottles Glidepath Hull Site OEE | `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (9 rows each), see gotcha below |
| 18 | Monthly Glidepath Hull Site | `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (23 rows each), see gotcha below |
| 19 | Monthly Sachets Glidepath Hull Site OEE | `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (7 rows each), see gotcha below |
| 20 | Monthly Sticks Glidepath Hull Site OEE Report | `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (7 rows each), see gotcha below |
| 21 | Monthly Tubes Glidepath Hull Site OEE | `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (4 rows each), see gotcha below |
| 22 | Monthly Tubs Glidepath Hull Site OEE | `pdCustom` = `[2026-10-01T00:00:00,2026-11-01T00:00:00]` | HTTP 500 as saved; **SUCCESS split in two calls** (0 rows each), see gotcha below |
| 23 | New Plan OPT Report | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 30 processedData rows |
| 24 | Nottingham Monthly Hourly Run Rates | `pdMonth` = `[10,2026]` | HTTP 200; 18500 processedData rows |
| 25 | Nottingham Monthly Plan OPT Report | `pdMonth` = `[10,2026]` | HTTP 200; 2580 processedData rows |
| 26 | Nottingham OEE OLD Historical DATA | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 98 processedData rows |
| 27 | Nottingham Packing Hourly Run Rates | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 536 processedData rows |
| 28 | Nottingham Plan OPT Report | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 74 processedData rows |
| 29 | OEE OLD Historical DATA | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 58 processedData rows |
| 30 | Packing Hourly Run Rates | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 181 processedData rows |
| 31 | PERFORMANCE AVAILABILITY DAILY REPORT | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 21 processedData rows |
| 32 | SAP OEE Targets | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 43 processedData rows |
| 33 | Weinheim Monthly Hourly Run Rates | `pdMonth` = `[10,2026]` | HTTP 200; 687 processedData rows |
| 34 | Weinheim Monthly Plan OPT Report | `pdMonth` = `[10,2026]` | HTTP 200; 93 processedData rows |
| 35 | Weinheim OEE OLD Historical DATA | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 0 processedData rows |
| 36 | Weinheim OEE OLD Historical DATA | `pdCustom` = `[2026-10-28T00:00:00,2026-10-29T00:00:00]` | HTTP 200; 0 processedData rows |
| 37 | Weinheim Packing Hourly Run Rates | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 0 processedData rows |
| 38 | Weinheim Plan OPT Report | `pdDay` = `[2026-10-29T00:00:00]` | HTTP 200; 0 processedData rows |

### Gotcha: more than 18 functions

Reports 15-22 have 20 entries in `functions`. Provideam returns HTTP 500 with
an empty body for more than 18 (bisected on 2026-10-30). Split the request in
two calls of at most 18 functions with the same fields, machines and period,
and join on the field columns. Both halves returned HTTP 200 for all eight.

### SharePoint proof (2026-10-30)

Reports 11/12 (Hull), 25/24 (Nottingham) and 34/33 (Weinheim) for September
2026 equal the raw monthly Plan OPT / Run Rates exports in
`sharepoint/source_original/` row for row. Line Losses and Volume Loss
Correction are not produced by any of these 38 definitions.

| No. | Report | Description | Template |
|-----|--------|-------------|----------|
| 01 | B2 Packing Hourly Run Rates | For Hourly Run Rate Average Estimation | [01-b2-packing-hourly-run-rates.md](01-b2-packing-hourly-run-rates.md) |
| 02 | Bottles SKU / Batch Search | Hull Liquids SKU Batch | [02-bottles-sku-batch-search.md](02-bottles-sku-batch-search.md) |
| 03 | Custom Dates New Plan OPT Report | New Plan OPT Report | [03-custom-dates-new-plan-opt-report.md](03-custom-dates-new-plan-opt-report.md) |
| 04 | Custom Nottingham Packing Hourly Run Rates | For Hourly Run Rate Average Estimation | [04-custom-nottingham-packing-hourly-run-rates.md](04-custom-nottingham-packing-hourly-run-rates.md) |
| 05 | Custom Nottingham Plan OPT Report | Nottingham Plan OPT Report | [05-custom-nottingham-plan-opt-report.md](05-custom-nottingham-plan-opt-report.md) |
| 06 | Custom Packing Hourly Run Rates | For Hourly Run Rate Average Estimation | [06-custom-packing-hourly-run-rates.md](06-custom-packing-hourly-run-rates.md) |
| 07 | Custom PERFORMANCE AVAILABILITY DAILY REPORT | bottom text | [07-custom-performance-availability-daily-report.md](07-custom-performance-availability-daily-report.md) |
| 08 | Custom Weinheim Packing Hourly Run Rates | For Hourly Run Rate Average Estimation | [08-custom-weinheim-packing-hourly-run-rates.md](08-custom-weinheim-packing-hourly-run-rates.md) |
| 09 | Custom Weinheim Plan OPT Report | Weinheim Plan OPT Report | [09-custom-weinheim-plan-opt-report.md](09-custom-weinheim-plan-opt-report.md) |
| 10 | Gemma Nottingham Plan OPT Report | Gemma Nottingham Plan OPT Report | [10-gemma-nottingham-plan-opt-report.md](10-gemma-nottingham-plan-opt-report.md) |
| 11 | Hull Monthly New Plan OPT Report | Hull Monthly New Plan OPT Report | [11-hull-monthly-new-plan-opt-report.md](11-hull-monthly-new-plan-opt-report.md) |
| 12 | Hull Monthly Packing Hourly Run Rates | Hull Monthly Packing Hourly Run Rates | [12-hull-monthly-packing-hourly-run-rates.md](12-hull-monthly-packing-hourly-run-rates.md) |
| 13 | Hull Not Staffed, Scheduled & CAPEX times | for monthly reporting | [13-hull-not-staffed-scheduled-capex-times.md](13-hull-not-staffed-scheduled-capex-times.md) |
| 14 | Hull Site OEE Report (New Std) - Custom | Hull Site OEE Report with BUP | [14-hull-site-oee-report-new-std-custom.md](14-hull-site-oee-report-new-std-custom.md) |
| 15 | Hull Site OEE Report Detail for Checks | Hull Site OEE Report (New Std) - Daily | [15-hull-site-oee-report-detail-for-checks.md](15-hull-site-oee-report-detail-for-checks.md) |
| 16 | Monthly Blisters Glidepath Hull Site OEE | Hull Site OEE Report (New Std) - Daily | [16-monthly-blisters-glidepath-hull-site-oee.md](16-monthly-blisters-glidepath-hull-site-oee.md) |
| 17 | Monthly Bottles Glidepath Hull Site OEE | Hull Site OEE Report (New Std) - Daily | [17-monthly-bottles-glidepath-hull-site-oee.md](17-monthly-bottles-glidepath-hull-site-oee.md) |
| 18 | Monthly Glidepath Hull Site | Hull Site OEE Report (New Std) - Daily | [18-monthly-glidepath-hull-site.md](18-monthly-glidepath-hull-site.md) |
| 19 | Monthly Sachets Glidepath Hull Site OEE | Hull Site OEE Report (New Std) - Daily | [19-monthly-sachets-glidepath-hull-site-oee.md](19-monthly-sachets-glidepath-hull-site-oee.md) |
| 20 | Monthly Sticks Glidepath Hull Site OEE Report | Hull Site OEE Report (New Std) - Daily | [20-monthly-sticks-glidepath-hull-site-oee-report.md](20-monthly-sticks-glidepath-hull-site-oee-report.md) |
| 21 | Monthly Tubes Glidepath Hull Site OEE | Hull Site OEE Report (New Std) - Daily | [21-monthly-tubes-glidepath-hull-site-oee.md](21-monthly-tubes-glidepath-hull-site-oee.md) |
| 22 | Monthly Tubs Glidepath Hull Site OEE | Hull Site OEE Report (New Std) - Daily | [22-monthly-tubs-glidepath-hull-site-oee.md](22-monthly-tubs-glidepath-hull-site-oee.md) |
| 23 | New Plan OPT Report | New Plan OPT Report | [23-new-plan-opt-report.md](23-new-plan-opt-report.md) |
| 24 | Nottingham Monthly Hourly Run Rates | Nottingham Monthly Run Rates | [24-nottingham-monthly-hourly-run-rates.md](24-nottingham-monthly-hourly-run-rates.md) |
| 25 | Nottingham Monthly Plan OPT Report | Nottingham Monthly Plan OPT Report | [25-nottingham-monthly-plan-opt-report.md](25-nottingham-monthly-plan-opt-report.md) |
| 26 | Nottingham OEE OLD Historical DATA | bottom text | [26-nottingham-oee-old-historical-data.md](26-nottingham-oee-old-historical-data.md) |
| 27 | Nottingham Packing Hourly Run Rates | For Hourly Run Rate Average Estimation | [27-nottingham-packing-hourly-run-rates.md](27-nottingham-packing-hourly-run-rates.md) |
| 28 | Nottingham Plan OPT Report | Nottingham Plan OPT Report | [28-nottingham-plan-opt-report.md](28-nottingham-plan-opt-report.md) |
| 29 | OEE OLD Historical DATA | bottom text | [29-oee-old-historical-data.md](29-oee-old-historical-data.md) |
| 30 | Packing Hourly Run Rates | For Hourly Run Rate Average Estimation | [30-packing-hourly-run-rates.md](30-packing-hourly-run-rates.md) |
| 31 | PERFORMANCE AVAILABILITY DAILY REPORT | bottom text | [31-performance-availability-daily-report.md](31-performance-availability-daily-report.md) |
| 32 | SAP OEE Targets | SAP OEE Targets | [32-sap-oee-targets.md](32-sap-oee-targets.md) |
| 33 | Weinheim Monthly Hourly Run Rates | Weinheim Monthly Hourly Run Rates | [33-weinheim-monthly-hourly-run-rates.md](33-weinheim-monthly-hourly-run-rates.md) |
| 34 | Weinheim Monthly Plan OPT Report | Weinheim Monthly Plan OPT Report | [34-weinheim-monthly-plan-opt-report.md](34-weinheim-monthly-plan-opt-report.md) |
| 35 | Weinheim OEE OLD Historical DATA | bottom text | [35-weinheim-oee-old-historical-data.md](35-weinheim-oee-old-historical-data.md) |
| 36 | Weinheim OEE OLD Historical DATA | bottom text | [36-weinheim-oee-old-historical-data.md](36-weinheim-oee-old-historical-data.md) |
| 37 | Weinheim Packing Hourly Run Rates | For Hourly Run Rate Average Estimation | [37-weinheim-packing-hourly-run-rates.md](37-weinheim-packing-hourly-run-rates.md) |
| 38 | Weinheim Plan OPT Report | Weinheim Plan OPT Report | [38-weinheim-plan-opt-report.md](38-weinheim-plan-opt-report.md) |