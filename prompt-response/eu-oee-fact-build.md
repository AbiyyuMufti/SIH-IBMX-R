# EU_OEE_Fact build: parity report (local only, nothing uploaded)

Built overnight 2026-11-10. Spec: `bi-builder/docs/eu-oee-fact-spec.md`. Nothing was written to the lake, no flow was imported or changed, no SIH source was touched, no token was used (no network call at all).

| What | Where |
|---|---|
| Build and check script | [scripts/eu_oee_fact_build.py](../scripts/eu_oee_fact_build.py) (`build`, `check`) |
| Row-by-row parity with the reference | [scripts/eu_oee_fact_parity.py](../scripts/eu_oee_fact_parity.py) |
| Output folder (git-ignored) | `parquet/eu_oee_fact_build/eu_report/report/` (same layout as the lake) |
| Files to upload | `parquet/eu_oee_fact_build/upload-list.txt` (226 paths), log `parquet/eu_oee_fact_build/build.log` |

Run again: `python scripts/eu_oee_fact_build.py build`, then `check`, then `python scripts/eu_oee_fact_parity.py` (set `PYTHONIOENCODING=utf-8` on Windows).

## Input

- Lake tables: the download of 2026-11-10 in `bi-builder/data/eu_report_latest/parts` (650 table files; last report day 2026-11-09, last `loaded_at` 2026-11-10 08:16). I did not read the lake again overnight, so "newer lake files" are not in this build. The same input was used for the reference CSV.
- Line list: `Dim/Machine_Names_EU.csv` from that download (identical byte for byte to `bi-builder/data/eu_report_dim/Machine_Names_EU.csv`, 71 lines).
- Glidepath files: Hull, Notts, Weinheim from `bi-builder/downloads/` (Mira ignored). 15,917 values, months 2025-01 to 2026-12, no duplicate key.

## What was built

1. **Targets** (spec section 7), only for Hull, Nottingham, Weinheim; Chartres untouched.
   - `Site_PDT_Targets`, `Site_UPDT_Targets`: rows of the three sites replaced from the glidepath (fractions). Hull goes from 648 to 637 rows: the lake rows of SP1 (Feb to Dec 2026, 11 rows) and SP2 (all of 2026, 12 rows) are gone because the file has no value there, and 12 rows of other lines are added. Charles' statement (no 2026 values for SP1 and SP2) holds apart from one month: his file has SP1 for January 2026 (OEE 42.0), so that month is written.
   - `Plan_OPT_EU`: `OEE Target`, `UPDT Target`, `PDT Target` in percent points by line and month of `Targets Key`. A line and month without a value gets an empty target.
   - `Daily_Losses_EU.target`: fraction, by line, loss category and month of `Loss Target Key`.
   - Files rewritten with the same name as in the lake. 132 of them differ from the lake (Plan 61, Losses 65, Site tables 6); the rest are unchanged and need no upload.
2. **Chartres unit fix**: `Plan_OPT_EU` Chartres `UPDT Target` and `PDT Target` times 100 (max 0.379 became 37.9 and 0.39 became 39.0; the script refuses to run when it finds a Chartres value above 1, so it cannot be applied twice). Site target tables and `Daily_Losses_EU.target` stay fractions.
3. **`EU_OEE_Fact`**: union of the corrected Plan and Loss tables and the (unchanged) Time Utilisation table, Loss renames as in the spec, `In EU Report` and `Dept/Area/Product Type` from the line list, `In EU Report Source` kept, 62 columns in the reference order, one parquet file per site and month, 94 files (Chartres 23, Hull 24, Nottingham 24, Weinheim 23), months 2024-12 to 2026-11. No row had an empty `Date`.

## Check 1: stacking loses nothing (source table = fact, per Record Type)

`python scripts/eu_oee_fact_build.py check`. Source = the corrected table written by this build (Plan, Loss) or the lake file (Time Utilisation). The last column of each line is the unchanged lake table: the target fix changes no row and no sum.

