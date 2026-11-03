# Chartres history load: OEE workbooks (Base) to the three report tables

| At a glance | |
|---|---|
| **What** | One script that turns every day row of the Chartres OEE workbooks (`<group>/<year>/SAISIE OEE/OEE*.xlsm`, sheet `Base`, 2025 and 2026) into rows of `Plan_OPT_EU`, `Time_Utilisation_EU` and `Daily_Losses_EU`, with the columns and types of the other sites (`scripts/lib-pbi-report-schemas.js`) and `Data Source` = `Excel` |
| **Run** | `node scripts/chartres-convert.js out=downloads/chartres-convert/<new folder>` (workbooks from `downloads/01 SITE Chartres`), then `python -I scripts/helper-chartres-write-parquet.py downloads/chartres-convert/<same folder>`. Review for the site: `node scripts/chartres-review.js downloads/chartres-convert/<same folder>` then `python -I scripts/helper-chartres-review-xlsx.py downloads/chartres-convert/<same folder>/review.json prompt-response/chartres-review-for-laura.xlsx` |
| **Writes** | `<out>/report/<table>/site=Chartres/<table>_<YYYY-MM>_excel.parquet` (one file per table and month, the lake layout of [report-config.md](report-config.md)), `<out>/stage/...json` (the same rows before typing) `<out>/checks.csv` (days that fail a rule of the entry form), `<out>/loss-map.json` (each loss column per line: names used, MASTERDATA match) and `<out>/days.json` (one line per day for the review). Local files only: nothing is uploaded |
| **Inputs** | the workbooks (read, no macro run), the sheets `Category` of the 2026 files (French loss name to Level 1 / 2 / 3 English), `Copie de Target 2026.xlsx` (OEE target per line and month, from the site) and `MASTERDATA.xlsx` (sheet `Downtime_updated`: the SIH reason tree, English and French), both in the workbook folder |
| **Status** | Built 2026-10-26; MASTERDATA names and the review added 2026-11-03 (run5): 7,163 days, 22,141 plan rows, 7,163 time rows, 77,122 loss rows, 66 files (Jan 2025 to Oct 2026). Review sent to the site 2026-11-03. Not uploaded; the path format of Chartres and the reference file are still to come |
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
| `Good Parts` | `Volume - Déchets` of the slot, rounded (net of waste, as the workbook OEE). NON TISSE types waste per machine and shift (`Déchets <machine> <shift>`): that waste is spread over the slots of the shift by volume; `Déchets Libre` over all slots of the day |
| `Capacity` | `Vitesse x Temps` (macro rule) |
| `Total Time`, `Planned OpT` | `Temps` of the slot (the slot times add up to TOR) |
| `OEE Time` | `Good Parts / Vitesse`, minutes cut; empty without a speed |
| `Downtime Units` | `Capacity - Good Parts` |
| `OEE Target` | `Copie de Target 2026.xlsx`, line and month. 2025 uses the 2026 value of the same month (assumption of the user). CUPIDON and DAISY have none (dropped in 2026) |
| `UPDT Target`, `PDT Target`, `Value`, `target` | empty: the site's target file has OEE only |
| `OEE Time Total`, `Total Time Total`, `Planned OPT Total`, `All Time` | TU, TOR, TOR (constant `PLANNED_OPT_FROM`), 1440 |
| `OEELossLvl3Group` | Category Level 1 EN: `Planned losses` = `Planned Loss`, `Unplanned losses` = `Unplanned Loss` (the EU names) |
| `OEELossLvl3SubGroup`, `Breakdown Types` | Category Level 2 EN in the EU name where one exists (`Minor stop` = `Minor Stops`, `Adjustment` = `Adjustments`, `Changeover` = `Product Changeover`, `Undefined` (NR) = `Not Logged`, ... constant `SUB`), else as it is (`Breakdown`, `Cleaning`) |
| `OEELossLvl3Desc`, `Lvl 3 Loss Name`, `Loss Final Level` | the MASTERDATA English name where it matches (see MASTERDATA below), else Category Level 3 EN (`Piste` written `Lane`) |
| Category lookup | the Category sheet of the same line (a 2025 file uses its 2026 file), else any Category sheet with the name. Names in no Category sheet (CUPIDON, DAISY, spare `Libre` columns) by the block: `Dysf` = Minor stop, `Panne` = Breakdown, `Réglages` = Adjustment, `Orga` = Cleaning, `Changement` = Changeover, `Rupture` = Lack of Resources, `Qualité` = Quality issue, `Maintenance` = Planned maintenance; the description is then the French machine part |
| `Equipment` | the machine (the same name as Level 3) of `Dysf` / `Panne` / `Réglages` columns, else `Unclassed` |
| `Duration`, `Time in Mins` | the minutes (Duration as ms on 1970-01-01, as the other sites) |
| `Loss Units` | `Vitesse x minutes`, speed of the product with most time that day |
| `Volume Total` | sum of `Capacity` of the line and day |
| `Volume Key`, `Loss Target Key`, `Equipment Loss Key` | the report way (`DD/MM/YYYY machine group sub desc`, `unique sub 01/MM/YYYY`, `machine desc`) |
| `ShiftName`, `PartName`, `Time`, `Product Key` (losses) | empty: `Base` losses are per day |
| `Dept`, `Area`, `Product Type` | empty until the Chartres reference file (constant `MACHINE_INFO`) |
| Not-counted time | TownHall, trials, training, validation are not loss rows (they are outside TOR) |

