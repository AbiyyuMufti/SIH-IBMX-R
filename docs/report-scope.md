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
| Nottingham | all five tables | keep the 24 machines `N1, N3, N4, N5, N6, N7, N8, N9 Auto, N10, N11, N12, O5, O6, S04, S05, S06, S08, S10, S11, S12, S13, T2, T7, S14` (select list, no drop rules; Andrew, 2026-11-19, S14 added). Before, Plan OPT kept two areas, Losses, CoV and Run Rates dropped manufacturing machines and S14. Rerun all Nottingham months |
| Weinheim | all | no rule: all true |
| Chartres | Plan OPT, Time Utilisation, Daily Losses, Volume CoV | drop `SACHA1`, `SACHA2` (site answer 2026-11-09: not in the EU report). The Chartres scripts read the file through `scripts/lib-report-scope.js`; run12 holds the values |

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

## EU_OEE_Fact and S14 (2026-11-19)
The fact's `In EU Report` is not read from this file: it is the line list `report/Dim/Machine_Names_EU.csv` (hand-kept, shared by all sites). S14 was added there (`Nottingham,S14,S14-Nottingham,Solid Dose,SD Packing,Solid Dose`). `In EU Report Source` keeps the table flag. A new site line needs BOTH files.

History re-stamp: the flag columns of every Nottingham file (report tables and fact, 295 files) were rewritten in place by `scripts/helper-nott-scope-patch.py` (no other column changes, checked column by column), backup of the old files in `parquet/s14_backup/`. Flips: S14 false to true (Plan 126, Time Utilisation 99, Losses 1,606, Run Rates 668, CoV 118 rows); Losses 50,421, Run Rates 27,774 and CoV 1,440 rows of other non-list machines true to false. T1 has no rows in any table.
