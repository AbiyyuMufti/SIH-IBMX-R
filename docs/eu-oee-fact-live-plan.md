# EU_OEE_Fact live: plan agreed 2026-11-11 (not built yet)

| At a glance | |
|---|---|
| **Goal** | `eu_report/report/EU_OEE_Fact/` stays live: one table (62 columns, `Record Type` = Plan, Loss, Time Utilisation) for Hull, Nottingham, Weinheim (Provideam) and Chartres (Excel via Power Automate) |
| **Status** | Plan only. History is uploaded (94 month files, build and parity: [eu-oee-fact-build.md](../prompt-response/eu-oee-fact-build.md)). The user paused the flow work on 2026-11-11 to test Tableau. Until the flows run, refresh by hand (see "Manual refresh") |
| **Flows** | Old flows come back from `flows/legacy_report_generator_v0/` unchanged: Config, Provideam fetch, PBI report build, PBI report build 2. Stay off: Run monitor, SIH tabs, old Power BI flows, proofs. Config keeps the `reportSource` switch; SIH is a value only, nothing is built for it now |
| **New** | Tab `EU OEE Fact build` (Provideam sites) and a fact output in `Chartres live` |

## Decisions (user, 2026-11-11)
1. **Fact tab, Provideam sites**: own clock 07:30 UTC (30 min after the fetch) plus a backfill inject `{start, end}`. It reads the Plan, Time Utilisation and Loss day files of the last 3 days that the build tabs wrote and unions them. No "done" signal exists (the write node has no output), so no immediate trigger yet; a link out at the end of PBI report build can come later.
2. **Chartres live**: Power Automate POSTs one `Base` row per request, the tab builds the rows in memory. Add one union node and write one fact file per line and day. No read-back. Same tab, same endpoint.
3. **Old tables stay as they are** and keep flowing (Run Rates, Volume CoV, Format List, Site targets are needed later as more record types and columns in the fact, not designed yet).
4. **File names**: `EU_OEE_Fact/site=<Site>/EU_OEE_Fact_<YYYY-MM-DD>_provideam.parquet`, Chartres `..._<YYYY-MM-DD>_<line>_excel.parquet`. Same 62 columns and order as the uploaded history. A rerun replaces the file (late corrections arrive that way). A day with one of the three tables missing is logged and not built.
5. **Targets**: every glidepath file is in percent points (checked 2026-11-11 in Hull, Nottingham, Weinheim, Chartres). Plan table: file value. Loss target and Site tables: value / 100. One bug: [y2-plan-time.js](../scripts/vfc/y2-plan-time.js) divides Plan PDT and UPDT by 100 for Chartres; fix it to percent. Add a log warning when a glidepath file looks like fractions (OEE maximum 1 or below).
6. **`In EU Report`** from `report_scope.csv`, Dept/Area/Product Type from the Machine Names files the flows load. Before building: compare `report_scope.csv` with `Dim/Machine_Names_EU.csv` for every line and report differences.
7. **Logging**: every new tab ends with the shared log lanes (`logs/<flow>/log_YYYY-MM.csv`). The Run monitor is not rebuilt.
8. **Cutover** (nothing is deleted until the user asks): delete the 2026-11 month files of Hull, Nottingham and Weinheim, rebuild them with the day files by backfill. Keep the Chartres Nov month file (converter days) and start Chartres day files on 2026-11-11, so nothing is counted twice.

## Review sheet (to write with the build)
`docs/eu-oee-fact-review.md`: one row per fact rule, the node that does it, the file and line to read. Rules: union never join; Loss renames (`Date` to `Event Date`, `ShiftStartDate` to `Date`, `Shift colour`, `target`); `In EU Report` and `In EU Report Source`; 62 columns. Use graphify to walk through nodes.

## Manual refresh (until the flows run)
1. `node scripts/datalake-download-tree.js eu_report/reference/ --max 2000 --out parquet/<run>/lake`
2. `node scripts/local-provideam-fetch.js parquet/<run>/lake/eu_report start=YYYY-MM-DD end=YYYY-MM-DD` (real Provideam API, key from `.env`, writes source day files locally, needs the body files in the download)
3. `node scripts/local-report-build.js parquet/<run>/build sites=Hull,Nottingham,Weinheim days=<day list> tables=Plan_OPT_EU,Time_Utilisation_EU,Daily_Losses_EU root=parquet/<run>/lake/eu_report`, then `python scripts/helper-chartres-write-parquet.py parquet/<run>/build`
4. Copy the lake tables into a parts folder, copy the new day files over them, run `python scripts/eu_oee_fact_build.py build --parts ... --out ...` and `check`
5. Upload the changed month files: `node scripts/datalake-upload-tree.js <out>/eu_report/report eu_report/report --overwrite --only <list>`, then `datalake-verify-tree.js` (writes to the lake: only with the user's go)

## Open
- Fact tab design details: node budget, job format from the fetch, the check of `report_scope.csv` against the Dim file.
- Run15 Chartres tables in the lake still hold fractions for Plan UPDT/PDT; the fact build multiplies them (and refuses when a value is above 1).
- Chartres tables end at 2026-11-09 in the lake (checked 2026-11-11).
