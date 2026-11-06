# Chartres history load: OEE workbooks (Base) to the three report tables

| At a glance | |
|---|---|
| **What** | [`scripts/chartres-convert.js`](../scripts/chartres-convert.js) turns the Chartres OEE workbooks (`<group>/<year>/SAISIE OEE/OEE*.xlsm`, sheet `Base`, 2025 and 2026) into the three report tables, two site target tables and their local stage / parquet outputs, with the schemas of [`scripts/lib-pbi-report-schemas.js`](../scripts/lib-pbi-report-schemas.js) |
| **Run** | [`scripts/chartres-convert.js`](../scripts/chartres-convert.js): `node scripts/chartres-convert.js out=downloads/chartres-convert/<new folder>` (workbooks from `downloads/01 SITE Chartres`), then [`scripts/helper-chartres-write-parquet.py`](../scripts/helper-chartres-write-parquet.py): `python -I scripts/helper-chartres-write-parquet.py downloads/chartres-convert/<same folder>`. Review for the site: `node scripts/chartres-review.js downloads/chartres-convert/<same folder>` then `python -I scripts/helper-chartres-review-xlsx.py downloads/chartres-convert/<same folder>/review.json prompt-response/chartres-review-for-laura.xlsx` |
| **Writes** | `<out>/report/<table>/site=Chartres/<table>_<YYYY-MM>_excel.parquet` (one file per table and month, the lake layout of [report-config.md](report-config.md)), `<out>/stage/...json`, `<out>/checks.csv`, `<out>/duplicates.csv` (saving times and differing Base columns), `<out>/loss-map.json`, and `<out>/days.json`. [`scripts/helper-chartres-write-parquet.py`](../scripts/helper-chartres-write-parquet.py) also writes one parquet per target table. Local files only: nothing is uploaded |
| **Inputs** | the workbooks (read, no macro run), `Category` sheets, [`TARGET 2.xlsx`](<../downloads/01 SITE Chartres/TARGET 2.xlsx>) / sheet `OEE 2025-2026` (OEE, downtime and loss targets), and [`MASTERDATA.xlsx`](<../downloads/01 SITE Chartres/MASTERDATA.xlsx>) / sheet `Downtime_updated`, all in the workbook folder |
| **Status** | Run10 (machine part) built and checked locally on 2026-11-06, same counts as run9; nothing uploaded. 7,308 days, 22,573 plan rows, 7,308 time rows, 78,694 loss rows; 95 parquet files (Jan 2025 to Nov 2026, plus two target files). Counts differ from run8 because the current workbooks changed; see Run9 verification below |
| **Scope** | 2025 and 2026 (decision of the user). 2024 has another format (`DOR <group>.xlsm`, sheet `TRS`) and is left out, see [chartres-source-files.md](chartres-source-files.md) |

## Rows
| Table | One row per | From `Base` |
|---|---|---|
| `Plan_OPT_EU` | day x shift type x product slot with a Code, Temps or Volume (5 shift types x PF1 to PF4) | the product block of the slot |
| `Time_Utilisation_EU` | day and line | TOP, TOR, TU |
| `Daily_Losses_EU` | day and loss column with minutes above 0 (NR and the loss columns I to the first product column, without the three `Nbre` count columns) | the column name and its minutes |

