# EU_OEE_Fact from the VFC flows (65 columns)

| At a glance | |
|---|---|
| **What** | The build tabs keep writing the old report tables exactly as before, and now also send the same rows to a new tab `EU OEE Fact write`. That tab maps them to the 65 columns of `EU_OEE_Fact` and writes one file per site, day and record type |
| **Writes** | `<root>/report/EU_OEE_Fact/site=<Site>/EU_OEE_Fact_<YYYY-MM-DD>_<plan\|tu\|loss\|rr>_provideam.parquet`; Chartres `..._<YYYY-MM-DD>_<LINE>_<plan\|tu\|loss>_excel.parquet`. A rerun of the day replaces the file. The history stays in the month files `EU_OEE_Fact_<YYYY-MM>.parquet` |
| **Tabs** | new [vfc-eu-oee-fact.json](../flows/legacy_report_generator_v0/vfc-eu-oee-fact.json) (34 nodes); changed [vfc-pbi-report.json](../flows/legacy_report_generator_v0/vfc-pbi-report.json) (190), [vfc-pbi-report-2.json](../flows/legacy_report_generator_v0/vfc-pbi-report-2.json) (174), [vfc-chartres-live.json](../flows/legacy_report_generator_v0/vfc-chartres-live.json) (121) |
| **Switches** | node `1.1 FACT SETTINGS (edit here)`: `DRY_RUN` (default `true`), `MONTH_JOBS` (`false`: a month job writes no fact file), `FIRST_DAY` (`2026-11-10`: no fact file before the cutover day) |
| **Status** | Built and proven offline 2026-11-13 (below). Not imported in the VFC yet. Test guide: the interactive page "EU OEE Fact VFC test" (link in `NOTES.md`) |
| **Builders** | `node scripts/build-vfc-eu-oee-fact.js`, `build-vfc-pbi-report-flow.js`, `build-vfc-pbi-report-2-flow.js`, `build-vfc-chartres-live.js` (they write to `flows/legacy_report_generator_v0/`) |

## How it works
1. **PBI report build**: in the lanes `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU` the node `Split by source` has a second output `to FACT` with the rows that go to `report/` (the lines on Provideam). Lane `TO EU OEE FACT`: link in `FACT` -> link out `to eu-oee-fact WRITE`.
2. **PBI report build 2**: the same from `Run_Rates_EU`, and in lane `TO EU OEE FACT` the node `Build Run Rate fact rows` ([b9-rr-fact-rows.js](../scripts/vfc/b9-rr-fact-rows.js)) sums the hours per shift start day, line, shift, colour and part (rules: [eu-oee-fact-run-rate.md](eu-oee-fact-run-rate.md)).
3. **Chartres live**: `Route the tables` ([y5-route-tables.js](../scripts/vfc/y5-route-tables.js)) has a 6th output with the plan, time and loss rows of the line and day (no Run Rate rows: Chartres has no hourly data).
4. **EU OEE Fact write**: link in `eu-oee-fact WRITE` -> `FACT SETTINGS` ([e1](../scripts/vfc/e1-fact-settings.js)) -> read and parse the line list `report/Dim/Machine_Names_EU.csv` -> `Map to fact columns` ([e2](../scripts/vfc/e2-fact-rows.js): Loss renames, `In EU Report` = line in the line list, `In EU Report Source` = the table flag, Dept / Area / Product Type from the line list, `Loss Target` 6 decimals) -> `Decide EU_OEE_Fact` (dry run, failed item, empty) -> parquet (the 65 columns, every one typed, `euOeeFactSchema` in [lib-pbi-report-schemas.js](../scripts/lib-pbi-report-schemas.js)) -> path ([e3](../scripts/vfc/e3-fact-path.js)) -> write object. Shared log lanes: `logs/eu-oee-fact/log_YYYY-MM.csv`.

The cross-tab links have fixed ids (`FACT_LINK_IN_ID`, `FACT_LINK_OUT_IDS` in [lib-pbi-report-lanes.js](../scripts/lib-pbi-report-lanes.js)), so an import keeps them connected. `validate-flow.js` accepts these ids as links to another file.

The fact files of a build day are written whatever the build tab's own `DRY_RUN` says: only the fact tab's `DRY_RUN` decides.

## Proof (offline, 2026-11-13)
| Check | Command | Result |
|---|---|---|
| Old tables unchanged | `node scripts/local-report-build.js <dir> sites=Hull,Nottingham,Weinheim days=2026-11-08,...,2026-11-12 root=parquet/rr_20261112/lake/eu_report`, before and after, stage JSON compared without `loaded_at` | 63 of 68 files equal; the 5 Hull `Daily_Losses_EU` days differ only in `target` and `Value` of `In Process Quality` (114 rows): the fix below |
| Fact = month files (Provideam) | `python scripts/eu_oee_fact_flow_check.py <dir>/report parquet/eu_oee_fact_rr_build_v2 --hyper --ignore=Value` | PASS: schema equal (65 columns, no Null type), Plan / Time Utilisation / Loss row by row, Run Rate per shift-day, 3 sites x 5 days |
| Fact = month files (Chartres) | `node scripts/test-chartres-live.js downloads/chartres-convert/run16 filler=downloads/chartres-filler-20261112 from=2026-10-01 factOut=<dir> lines=<Machine_Names_EU.csv>`, then the check with `"--ignore=Shift Time"` | PASS: 429 line-days, 1,344 plan, 429 time, 5,072 loss rows; old tables equal |
| Unit tests | `node scripts/test-eu-oee-fact.js` | 16 checks pass (Run Rate shift day, Loss renames, line list, month job and FIRST_DAY skipped, path) |
| Build tab tests | `node scripts/test-vfc-pbi-report.js platform=xcelerator`, `test-vfc-pbi-report-2.js`, `test-vfc-provideam-fetch.js` | all pass |
| Cutover | `python scripts/eu_oee_fact_cutover.py parquet/eu_oee_fact_rr_build_v2 parquet/fact_cutover_20261110 2026-11-10` + the flow day files from 11-10 | November per site and record type: same rows and sums as the live month files |
| Flow checks | `node scripts/validate-flow.js flows/legacy_report_generator_v0/<file>` | PASS for the 6 tabs in use; no duplicate node id across them |