## Volume_CoV_EU and Format_List_EU (2026-11-03)
`node scripts/chartres-extra-tables.js downloads/chartres-convert/<run>` then the parquet writer again. `Volume_CoV_EU` (13,466 rows): per day, shift and line from the `Plan_OPT_EU` rows, Good Parts over 1,000, the rule of `scripts/vfc/b9-cov-rows.js`. `Format_List_EU` (826 rows): one row per line and product of the plan rows; Brand, FORMAT (`200ml - Cap` = Unit Size `200ml`, Extra Info `Cap`) and CASE (`X6` = `6`) from the sheet `Data` of the same workbook (our mapping, to confirm). 46 products have no Data row. IWKA, CUMULUS, OLYMPE, DAISY, CUPIDON, SUGAR have no BRAND column: Brand is taken from the same product name on another line (2) or from the brand code at the start of the name when all products with that code have one brand (one brand code, 348 products), listed in `format-brand-guess.json` of the run (to check); 81 stay empty (OLYMPE 50, IWKA 2 15, ...). Not possible: `Run_Rates_EU` (hourly), `Site_PDT_Targets` / `Site_UPDT_Targets` (the target file has OEE only, wait for the Glidepaths). Possible, not built: `Historical_OEE_EU` from the 2024 `DOR` files (OEE only; the user left 2024 out).

One day as csv for the site: `node scripts/chartres-one-day.js downloads/chartres-convert/<run> APOLLON 2026-10-22 prompt-response/chartres-one-day-APOLLON-2026-10-22` (a csv per table, git-ignored). Explanation page: `node scripts/chartres-explain-html.js downloads/chartres-convert/<run>` writes `prompt-response/chartres-how-it-works.html` (git-ignored).