## Column rules
| Column | Rule |
|---|---|
| `Date` | `ANNEE` / `MOIS` / `JOUR`. The stored `Date` column is one day off on some 2025 rows (OLYMPE 2025-03-02 holds 2025-03-03), so it is not used |
| `MachineName` | the line in the file name (`OEE IWKA 2 - 2026.xlsm` = `IWKA 2`, `CLÉOPATRE` with accent). `Unique Machine Name` = `<line>-Chartres` |
| `AreaName` | the group: `CREAM`, `NON WOVEN`, `SKIN CARE` (the names of the macro export and of the target file) |
| `ShiftName` (plan) | shift times from the site: Semaine Matin 05:00-13:00, Semaine Après Midi 13:00-21:00, Semaine Nuit 21:00-05:00, Weekend Matin 05:00-17:00, Weekend Nuit 17:00-05:00. | `Semaine Matin`, `Weekend Matin` = Day; `Semaine Après Midi` = Afternoon; `Semaine Nuit`, `Weekend Nuit` = Night (constant `SHIFTS`) |
| `PartName` | `Nom PF<n> <shift>` (filled by the form from the sheet Data), else the Code. `Product Key` = `Unique Machine Name` + space + `PartName` |
| `Good Parts` | `Volume` of the slot; do not subtract waste. `Defect Parts` keeps the slot's typed `Déchets` value; machine-level waste is not spread across product slots |
| `Capacity` | `Vitesse x Temps` (macro rule) |
| `Total Time`, `Planned OpT` | `Temps` of the slot (the slot times add up to TOR) |
| `OEE Time` | `Good Parts / Vitesse`, minutes cut; empty without a speed |
| `Downtime Units` | `Capacity - Good Parts` |
| `OEE Target` | `TARGET 2.xlsx`, `% OEE` bucket, matching line and month; target fractions are written as percent (0.613 -> 61.3). 2025 uses its own months |
| `PDT Target`, `UPDT Target` | `Planned Downtime (Total)` and `Unplanned Downtime (Total)` buckets, as fractions |
| `target` (losses) | Exact `OEELossLvl3SubGroup` bucket and month, as a fraction; unmatched buckets stay empty. `Value` remains empty |
| `OEE Time Total`, `Total Time Total`, `Planned OPT Total`, `All Time` | TU, TOR, TOR (constant `PLANNED_OPT_FROM`), 1440 |
| `OEELossLvl3Group` | Category Level 1 EN: `Planned losses` = `Planned Loss`, `Unplanned losses` = `Unplanned Loss` (the EU names) |
| `OEELossLvl3SubGroup`, `Breakdown Types` | Category Level 2 EN in the EU name where one exists (`Minor stop` = `Minor Stops`, `Adjustment` = `Adjustments`, `Changeover` = `Product Changeover`, `Undefined` (NR) = `Not Logged`, ... constant `SUB`), else as it is (`Breakdown`, `Cleaning`) |
| `OEELossLvl3Desc`, `Lvl 3 Loss Name`, `Loss Final Level` | the MASTERDATA English name where it matches (see MASTERDATA below), else Category Level 3 EN (`Piste` written `Lane`). Machine losses with a found part: `<machine> - <part>` (see Machine part below). `Volume Key` and `Equipment Loss Key` follow this name |
| Category lookup | the Category sheet of the same line (a 2025 file uses its 2026 file), else any Category sheet with the name. Names in no Category sheet (CUPIDON, DAISY, spare `Libre` columns) by the block: `Dysf` = Minor stop, `Panne` = Breakdown, `Réglages` = Adjustment, `Orga` = Cleaning, `Changement` = Changeover, `Rupture` = Lack of Resources, `Qualité` = Quality issue, `Maintenance` = Planned maintenance; the description is then the French machine part |
| `Equipment` | the machine of `Dysf` / `Panne` / `Réglages` columns (without the part), else `Unclassed` |
| `Duration`, `Time in Mins` | the minutes (Duration as ms on 1970-01-01, as the other sites) |
| `Loss Units` | `Vitesse x minutes`, speed of the product with most time that day |
| `Volume Total` | sum of `Capacity` of the line and day |
| `Volume Key`, `Loss Target Key`, `Equipment Loss Key` | the report way (`DD/MM/YYYY machine group sub desc`, `unique sub 01/MM/YYYY`, `machine desc`) |
| `ShiftName`, `PartName`, `Time`, `Product Key` (losses) | empty: `Base` losses are per day |
| `Dept`, `Area`, `Product Type`, `MachineName` | from the Chartres Machine Names list (constant `MACHINE_INFO`, 2026-11-05): `IWKA1`, `SACHA1`, `CLEOPATRE` replace the file names `IWKA 1`, `SACHA 1`, `CLÉOPATRE`. CUPIDON and DAISY (dropped) are not in the list: names unchanged, Dept empty. ZEUS and APOLLON have two product types: both use the agreed type |
| Not-counted time | TownHall, trials, training, validation are not loss rows (they are outside TOR) |

## Glidepaths from TARGET 2.xlsx (2026-11-06)
By default, the converter reads [`TARGET 2.xlsx`](<../downloads/01 SITE Chartres/TARGET 2.xlsx>), sheet `OEE 2025-2026`; override it with `targets=<file>`. `Feuil1` and `Clés arrêts` are ignored. The 24 date headers are Excel month dates from 2025-01 to 2026-12. Values in this file are fractions (0.4 = 40%):

