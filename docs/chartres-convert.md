# Chartres history load: OEE workbooks (Base) to the three report tables

| At a glance | |
|---|---|
| **What** | One script that turns every day row of the Chartres OEE workbooks (`<group>/<year>/SAISIE OEE/OEE*.xlsm`, sheet `Base`, 2025 and 2026) into rows of `Plan_OPT_EU`, `Time_Utilisation_EU` and `Daily_Losses_EU`, with the columns and types of the other sites (`scripts/lib-pbi-report-schemas.js`) and `Data Source` = `Excel` |
| **Run** | `node scripts/chartres-convert.js downloads/Chartres out=downloads/chartres-convert/<new folder>` then `python -I scripts/helper-chartres-write-parquet.py downloads/chartres-convert/<same folder>` |
| **Writes** | `<out>/report/<table>/site=Chartres/<table>_<YYYY-MM>_excel.parquet` (one file per table and month, the lake layout of [report-config.md](report-config.md)), `<out>/stage/...json` (the same rows before typing) and `<out>/checks.csv` (days that fail a rule of the entry form). Local files only: nothing is uploaded |
| **Inputs** | the workbooks (read, no macro run), the sheets `Category` of the 2026 files (French loss name to Level 1 / 2 / 3 English), `downloads/Copie de Target 2026.xlsx` (OEE target per line and month, from the site) |
| **Status** | Built 2026-10-26, run on all 36 files: 7,163 days, 22,141 plan rows, 7,163 time rows, 77,122 loss rows, 66 files (Jan 2025 to Oct 2026). Not uploaded; the path format of Chartres and the reference file are still to come |
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
| `ShiftName` (plan) | `Semaine Matin`, `Weekend Matin` = Day; `Semaine Après Midi` = Afternoon; `Semaine Nuit`, `Weekend Nuit` = Night (constant `SHIFTS`) |
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
| `OEELossLvl3Desc`, `Lvl 3 Loss Name`, `Loss Final Level` | Category Level 3 EN |
| Category lookup | the Category sheet of the same line (a 2025 file uses its 2026 file), else any Category sheet with the name. Names in no Category sheet (CUPIDON, DAISY, spare `Libre` columns) by the block: `Dysf` = Minor stop, `Panne` = Breakdown, `Réglages` = Adjustment, `Orga` = Cleaning, `Changement` = Changeover, `Rupture` = Lack of Resources, `Qualité` = Quality issue, `Maintenance` = Planned maintenance; the description is then the French machine part |
| `Equipment` | the machine part (Level 3) of `Dysf` / `Panne` / `Réglages` columns, else `Unclassed` |
| `Duration`, `Time in Mins` | the minutes (Duration as ms on 1970-01-01, as the other sites) |
| `Loss Units` | `Vitesse x minutes`, speed of the product with most time that day |
| `Volume Total` | sum of `Capacity` of the line and day |
| `Volume Key`, `Loss Target Key`, `Equipment Loss Key` | the report way (`DD/MM/YYYY machine group sub desc`, `unique sub 01/MM/YYYY`, `machine desc`) |
| `ShiftName`, `PartName`, `Time`, `Product Key` (losses) | empty: `Base` losses are per day |
| `Dept`, `Area`, `Product Type` | empty until the Chartres reference file (constant `MACHINE_INFO`) |
| Not-counted time | TownHall, trials, training, validation are not loss rows (they are outside TOR) |

## Data choices (from the run of 2026-10-26)
- **Day entered twice**: the newest saving is kept (`Date et heure de la saisie`, else the top row: Base is newest on top). 19 cases, listed by the script.
- **Days that fail a form rule are loaded** and listed in `checks.csv` (rule, detail): TOR = TOP - not counted 7, TU + NR + losses = TOR 80, sum of product Temps = TOR 268, TU = round(OEE x TOR) 794.
- **Negative NR**: on 910 days NR is negative (the operator balanced the day with it). A negative loss is not loaded; the row is in `checks.csv`. The day's losses then add up to more than TOR - TU.

## Checked
- The rule counts agree with `helper-chartres-invariants.js` (5 / 81 / 269 / 804 on the rows before the duplicate rule).
- Against the CREAM macro exports of 2026 (161 days of `PlanOpt/*_plan_opt.xlsx`): Capacity and Total Time per day equal on 149 days, Good Parts on 152 (waste is mostly 0 in CREAM). The 12 other days are not traced yet. Loss minutes equal on 64 of 161: traced on IWKA 1 2026-08-06 (export 621, ours 417): 417 - NR 3 + not-counted 210 (TOP 1380 - TOR 1170) + 8 - 11 = 621. The export holds the not-counted time, leaves NR out, and its name lookup moved 8 minutes from `Dysf ENCAISSEUSE Cermex` (11) to `Dysf DISTRIBUTEUR Spatules`.