| Record Type | Rows | Sum 1 | Sum 2 | Result |
|---|---|---|---|---|
| Plan | 103,620 = 103,620 | Capacity 3,649,163,830.08 = 3,649,163,830.08 | Good Parts 1,850,980,545 = 1,850,980,545 | ok |
| Loss | 758,695 = 758,695 | Loss Units 1,635,145,751.03 = 1,635,145,751.03 | Duration 19,193,670 = 19,193,670 | ok |
| Time Utilisation | 49,877 = 49,877 | OEE Time Total 23,780,075.58 = 23,780,075.58 | Total Time Total 46,579,477.75 = 46,579,477.75 | ok |

912,192 rows in total, the sum of the three.

## Check 2: against the reference `bi-builder/data/eu_oee_fact/EU_OEE_Fact.csv`

`python scripts/eu_oee_fact_parity.py`. Every cell of my parquet is written as the text the reference CSV uses, each row becomes one string, and the two row sets are compared per Record Type.

| Item | Result |
|---|---|
| Columns | 62 = 62, same names, same order |
| Rows per Record Type and site | all 12 combinations equal |
| `In EU Report` per Record Type and line | 399 combinations, 0 differ |
| Whole-row comparison | Loss 758,695 of 758,695 identical, Time Utilisation 49,877 of 49,877 identical, Plan 103,620 of 103,620 identical after the two points below |

The two points, both expected and both limited to target columns of the Plan rows:

1. **Chartres `UPDT Target` / `PDT Target`** (21,859 Plan rows): the reference still holds fractions (0.327), mine holds percent points (32.7). This is the unit fix of item 2. For the comparison the reference value is multiplied by 100; every Chartres row then equals.
2. **Text format of the target** (Hull 6,115, Nottingham 8,101 rows etc.): the reference keeps the glidepath text (`31`), the lake column is a double (`31.0`). Compared as numbers all of them are equal (largest difference 0.0). Nothing else differs, so there is no difference left that needs "newer lake files" as an explanation.

Side findings, not changed: 25 Plan rows are exact duplicates of another Plan row in the lake (103,595 distinct rows of 103,620 apart from the targets). They are also in the reference. Rule 1 says no row is dropped, so they stay.

Rows where the corrected `In EU Report` differs from the lake value (`In EU Report Source`): Loss Nottingham 49,660 and Chartres 3,307, Plan Chartres 783, Time Utilisation Chartres 287. This is the line list overriding the lake flag, the same in the reference.

## Check 3: KPIs from my table, 1 to 30 Sep 2026, `In EU Report` = true

| | OEE % | Unplanned % | Planned % | Volume | Expected | Result |
|---|---|---|---|---|---|---|
| Hull | 45.96 | 23.51 | 27.08 | 21.83M | 45.96, 23.51, 27.08, 21.83M | ok |
| Nottingham | 57.51 | 21.81 | 19.83 | 34.30M | 57.51, 21.81, 19.83, 34.30M | ok |

No Power BI loss double count was copied: one fact row per lake row.

## Check 4: targets equal the glidepath

For every glidepath value (site, line, bucket, month) the written tables are compared with the file value, and the other way round: a row with no glidepath value must have an empty target. This check is a separate code path from the build (a join in the other direction on the written files).

| Table and column | Rows checked | Rows with a glidepath value | Mismatches |
|---|---|---|---|
| `Site_PDT_Targets.PDT Target` | 997 (Hull, Nottingham, Weinheim) | 997 | 0 |
| `Site_UPDT_Targets.UPDT Target` | 997 | 997 | 0 |
| `Plan_OPT_EU.OEE Target` | 80,966 | 27,283 | 0 |
| `Plan_OPT_EU.UPDT Target` | 80,966 | 28,066 | 0 |
| `Plan_OPT_EU.PDT Target` | 80,966 | 28,066 | 0 |
| `Daily_Losses_EU.target` (categories that have a bucket) | 660,364 | 340,692 | 0 |

Rows changed against the lake (numeric, not text): Plan OEE Target 5,447 (Hull only), Plan UPDT Target 33,844 (Chartres 21,859 unit fix, Hull 5,089, Nottingham 6,896), Plan PDT Target 30,920 (Chartres 21,859, Hull 2,097, Nottingham 6,964), Loss target 31,393 (Hull only). Weinheim: no value changes. Nottingham changes are in UPDT and PDT only.