- `OEE Target` uses `% OEE`, matching the line with the existing `key()` normalisation (accents, spaces and hyphens ignored), and writes a percent (61.3).
- Plan `PDT Target` / `UPDT Target` use `Planned Downtime (Total)` / `Unplanned Downtime (Total)` as fractions.
- Loss `target` looks up the exact output `OEELossLvl3SubGroup` and month, as a fraction. The `Loss Target Key` remains the report key. `Value` is not a target column and stays empty.
- `Site_PDT_Targets` / `Site_UPDT_Targets` follow [`scripts/vfc/b9-target-rows.js`](../scripts/vfc/b9-target-rows.js): columns, order and types from [`scripts/lib-pbi-report-schemas.js`](../scripts/lib-pbi-report-schemas.js), one row per target line/month, target fraction, and `Volume Key` = source line + `01/MM/YYYY`. Blank cells remain null rows.

The 16 workbook lines with OEE targets match through `key()`. Target line `JUPITER` has no workbook (expected next-year line); workbook lines `CUPIDON` and `DAISY` have no target rows. Run9 writes 408 rows to each site target table (17 target lines x 24 months).

**Question for the site:** the target file has loss buckets `In process Quality`, `Operator Asset Care`, `Others` and `Refilling Materials` with no exact output subgroup; the output also has `Cleaning` and `Not Logged` with no exact target bucket. Should any of these names map to another bucket? Until confirmed, only exact subgroup names are populated; no mapping is inferred.

## Volume_CoV_EU and Format_List_EU (2026-11-03)
[`scripts/chartres-extra-tables.js`](../scripts/chartres-extra-tables.js) builds the extra tables; run the parquet writer again afterward. `Volume_CoV_EU` follows the rule of `scripts/vfc/b9-cov-rows.js`: per day, shift and line from `Plan_OPT_EU`, Good Parts over 1,000. `Format_List_EU` is one row per line and product; Brand, FORMAT (`200ml - Cap` = Unit Size `200ml`, Extra Info `Cap`) and CASE (`X6` = `6`) come from the workbook `Data` sheet (our mapping, to confirm). The run9 counts are 13,756 Volume_CoV_EU rows and 827 Format_List_EU rows. The earlier product/brand checks below describe run5. `Run_Rates_EU` is still not possible (hourly source). `Historical_OEE_EU` from the 2024 `DOR` files is possible but not built (the user left 2024 out). Site target tables are now built from `TARGET 2.xlsx`; see above.

One day as csv for the site: `node scripts/chartres-one-day.js downloads/chartres-convert/<run> APOLLON 2026-10-22 prompt-response/chartres-one-day-APOLLON-2026-10-22` (a csv per table, git-ignored). Explanation page: `node scripts/chartres-explain-html.js downloads/chartres-convert/<run>` writes `prompt-response/chartres-how-it-works.html` (git-ignored).

## MASTERDATA (2026-11-03)
`MASTERDATA.xlsx` sheet `Downtime_updated` is the reason tree of the new SIH entry page (French on screen, English stored). It is a new tree, not a translation of the workbook Category sheets: the planned / unplanned reasons are finer (e.g. `Changeover` = complete / partial, `Packing/Batch/WO change` = four reasons) and the machines are line, machine, type (Breakdown, Minor Stop, Adjustment), sub part. The workbook losses are per machine, so the machine comes first; since run10 the part (Level 4) is added where the column names it (section Machine part). Group and sub group stay the Category ones (the EU classification); MASTERDATA only gives the Level 3 name and `Equipment`.

Match per line and loss column (`masterdata()` in the script), share of the 77,122 loss rows of run5:
| Match | Rule | Rows |
|---|---|---|
| same English name | Category Level 3 EN (without `ZAC-` / `EXT-`) = MASTERDATA name | 44 % |
| same French name | Base name (without `Dysf` / `Panne` / `Réglage`, `ZAC -`) = MASTERDATA French | 7 % |
| synonym, to confirm | constant `SYNONYM` (`Filling machine` = `Filler`, `Paletizer` = `Palletiser`, ...) | 24 % |
| name contained, to confirm | a MASTERDATA name of 5+ letters inside ours (`REMPLISSEUSE - Autre` = `Filler`) | 3 % |
| no match | Category name kept: `Packing/Batch/WO change`, `Other`, `Changeover`, NR, machines not in the new tree (CUMULUS Sleever and Oven, HOME Wax strip dispenser, SACHA lanes, ...) | 21 % |
| line not in MASTERDATA | CUPIDON, DAISY (dropped in 2026): machine names translated by us (constant `PART_EN`) | 2 % |

