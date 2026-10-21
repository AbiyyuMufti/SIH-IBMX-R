# Insights Hub API notes (Reckitt tenant)

| At a glance | |
|---|---|
| **What this is** | Documentation of the Siemens Insights Hub APIs used by the Reckitt OEE project, written from the Postman collections, Node-RED flows and a Python script, and **verified by calling them** |
| **Tenant and hosts** | `reckitt`. Two platforms work (since the move of 2026-10-12): `legacy` (API `https://gateway.eu1.mindsphere.io`, login `https://reckitt.piam.eu1.mindsphere.io`) and `xcelerator` (API `https://api.eu1.siemens.app`, login `https://<tenant ID>.eu1.sws.siemens.com`). One switch chooses, see [platform-switch.md](platform-switch.md). The host names in the files below are the legacy ones |
| **Status** | All read-style OEE calls tested (2026-10-02, API technical user), 3 calculation POSTs tested, write calls deliberately not tested |
| **Auth** | One token request (POST), then `Authorization: Bearer <token>` on everything, see [auth.md](auth.md) |
| **Built for** | Reuse in Node-RED / Insights Hub function nodes. Every endpoint has a pasteable example |

## Start here
| You want | Open |
|---|---|
| A working Node-RED setup in 5 minutes (login, one reusable "call API" node, 4 example calls) | [quickstart.md](quickstart.md) |
| One call fast: method, path, params, returns | [endpoints.md](endpoints.md) |
| The detail and gotchas of one topic | the behaviour files below |
| Everything that exists, and what was not tested | [api-summary.md](api-summary.md) |

## Behaviour files (grouped by what you want to do)
| File | What you do with it | Status |
|---|---|---|
| [auth.md](auth.md) | Get and use a token | Tested |
| [platform-switch.md](platform-switch.md) | The `legacy` / `xcelerator` switch: addresses, token request, what was tested | Tested 2026-10-13, rebuilt flows not yet run in the VFC. Target platform: xcelerator (decision 2026-10-13) |
| [service-status.md](service-status.md) | Check the OEE service is up (`/health`, `/version`) | Tested |
| [assets.md](assets.md) | Find asset IDs and rebuild the hierarchy (OEE and Asset Management) | Tested (types: 403) |
| [timeseries.md](timeseries.md) | Read raw machine data | Tested on B2 Line |
| [manual-inputs.md](manual-inputs.md) | Read what operators entered (GT4, later Mira) | Tested on GT4 |
| [kpis.md](kpis.md) | Reports and KPIs, plus the formulas of all 34 expressions | Tested (3 calculation POSTs approved) |
| [config-and-master-data.md](config-and-master-data.md) | How OEE is set up; reason trees, calendars, products and other lists | Tested |
| [reference-tables.md](reference-tables.md) | The five reference tables (assets, reasons, products, shifts, KPI targets), the Config tab and the single flow that writes them | Dry run in the VFC |
| [powerbi-tables.md](powerbi-tables.md) | The flow that rebuilds the Power BI tables from our own tables, and which node makes which table | Mock only |
| [pbi-report-build.md](pbi-report-build.md) | The flow that builds the six pbi_* tables from the CSV files in the data lake (reference and normalized month files): jobs, rules taken from the report queries, checks against the report | Since 2026-10-20 the three Tableau tables; run in the VFC, backfill checked 2026-10-21 |
| [pbi-report-testing.md](pbi-report-testing.md) | How to test the whole flow in the VFC (order, expected log lines), how to check the written files, what to send back, notes for remote work | Written 2026-10-15 |
| [sih-report-daily.md](sih-report-daily.md) | SIH report daily tab: Plan_OPT_EU, Time_Utilisation_EU, Daily_Losses_EU per production day from the API, report columns, run hour per site, the 413 fallback and the known SIH / Provideam differences | Run in the VFC (Sep 2026), heavy days fail on the Siemens setup error |
| [powerbi-direct.md](powerbi-direct.md) | Two flows that write the Power BI tables straight from the API (daily per site, reference for all sites). Replaces the two-step chain | Mock only |
| [powerbi-model-findings.md](powerbi-model-findings.md) | What the existing EU Power BI report expects: keys, relationships, measures, decisions, open points; how to re-read its files with `scripts/helper-pbit-outline.js` | Findings (2026-10-13) |
| [powerbi-diagrams.md](powerbi-diagrams.md) | The draw.io map of every Power BI table: columns, examples, our column and the difference (empty, assumption, partly filled); how to refresh it | Built 2026-10-13 |
| [powerbi-source-files.md](powerbi-source-files.md) | Where the Power BI report reads its data (SharePoint folders), the format of the real Hull Plan OPT files and a comparison with our pbi_plan_opt | Explored 2026-10-13 |
| [provideam-source.md](provideam-source.md) | Provideam is the real source of the Hull board: reports, email, Power Automate, SharePoint; what differs from our assumptions | Read 2026-10-13 |
| [sharepoint-files.md](sharepoint-files.md) | What the downloaded SharePoint files contain, how the report uses them and how they fit Insights Hub (names, rules, coverage); what is completed and what is missing | Analysed 2026-10-14 |
| [report-config.md](report-config.md) | The Config of the EU report: root `eu_report`, sites and lines (asset ids from the `List SIH assets` button), `reportSource` per site and line, which flow writes where | Steps 1 to 4 built; 1 to 3 checked in the VFC, 4 run (Sep 2026) |
| [shift-report-flow.md](shift-report-flow.md) | The flow that writes the three shift report tables (`rpt_window`, `rpt_hour`, `rpt_event`) for the line and its machines, with a local production day | Run in the VFC (14, 15 Sep), checked against the OEE app |
| [lake-api.md](lake-api.md) | Python downloads parquet files or folder lists from the data lake through an `http in` endpoint of the VFC (spike checked in the VFC, final flow built) | Spike in the VFC |
| [datalake-files.md](datalake-files.md) | List, download and upload data lake files from a script with signed URLs (`scripts/datalake-download.js`, `datalake-upload.js`) | Tested 2026-10-14 on xcelerator: list, download and upload work |
| [logging.md](logging.md) | The CSV run log in the data lake (one file per month and flow) and the error catch | Mock only |
| [run-monitor.md](run-monitor.md) | Report status, monthly log history and validated backfill commands; VFC access keys and link wiring | Built and mock-tested offline; VFC runtime check remains |
| [fact-flows.md](fact-flows.md) | The per-site flows that write `fact_kpi` and `fact_loss`, and how to add a site | Hull, dry run in the VFC |