This does not match the figures in spec section 7 (Hull 7,007 OEE, 13,668 unplanned, 10,896 planned). I could not reproduce them: against the same lake data the reference run changes 6,115 / 5,417 / 2,783 Hull Plan rows as text and 5,447 / 5,089 / 2,097 as numbers, and my output equals the reference output row by row. I think the spec figures come from another baseline; they do not affect any check.

## Size

| | Files | Size |
|---|---|---|
| `EU_OEE_Fact` (snappy parquet) | 94 | 39.4 MB (Hull 14.6, Nottingham 19.8, Chartres 3.5, Weinheim 1.5; biggest file 1.0 MB) |
| Corrected Plan, Loss, Site tables | 132 changed | about 42 MB in total (all copies in the folder: 82 MB with the fact) |

Reference CSV is 448 MB, so the parquet is about a tenth.

## Proposed upload and flow changes (NOT run)

Upload with the existing tool (writes to the lake, overwrites objects with the same name; run only after you approve):

```
node scripts/datalake-upload-tree.js parquet/eu_oee_fact_build/eu_report/report eu_report/report --overwrite --only parquet/eu_oee_fact_build/upload-list.txt
```

Suggested order, in separate runs with a check of the lake after each: (a) the 6 Site target files, (b) the 61 Plan and 65 Loss files, (c) the 94 `EU_OEE_Fact` files. I did not verify that `--only` lists work with paths relative to this source folder; the list is built that way, test it on (a) first. I also did not check that the corrected files keep the exact column order and types of the lake files: they were written from the lake files and compare equal in column names, order and types, but I did not diff the parquet schema field by field.

Flow changes to make this permanent (not made):

1. Targets: the Site target tables are built from the glidepath files by the build tabs (`scripts/vfc/b9-target-rows.js`, `b9-route-tables.js`). Replace the glidepath files in the lake reference folder with the three corrected files and the tab recomputes Site tables; the Plan and Loss targets need the same lookup as `fix_plan` and `fix_loss` in the script (key: site, `MachineName`, bucket, month of the key; empty when no value). I have not read the Plan and Loss target code of the build tabs, so I cannot say yet which node holds that lookup.
2. Chartres Plan UPDT and PDT: multiply by 100 where the Chartres Plan rows are written, so the next daily run does not bring the fractions back. Until then every Chartres day written by the flow is wrong again and the fact file of that month must be rebuilt.
3. `EU_OEE_Fact`: a new tab (or a step at the end of PBI report build 2) that, for a site and month, reads the three tables and overwrites `EU_OEE_Fact_<YYYY-MM>.parquet` whenever one of the three changed. The 2 MB limit for flow context applies: Hull and Nottingham month files hold up to about 60,000 rows each, so rows must go through the join node and the file be written by one parquet node, not kept in context. The 50 second day limit also applies. I have not tested whether the VFC can do this; the cheap alternative is to run this script on a schedule outside the VFC.

## What I could not follow or decided

- **Language**: the pipeline is Node-RED/JavaScript and the repo has no parquet writer for Node. I wrote the build in Python/polars like the bi-builder reference, as a script outside the flow. It is not "in the style of the flows" and the VFC version still has to be written.
- **No newer lake files**: no download overnight, so the build matches the 2026-11-10 data.
- **`loaded_at`**: kept per row as in the lake. The replaced Site target rows get the build time as `loaded_at`.
- **Compression**: snappy, the widely readable choice; the spec does not say.
- **Time zones**: no file of this download has a time zone, so nothing was dropped; the code drops zones as the spec says.
- **Targets of lines without any glidepath row** (for example a Hull line missing from the file): empty, as the reference script does.
- Nothing in the spec was impossible to follow, and no rule was changed to pass a check.

`parquet/` is untracked; `*.parquet` is git-ignored but `build.log` and `upload-list.txt` in it are not, so do not `git add` the folder. Nothing was committed.
