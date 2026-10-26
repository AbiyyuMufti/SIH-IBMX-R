# Report scope: which rows the EU pages show (column `In EU Report`)

| At a glance | |
|---|---|
| **What** | One CSV file holds the EU report rules per site and table. Every report table keeps all rows and gets the column `In EU Report` (true / false) instead of dropping the rows the EU report leaves out. The EU pages filter `In EU Report = true`; the site pages (Hull, Nottingham) use every row |
| **File** | Repo: `config/report_scope.csv` (the master, committed). Lake: `eu_report/reference/report_scope/site=All/report_scope.csv` (what the flows read, newest `.csv` of the folder) |
| **Read by** | PBI report build, lane `SITE SETUP: REPORT SCOPE` (node `Build scope lookup`), applied in the node `Add machine and scope columns` of every table lane. The Config view of the run monitor shows the file ([run-monitor.md](run-monitor.md)) |
| **Tables** | `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU`, `Run_Rates_EU`, `Volume_CoV_EU` |
| **Status** | Built 2026-10-27, offline proof on the real files (below). Not run in the VFC yet. The file must be uploaded before the next run: without it every site fails with `no csv file in .../report_scope/site=All/` |
| **Change a rule** | Edit `config/report_scope.csv`, upload it (command below), rerun the months. No flow change |

## The file
One row per rule.

| Column | Meaning |
|---|---|
| `Site` | Site name as in `1.1 CONFIG` |
| `Tables` | One table or several separated by `;` |
| `Rule` | `keep` or `drop` |
| `Column` | The row column the rule looks at: `MachineName` or `AreaName` (plan and run rates rows have `AreaName`) |
| `Value` | The value. Compared without leading or trailing spaces (the source has `Bosch Capsulator ` and ` Strepsils Packing`) |
| `Why` | Free text for the reader, not used |

A row is `In EU Report = true` when, for every column that has `keep` rules, its value is one of the kept values, and no `drop` rule matches. A table with no rule for a site is fully true.

## Rules in the file (the EU report queries, unchanged)
| Site | Table | Rule |
|---|---|---|
| Hull | Plan OPT, Time Utilisation, Daily Losses, Volume CoV | drop the 19 process machines (`Analgesics X Press` is not in the EU Volume CoV list, so not for that table) |
| Hull | Run Rates | drop `Senokot Press` |
| Nottingham | Plan OPT | keep areas `Strepsils Packing`, `SD Packing`; drop `S14` |
| Nottingham | Time Utilisation | keep the 23 packing lines |
| Nottingham | Daily Losses | drop 8 manufacturing machines and `S14` |
| Nottingham | Volume CoV | drop 13 manufacturing machines and `S14` |
| Nottingham | Run Rates | drop `S14` |
| Weinheim | all | no rule: all true |

Still dropped in the flow itself, because the site reports drop them too: `GT4 - Auto` (Hull plan, time utilisation, Volume CoV), `N11 Auto` (Nottingham and Weinheim plan, Nottingham time utilisation and Volume CoV), `B1 - Auto`, `B4 Auto`, `B5 Auto` (losses), rows without a machine.

## Machine Names lookup
Since 2026-10-27 the lookup Dept, Area, Product Type is no longer filtered: every machine of the site's Machine Names file is filled. Before, the lookup kept only the EU packing machines (Hull Dept `Dries Pack` / `Liquids Pack`, Nottingham Area `SD Packing` / `Strepsils Packing`).

**Effect on the EU pages (for Segun):** rows that are `In EU Report = true` but whose machine was outside the old lookup now have Dept, Area and Product Type. On the real files of Aug and Sep 2026 that is 4,129 loss rows (Nottingham manufacturing machines that the EU losses query keeps, and Hull `GT4 - Auto`). EU visuals that slice by Dept or Area now count them; plain totals do not change. If the EU pages should not show them, add `drop` rules for those machines to the file (one rule per machine, decision D1 "one rule per machine").

## Proof (2026-10-27)
Old flow (before the change) and new flow on the same real files (`sharepoint/`, plan OPT and time utilisation 2024-12 to 2026-10, daily losses Aug and Sep 2026), compared row by row on every column except the new ones:
| Table | Old rows | New rows | `In EU Report` true | true rows equal to the old rows |
|---|---|---|---|---|
| Plan_OPT_EU | 41,994 | 77,816 | 41,994 | all (0 only old, 0 only new) |
| Time_Utilisation_EU | 21,607 | 40,970 | 21,607 | all |
| Daily_Losses_EU | 59,310 | 61,938 | 59,310 | all |

Dept, Area, Product Type are unchanged wherever the old flow had them. Offline tests: `node scripts/test-vfc-pbi-report.js platform=xcelerator` (section 15 covers the file: missing file, keep rule, table without rules, file without rules).

## Upload the file
```
node scripts/datalake-upload.js config/report_scope.csv eu_report/reference/report_scope/site=All/report_scope.csv --overwrite
```
The lake watcher does not react to this folder (no table is rebuilt automatically): rerun the months after a change.

## Other writers of the same tables
- SIH report daily (Hull SIH lines): `In EU Report = true` (the SIH lines of Config are packing lines).
- Chartres conversion (`scripts/chartres-convert.js`): `In EU Report = true`.