## MASTERDATA (2026-11-03)
`MASTERDATA.xlsx` sheet `Downtime_updated` is the reason tree of the new SIH entry page (French on screen, English stored). It is a new tree, not a translation of the workbook Category sheets: the planned / unplanned reasons are finer (e.g. `Changeover` = complete / partial, `Packing/Batch/WO change` = four reasons) and the machines are line, machine, type (Breakdown, Minor Stop, Adjustment), sub part. The workbook losses are per machine, so the history gets the machine and never the sub part. Group and sub group stay the Category ones (the EU classification); MASTERDATA only gives the Level 3 name and `Equipment`.

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
`scripts/chartres-review.js` + `scripts/helper-chartres-review-xlsx.py` write [prompt-response/chartres-review-for-laura.xlsx](../prompt-response/chartres-review-for-laura.xlsx) (site values: git-ignored). Kept short on purpose: 4 sheets (the example day is in the HTML page `chartres-how-it-works.html`). `1 MASTERDATA name` (the loss has a MASTERDATA name: "same name" or "our proposal: please check"), `2 No MASTERDATA (Category)` (English from the workbook Category sheet), `3 No MASTERDATA (ours)` (our translation: CUPIDON, DAISY), `Questions` (8, plain words, one real case each; Minutes 2025-26 are shown, the lists are sorted by them). One row per machine part (Dysf / Panne / Réglage together) or per reason; Yes/No drop-down, a drop-down of the MASTERDATA names (hidden sheet `names`), filters; sorted by minutes, which are not shown. `day=LINE@YYYY-MM-DD` picks another example. Overview diagram: page 0 of [diagrams/chartres-source-map.drawio](../diagrams/chartres-source-map.drawio), with every report table and what Chartres can feed it from (built: the three above; from the workbooks: Volume_CoV_EU, Format_List_EU from sheet Data, Historical_OEE_EU from the 2024 DOR files; waiting for the Glidepaths / reference file: Site_PDT_Targets, Site_UPDT_Targets, Machine Names; no source: Run_Rates_EU, hourly).

## Data choices (from the run of 2026-10-26)
- **Day entered twice**: the newest saving is kept (`Date et heure de la saisie`, else the top row: Base is newest on top). 19 cases, listed by the script.
- **Days that fail a form rule are loaded** and listed in `checks.csv` (rule, detail): TOR = TOP - not counted 7, TU + NR + losses = TOR 80, sum of product Temps = TOR 268, TU = round(OEE x TOR) 794.
- **Negative NR**: on 910 days NR is negative (the operator balanced the day with it). A negative loss is not loaded; the row is in `checks.csv`. The day's losses then add up to more than TOR - TU.

## Checked
- The rule counts agree with `helper-chartres-invariants.js` (5 / 81 / 269 / 804 on the rows before the duplicate rule).
- Against the CREAM macro exports of 2026 (161 days of `PlanOpt/*_plan_opt.xlsx`): Capacity and Total Time per day equal on 149 days, Good Parts on 152 (waste is mostly 0 in CREAM). The 12 other days are not traced yet. Loss minutes equal on 64 of 161: traced on IWKA 1 2026-08-06 (export 621, ours 417): 417 - NR 3 + not-counted 210 (TOP 1380 - TOR 1170) + 8 - 11 = 621. The export holds the not-counted time, leaves NR out, and its name lookup moved 8 minutes from `Dysf ENCAISSEUSE Cermex` (11) to `Dysf DISTRIBUTEUR Spatules`.


## NON TISSE waste (checked 2026-11-03)
The machine waste of HOME and SACHA (typed per machine and shift, not per product) is about 0.01 % of the good parts. The split by volume is kept and no longer asked to the site. SUGAR has no machine waste columns (its waste is per product).

## Deck for the site (2026-11-03)
`prompt-response/chartres-how-it-works-for-laura.pptx` (10 slides, one real day, git-ignored): `PPTXGENJS_DIR=<folder with node_modules/pptxgenjs> PPTX_SKILL_DIR=<pptx skill folder> NODE_PATH=<same node_modules> node scripts/chartres-explain-pptx.js downloads/chartres-convert/<run>`. Look at it with `bash scripts/render-pptx.sh <deck.pptx> <new folder>` (LibreOffice and poppler, installed with winget). The HTML / PDF versions of the same explanation (`scripts/chartres-explain-html.js`) were replaced by the deck.