Known differences (accepted):
- **Hull `In Process Quality` loss target** (fixed in this change): the Hull glidepath names the bucket `In process Quality`, the loss subgroup is `In Process Quality`, so the flow found no target. [b5-target-lookup.js](../scripts/vfc/b5-target-lookup.js) now maps the name (as `BUCKET_FIX` of the fact build). `Daily_Losses_EU` gets `target` and `Value` on those rows again; the month files have the target but an empty `Value` (the Python build fixed only the target).
- **Chartres Plan `PDT Target` / `UPDT Target`** are percent points now (decision 5 of the live plan, [y2-plan-time.js](../scripts/vfc/y2-plan-time.js)), as the other sites and the fact month files. The old Chartres history in `Plan_OPT_EU` still holds fractions.
- **Chartres filler loss rows**: `Shift Time` = their shift (known since the live tab, the history filler has it empty).
- **Run Rate across two day files**: a shift whose hours sit in two production-day files would give two rows for one shift-day (sums equal). On 2026-11-08 to 11-12 no row did: every hour of a production-day file maps to that day.

## Cutover (from the month files to the day files)
The month file of November holds the days to 2026-11-12. From `FIRST_DAY` on the flow writes day files, so the November month file of Hull, Nottingham and Weinheim must lose the days from `FIRST_DAY`, or Tableau counts them twice.
1. `python scripts/eu_oee_fact_cutover.py <lake copy> <new folder> 2026-11-10` writes the trimmed month files (Date before the first day) and `upload-list.txt` / `delete-list.txt`. `parquet/fact_cutover_20261110/` (from the live files of 2026-11-13) is OUT OF DATE: the local refresh (`docs/local-daily-refresh.md`) rewrote the three November files on 11-13 and 11-16. Download the lake fresh, back it up, trim again, then upload. The local refresh task must be disabled before (both write the same days). `FIRST_DAY` stays 2026-11-10 because Chartres has no lake days from 11-11 yet. Runbook for the user: `docs/guides/eu-oee-fact-vfc-test.html` (rewritten 2026-11-17 for an empty VFC).
2. With the user's go: `node scripts/datalake-upload-tree.js parquet/fact_cutover_20261110/eu_report/report/EU_OEE_Fact eu_report/report/EU_OEE_Fact --overwrite --only parquet/fact_cutover_20261110/upload-list.txt`.
3. Right after: fact `DRY_RUN` false and the Provideam fetch backfill `{"start": "2026-11-10", "end": "<yesterday>"}` (14 days at most; after 2026-11-23 move `FIRST_DAY` and rebuild the cutover files).
4. Rollback: upload the backup `parquet/eu_oee_fact_backup_20261113/` (62 columns) or `parquet/eu_oee_fact_rr_build_v2/` (65 columns, the state before the cutover) with `--overwrite`, and delete the day files `EU_OEE_Fact_*_provideam.parquet`.

Chartres needs no trim for the fact: its month file ends 2026-11-10; the day files 2026-11-12 to 2026-11-17 (and HOME4 2026-11-09) were uploaded on 2026-11-18 and the live tab writes from 2026-11-16 (same file names: a resend replaces them).

## Import (VFC)
| # | Import this file | Replaces tab | After import |
|---|---|---|---|
| 1 | [flows/legacy_report_generator_v0/vfc-eu-oee-fact.json](../flows/legacy_report_generator_v0/vfc-eu-oee-fact.json) | new tab `EU OEE Fact write` | Deploy. `DRY_RUN` stays `true` for the first test |
| 2 | [flows/legacy_report_generator_v0/vfc-pbi-report.json](../flows/legacy_report_generator_v0/vfc-pbi-report.json) | `PBI report build` | `1.1 TASK SETTINGS`: `DRY_RUN` of the 3 tables to `false` again (as before) |
| 3 | [flows/legacy_report_generator_v0/vfc-pbi-report-2.json](../flows/legacy_report_generator_v0/vfc-pbi-report-2.json) | `PBI report build 2` | `DRY_RUN` of the 5 tables to `false` again |
| 4 | [flows/legacy_report_generator_v0/vfc-chartres-live.json](../flows/legacy_report_generator_v0/vfc-chartres-live.json) | `Chartres live` | only after Provideam works; check the access key of the `http in` node and `DRY_RUN` |

Then open the link in `eu-oee-fact WRITE`: it must show the link outs of the imported tabs. The `to ... BACKFILL` link outs of `Provideam fetch` keep pointing to the build tabs (fixed ids).

## Open
- Chartres days from 2026-11-12 to 2026-11-17: loaded as fact day files on 2026-11-18 (`docs/chartres-live.md`); 2026-11-11 has no entries (holiday).
- Locally, the Tableau Hyper API (0.0.26784) cannot read the parquet.js files the VFC writes ("column index"); the SIH sync read them on 2026-11-03 (the `Live_*` sources). The local Hyper check is for the type problem of 2026-11-13 only.
- `validate-flow.js` without arguments and `test-vfc-flow.js` still look in `flows/` (empty since the move of 2026-11-12): pass the files.
- The Run monitor does not watch the new tab.