## Reference and background
| File | Contents |
|---|---|
| [endpoints.md](endpoints.md) | Flat table of every tested call, plus conventions (headers, units, paging, errors) |
| [api-summary.md](api-summary.md) | What exists across all sources, coverage by service, the untested write calls |
| [inventory.md](inventory.md) | Per-source-file lists of every outbound call (`inventory/`), including Node-RED tab and node names |
| [auth-checklist.md](auth-checklist.md) | Where each credential comes from in the source files (locations only) and questions for your colleague |
| [test-log.md](test-log.md) | How each finding was obtained: script, sample and result per test |

## Ten things to know before calling anything
1. **Token first.** A POST gives a Bearer token valid about 30 minutes. Even `/version` returns 403 without it.
2. **Asset Management needs `Accept: application/hal+json`.** With `application/json` it fails with HTTP 500. The OEE and Time Series services want `application/json`.
3. **Use IDs, not names.** `assetId` is the same in all services, names repeat (two assets called `GT4`).
4. **Paging differs.** OEE lists are not paged (`size` and `page` are ignored). Asset Management is paged (`size`, `page` from 0). Time Series has `limit` max 2000 and a range max 90 days: it cuts silently, so read in windows.
5. **Units.** OEE durations are milliseconds (sometimes as text), ratios are fractions (1 = 100 %), hourly operator entries use minutes.
6. **Not everything is an OEE asset.** Sites such as `Hull` are not: OEE answers 404, or an empty `/config` with HTTP 200.
7. **Automatic vs manual assets.** B2 Line is connected (MindConnect), GT4 is manual (operator form). `timeModelCategoryDistribution` refuses manual assets; operator-input reads only show data for manual ones.
8. **KPI calls only calculate.** `evaluateKPIs` and the other two POSTs store nothing, but the numbers depend on configuration: B2 Line showed Performance above 100 %, so check before trusting them.
9. **Permissions.** The API technical user can read nearly everything. Asset Management types (`/assettypes`, `/aspecttypes`) gave 403 on 2026-10-02 but HTTP 200 on 2026-10-13 (both platforms): see [platform-switch.md](platform-switch.md).
10. **Personal data.** `OEE_Hourly_Entry` holds `ActorEmail`; manual inputs hold user IDs. Mask them before sharing data.

Postman marks `/version` as "no auth" and expects `/application/settings` to exist. Both are wrong for this tenant.

## Conventions used in these files
- **Tested** = called on the Reckitt tenant and verified, with the date. **From source only** = found in Postman, flows or the Python script, not called. Do not treat the second as verified.
- **Inferred** = a meaning guessed from names and data, not from product documentation. These are marked in the text.
- No secrets, tokens or real IDs appear here. IDs are `<id>` or `{assetId}`. Asset and machine names are real.
- Examples are Node-RED function-node code. In Insights Hub you may use `tenant.get/set` instead of `flow.get/set`, as the source flows do.

## Where things live in the repository
| Path | What |
|---|---|
| `docs/` | These files |
| `scripts/` | Node 18 scripts that made the calls (`test-*.js`), shared helpers (`lib-*.js`), and read-only parsers (`helper-*.js`) |
| `samples/` | Redacted real responses (gitignored, local only) |
| `source/` | The original Postman, Node-RED and Python files (read-only, gitignored) |
| `.env` | Credentials (gitignored). Names are listed in [auth-checklist.md](auth-checklist.md) |
| `NOTES.md` | Working notes, decisions, open questions |