The site confirms or corrects the names in the review (sheet `Loss names`, column `Your correction`); the answers go into `SYNONYM` / `PART_EN`.

## Review for the site (2026-11-03)
`scripts/chartres-review.js` + `scripts/helper-chartres-review-xlsx.py` write [prompt-response/chartres-review-for-laura.xlsx](../prompt-response/chartres-review-for-laura.xlsx) (site values: git-ignored). Kept short on purpose: 4 sheets (the example day is in the HTML page `chartres-how-it-works.html`). `1 MASTERDATA name` (the loss has a MASTERDATA name: "same name" or "our proposal: please check"), `2 No MASTERDATA (Category)` (English from the workbook Category sheet), `3 No MASTERDATA (ours)` (our translation: CUPIDON, DAISY), `Questions` (8, plain words, one real case each; Minutes 2025-26 are shown, the lists are sorted by them). One row per machine part (Dysf / Panne / Réglage together) or per reason; Yes/No drop-down, a drop-down of the MASTERDATA names (hidden sheet `names`), filters; sorted by minutes, which are not shown. `day=LINE@YYYY-MM-DD` picks another example. Overview diagram: page 0 of [diagrams/chartres-source-map.drawio](../diagrams/chartres-source-map.drawio), with every report table and what Chartres can feed it from (built: the three above; from the workbooks: Volume_CoV_EU and Format_List_EU from sheet Data; target tables from TARGET 2.xlsx; Historical_OEE_EU from the 2024 DOR files; no source: Run_Rates_EU, hourly).

## Data choices (from the run of 2026-10-26)
- **Day entered twice**: the newest saving is kept (`Date et heure de la saisie`, else the top row: Base is newest on top). Run9 has 19 pairs; `duplicates.csv` records the file, date, both saving times and differing Base columns (`same` when none differ).
- **Days that fail a form rule are loaded** and listed in `checks.csv` (rule, detail): TOR = TOP - not counted 7, TU + NR + losses = TOR 80, sum of product Temps = TOR 268, TU = round(OEE x TOR) 794.
- **Negative NR**: on 910 days NR is negative (the operator balanced the day with it). A negative loss is not loaded; the row is in `checks.csv`. The day's losses then add up to more than TOR - TU.

## Checked
- The rule counts agree with `helper-chartres-invariants.js` (5 / 81 / 269 / 804 on the rows before the duplicate rule).
- Against the CREAM macro exports of 2026 (161 days of `PlanOpt/*_plan_opt.xlsx`): Capacity and Total Time per day equal on 149 days, Good Parts on 152 (waste is mostly 0 in CREAM). The 12 other days are not traced yet. Loss minutes equal on 64 of 161: traced on IWKA 1 2026-08-06 (export 621, ours 417): 417 - NR 3 + not-counted 210 (TOP 1380 - TOR 1170) + 8 - 11 = 621. The export holds the not-counted time, leaves NR out, and its name lookup moved 8 minutes from `Dysf ENCAISSEUSE Cermex` (11) to `Dysf DISTRIBUTEUR Spatules`.


## Site answer on waste (2026-11-05)
The site says `Déchets` is never filled and is always zero. `Good Parts` is now the typed `Volume`; waste is not subtracted from plan rows or day totals. `Defect Parts` keeps each slot's typed `Déchets` value; machine-level waste is no longer distributed among product slots. The date rule remains `ANNEE` / `MOIS` / `JOUR` (night date is still TBC). Negative NR and `Temps non compté Libre 1` remain ignored.

## Deck for the site (2026-11-03)
`prompt-response/chartres-how-it-works-for-laura.pptx` (10 slides, one real day, git-ignored): `PPTXGENJS_DIR=<folder with node_modules/pptxgenjs> PPTX_SKILL_DIR=<pptx skill folder> NODE_PATH=<same node_modules> node scripts/chartres-explain-pptx.js downloads/chartres-convert/<run>`. Look at it with `bash scripts/render-pptx.sh <deck.pptx> <new folder>` (LibreOffice and poppler, installed with winget). The HTML / PDF versions of the same explanation (`scripts/chartres-explain-html.js`) were replaced by the deck.

