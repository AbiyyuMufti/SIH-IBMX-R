# Insights Hub API notes (Reckitt tenant)

| At a glance | |
|---|---|
| **What this is** | Documentation of the Siemens Insights Hub APIs used by the Reckitt OEE project, written from the Postman collections, Node-RED flows and a Python script, and **verified by calling them** |
| **Tenant and hosts** | `reckitt`. API gateway `https://gateway.eu1.mindsphere.io`, login `https://reckitt.piam.eu1.mindsphere.io` |
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
| [service-status.md](service-status.md) | Check the OEE service is up (`/health`, `/version`) | Tested |
| [assets.md](assets.md) | Find asset IDs and rebuild the hierarchy (OEE and Asset Management) | Tested (types: 403) |
| [timeseries.md](timeseries.md) | Read raw machine data | Tested on B2 Line |
| [manual-inputs.md](manual-inputs.md) | Read what operators entered (GT4, later Mira) | Tested on GT4 |
| [kpis.md](kpis.md) | Reports and KPIs, plus the formulas of all 34 expressions | Tested (3 calculation POSTs approved) |
| [config-and-master-data.md](config-and-master-data.md) | How OEE is set up; reason trees, calendars, products and other lists | Tested |
| [reference-tables.md](reference-tables.md) | The five reference tables (assets, reasons, products, shifts, KPI targets), the Config tab and the single flow that writes them | Dry run in the VFC |
| [logging.md](logging.md) | The CSV run log in the data lake (one file per month and flow) and the error catch | Mock only |
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
9. **Permissions.** The API technical user can read nearly everything but not Asset Management types (`/assettypes`, `/aspecttypes`: 403).
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