## Schema fix (2026-11-05, run7)
The first upload (run6) used the old `reportPlanSchema` / `reportLossSchema`. The dashboard extract reads every file of a table folder with ONE schema, taken from the first file (`site=Chartres` sorts first): it then failed on Hull (`invalid data type for attribute 'Duration'`, Chartres had a timestamp, Hull whole minutes). Run7 writes `pbiPlanSchema` / `pbiLossSchema` (same names, order and types as Hull and Nottingham): `Duration` whole minutes, `Value` a number (empty), `Batch ID`, `Shift colour` (empty), Plan `Defect Parts` = waste, `OEE` = good / capacity, `ShiftStartTime` from the shift times, `Target` = Capacity (as Hull), `Targets Key`, Format List columns joined on Product Key. `OEE Target` is now a percent (61.3) like the Glidepaths of the other sites (was 0.613). Run7 replaced the 89 lake files. Rule: any new site file must have exactly the schema of the existing files of the folder.

## ZEUS and APOLLON product type (2026-11-05, run8)
The site file lists two product types for ZEUS (No touch, Bottle) and APOLLON (Bottle Cap, Bottle Pump). Agreed with the site: both are `Bottle`. One row per machine in the reference CSV (the duplicate rows doubled joins) and in `MACHINE_INFO`. Run8 (same row counts) replaced the 66 files of Plan_OPT_EU, Time_Utilisation_EU and Daily_Losses_EU; the other tables do not carry Product Type values for Chartres.

## Dashboard filters (2026-11-05)
Chartres was hidden by two blended Machine Name filters (from `Live_Plan_OPT_EU` and `Live_Daily_Losses_EU`) on the hidden worksheet "Site Time Utilisation (%)", shared by about 86 sheets. A blended filter drops primary rows with no match in the secondary source, even set to "all"; Chartres losses have no shift, product or time. Removed in the workbook; no data change needed.

## Run9 verification (2026-11-06, local only)
Run9 is in [downloads/chartres-convert/run9](../downloads/chartres-convert/run9); it was not uploaded. The current workbook set differs from run8: 147 day keys were added and 2 removed (net +145 days). Per the user's choice, run9 includes the current files rather than filtering them to match run8. Thus the three day-table counts are equal through 2026-09, but not in October/November:

| Month | Plan_OPT_EU (8 / 9) | Time_Utilisation_EU (8 / 9) | Daily_Losses_EU (8 / 9) | Volume_CoV_EU (8 / 9) |
|---|---:|---:|---:|---:|
| 2025-01 | 1,174 / 1,174 | 367 / 367 | 3,991 / 3,991 | 786 / 787 |
| 2025-02 | 1,193 / 1,193 | 346 / 346 | 4,097 / 4,097 | 721 / 724 |
| 2025-03 | 1,392 / 1,392 | 395 / 395 | 4,779 / 4,779 | 831 / 834 |
| 2025-04 | 1,336 / 1,336 | 389 / 389 | 4,074 / 4,074 | 750 / 750 |
| 2025-05 | 986 / 986 | 306 / 306 | 3,271 / 3,271 | 545 / 545 |
| 2025-06 | 961 / 961 | 322 / 322 | 3,381 / 3,381 | 572 / 573 |
| 2025-07 | 1,180 / 1,180 | 394 / 394 | 4,219 / 4,219 | 714 / 714 |
| 2025-08 | 909 / 909 | 339 / 339 | 3,632 / 3,632 | 561 / 561 |
| 2025-09 | 874 / 874 | 353 / 353 | 3,245 / 3,245 | 549 / 549 |
| 2025-10 | 1,105 / 1,105 | 390 / 390 | 4,059 / 4,059 | 689 / 689 |
| 2025-11 | 899 / 899 | 314 / 314 | 3,252 / 3,252 | 533 / 533 |
| 2025-12 | 629 / 629 | 212 / 212 | 2,310 / 2,310 | 395 / 395 |
| 2026-01 | 1,093 / 1,093 | 326 / 326 | 3,752 / 3,752 | 625 / 625 |
| 2026-02 | 1,098 / 1,098 | 326 / 326 | 3,605 / 3,605 | 647 / 647 |
| 2026-03 | 975 / 975 | 311 / 311 | 3,084 / 3,084 | 553 / 553 |
| 2026-04 | 1,036 / 1,036 | 349 / 349 | 3,687 / 3,687 | 620 / 620 |
| 2026-05 | 715 / 715 | 249 / 249 | 2,560 / 2,560 | 426 / 426 |
| 2026-06 | 1,017 / 1,017 | 331 / 331 | 3,510 / 3,510 | 636 / 636 |
| 2026-07 | 992 / 992 | 317 / 317 | 3,484 / 3,484 | 633 / 633 |
| 2026-08 | 856 / 856 | 294 / 294 | 3,222 / 3,222 | 561 / 561 |
| 2026-09 | 943 / 943 | 297 / 297 | 3,340 / 3,340 | 610 / 610 |
| 2026-10 | 778 / 1,032 | 236 / 319 | 2,568 / 3,514 | 509 / 674 |
| 2026-11 | 0 / 178 | 0 / 62 | 0 / 626 | 0 / 117 |
| **Total** | **22,141 / 22,573** | **7,163 / 7,308** | **77,122 / 78,694** | **13,466 / 13,756** |

`Format_List_EU` is 826 / 827 rows (one file per run). Run8 had no site target tables; run9 has 408 rows each in `Site_PDT_Targets` and `Site_UPDT_Targets` (17 lines x 24 months). The helper wrote 95 local parquet files in run9.

Checks on run9:
- All 22,573 `Plan_OPT_EU` rows have `Good Parts` equal to the source slot `Volume`; all `Defect Parts` equal the source slot `Déchets`. Day totals sum `Volume`.
- OEE targets cover all 21,793 plan rows for the 16 workbook lines with OEE targets, including their own 2025 and 2026 months; 0 missing or incorrect values. Both plan downtime targets matched their Glidepath values on all 21,793 rows. The loss `target` matched its exact bucket on 65,638 rows; unmatched bucket names remain null.
- [duplicates.csv](../downloads/chartres-convert/run9/duplicates.csv) has 19 duplicate pairs: 17 with differing Base columns and 2 marked `same`.
- Every run9 parquet schema for the five existing tables matches run8 exactly (column names, order and types), and is stable within its table. Run8 did not contain the two target tables; their schemas match `reportPdtSchema` / `reportUpdtSchema` in [`scripts/lib-pbi-report-schemas.js`](../scripts/lib-pbi-report-schemas.js).

## Machine part (2026-11-06, run10)
MASTERDATA machine rows are line, machine EN/FR, type EN/FR, part EN/FR (Level 4). Many workbook columns name the machine and a part (`Dysf ETUYEUSE - Introduction Tubes`). Hull stores the same two levels: `Equipment` = machine, Level 3 = `machine - part`. `machinePart()` in the converter takes the French words after the machine name (prefix `Dysf` / `Panne` / `Réglage`, `ZAC` and the MASTERDATA French machine name removed; accents, case, spaces, brackets and dashes ignored) and compares them with the parts of the same line and machine.

| Method (`partMethod` in `loss-map.json`) | Columns | Rows | Minutes 2025-26 | Result |
|---|---|---|---|---|
| exact part | 63 | 2,686 | 85,405 | `machine - part` |
| part name contained, to confirm | 127 | 4,160 | 87,031 | `machine - part` |
| no part: unsure, asked to the site (`PART_UNSURE`) | 12 | 1,042 | 35,332 | machine only |
| no part: several parts match | 6 | 211 | 14,535 | machine only |
| machine only (column names the machine) | 123 | 6,860 | 150,463 | machine only |
| no part found | 254 | 12,197 | 364,534 | machine only |
| no machine in MASTERDATA | 222 | 6,330 | 200,375 | as before |

Site answers go into `PART_ANSWER` (`'LINE|column': 'part EN'` or `null` = machine only), from the review sheet `4 Machine part`; they win over the rule. Then rerun to a new folder. Unsure cases asked to the site: `Chauffe / Scellage` (two parts), `Introduction Tubes / Spatules` and `Débordement Crème / Niveau cuve` (only one half is in MASTERDATA).

Run10 vs run9 (`python -I scripts/helper-chartres-compare-runs.py <run9> <run10>`): same 95 parquet files, same schema, rows and sums of Duration, Loss Units and Good Parts in every file. In `Daily_Losses_EU` only `OEELossLvl3Desc`, `Lvl 3 Loss Name`, `Loss Final Level`, `Equipment Loss Key` and `Volume Key` changed, on 6,846 rows (exactly the rows with a part), plus `loaded_at`. At most 4 parts per machine; distinct Level 3 names per line 5 to 23.
