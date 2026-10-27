# Chartres OEE workbook to EU report tables: mapping spec

| At a glance | |
|---|---|
| **Purpose** | A self-contained spec for anyone (or any AI assistant) who writes a converter from the Chartres OEE workbooks to the three EU report tables: a script, or a VBA macro inside the workbook |
| **Source** | `<group>/<year>/SAISIE OEE/OEE <LINE> - <YEAR>.xlsm`, sheet `Base` (often hidden) |
| **Targets** | `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU` |
| **Reference implementation** | `scripts/chartres-convert.js` (Node) + `scripts/helper-chartres-write-parquet.py` (parquet). When this spec and the script disagree, the script is what ran; fix this file |
| **Background** | `docs/chartres-source-files.md` (how the workbook works), `docs/chartres-convert.md` (run results and checks) |
| **Status** | Built and run locally 2026-10-26 on 2025 and 2026. Some choices wait for the site's answers (section 8) |

## 1. Source: the sheet `Base`
- Row 1: column names (French). Row 2: entry codes (`ENR1`, `ENR2`, ...): skip. Data from row 3, **newest day on top** (the entry form inserts a new row 3).
- One row = one line (machine) and one day. The line is NOT in the sheet: take it from the file name (`OEE IWKA 2 - 2026.xlsm` = `IWKA 2`; keep accents, `CLÉOPATRE`).
- The group is the top folder: `CREAM Chartres`, `NON TISSE`, `SKIN CARE`. `DOR L3` is management level: never a source.
- **Find columns by name, never by letter.** Column counts differ: 383 (most), 353 (IWKA 3: fewer machine slots), 404 (NON TISSE HOME / SACHA: extra waste columns). Normalise names before matching: trim, collapse whitespace to one space, and read `Week-end` as `Weekend`.
- Empty cell = 0 for numbers.
- 2024 files have a different format (`DOR <group>.xlsm`, sheet `TRS`) and are out of scope.

### Columns used
| Name in `Base` | Meaning | Use |
|---|---|---|
| `ANNEE`, `MOIS`, `JOUR` | year, month, day | **the date of the row**. Do not use the stored `Date` column: it is one day off on some rows |
| `TOP` | planned opening time, minutes | check only |
| `TOR` | real opening time = TOP minus not-counted time; OEE is calculated on it | Total Time of the day |
| `TU` | useful time (TU = round(OEE x TOR)) | OEE Time of the day |
| `NR` | downtime with no reason given (Non Renseigné, to confirm with the site). Can be negative | a loss row |
| From the column after `NR` up to the column before `Code PF1 Semaine Matin` | loss columns, minutes (Organisation, Changement, Rupture, Qualité, `Dysf <part>`, `Panne <part>`, `Réglages <part>`, Maintenance) | loss rows. Skip the three count columns whose name starts with `Nbre` |
| `<Field> PF<k> <Shift>` | product slot k (1 to 4) of a shift. Fields: `Code`, `Temps`, `Volume`, `Déchets`, `Nom`, `Nom Formule`, `Caisse`, `Format`, `Vitesse` | plan rows |
| `Total Temps Fermeture` | not-counted time = TownHall, planned trials, training, validation, spare (`SUM(LR:LW)`) = TOP - TOR | check only, not a loss |
| `OEE` | OEE of the day (value) | check only |
| `Date et heure de la saisie` | time of saving (Excel serial) | pick the newest of a repeated day |
| `Déchets <machine> <Shift>`, `Déchets Libre n` | NON TISSE only: waste per machine and shift instead of per product | spread to slots (rule 4.2) |

Shifts (5): `Semaine Matin`, `Semaine Après Midi`, `Semaine Nuit`, `Weekend Matin`, `Weekend Nuit`.

### Loss names to English: the sheet `Category`
2026 workbooks (not CUPIDON, DAISY, not 2025) have a sheet `Category`: rows 1 and 2 are headers, then `Level 3 FR | Level 3 EN | Level 2 FR | Level 2 EN | Level 1 FR | Level 1 EN`. `Level 3 FR` equals the `Base` column name (trim it: some have a trailing space). `NR` is in it (Level 3 `Undefined`, Level 1 `Unplanned losses`).
Lookup order: the Category of the same line (a 2025 file uses the 2026 file of its line), then any Category sheet, then the block rule:

| Name starts with | Level 2 EN | Level 1 EN | Level 3 |
|---|---|---|---|
| `Dysf ` | Minor stop | Unplanned losses | the machine part (rest of the name) |
| `Panne ` / `Pannes ` | Breakdown | Unplanned losses | the machine part |
| `Réglage ` / `Réglages ` | Adjustment | Unplanned losses | the machine part |
| `Orga` | Cleaning | Planned losses | the French name |
| `Changement` | Changeover | Planned losses | the French name |
| `Rupture` | Lack of Resources | Unplanned losses | the French name |
| `Qualité` | Quality issue | Unplanned losses | the French name |
| `Maintenance` | Planned maintenance | Planned losses | the French name |
| anything else | Undefined | Unplanned losses | the French name |

**Do not copy the workbook's own `LineLosses` macro**: it takes Level 1 / 2 from the first Category row with the same Level 3 text, so every Breakdown and Adjustment comes out as Minor stop.

## 2. Target tables
Types: S = text, I = integer, D = decimal, DATE = day, TS = timestamp in ms. A VBA macro cannot write parquet: write CSV (UTF-8, comma, header row, same column names and order, DATE as `YYYY-MM-DD`, empty = empty field) and let a script type it.

**Plan_OPT_EU**: `Date` DATE, `AreaName` S, `MachineName` S, `ShiftName` S, `PartName` S, `Good Parts` I, `Capacity` D, `Total Time` I, `Planned OpT` I, `OEE Time` I, `Downtime Units` D, `SiteName` S, `Unique Machine Name` S, `Product Key` S, `UPDT Target` D, `PDT Target` D, `OEE Target` D, `Dept` S, `Area` S, `Product Type` S, `Data Source` S, `source_hours` I, `loaded_at` TS

**Time_Utilisation_EU**: `Date` DATE, `MachineName` S, `OEE Time Total` D, `Total Time Total` D, `Planned OPT Total` D, `SiteName` S, `Unique Machine Name` S, `All Time` I, `Dept` S, `Area` S, `Product Type` S, `Data Source` S, `loaded_at` TS

**Daily_Losses_EU**: `Date` DATE, `Time` TS, `MachineName` S, `PartName` S, `Shift Time` S, `ShiftName` S, `OEELossLvl3Group` S, `OEELossLvl3SubGroup` S, `OEELossLvl3Desc` S, `Duration` TS, `SiteName` S, `Unique Machine Name` S, `Breakdown Types` S, `ShiftStartDate` DATE, `Comment` S, `Product Key` S, `Volume Key` S, `Loss Units` D, `Time in Mins` D, `Equipment Loss Key` S, `Equipment` S, `Lvl 3 Loss Name` S, `Loss Target Key` S, `Value` S, `Volume Total` D, `Loss Final Level` S, `Dept` S, `Area` S, `Product Type` S, `Data Source` S, `target` D, `batch_id` S, `comment_count` I, `loaded_at` TS

The authoritative list is `scripts/lib-pbi-report-schemas.js`.

## 3. Rows
1. Keep a `Base` row when `ANNEE` > 2000 and `JOUR` is filled.
2. **A day entered twice** (same line and date): keep the row with the newest `Date et heure de la saisie`; if equal or empty, the upper row (newest on top). Log it.
3. Per kept row:
   - `Time_Utilisation_EU`: 1 row.
   - `Plan_OPT_EU`: 1 row per slot (5 shifts x PF1..PF4) where `Code`, `Temps` or `Volume` is filled.
   - `Daily_Losses_EU`: 1 row per loss column (NR + the loss range) with minutes > 0. Minutes < 0 are not loaded; log them.

## 4. Column rules

### 4.1 Common
| Column | Value |
|---|---|
| `SiteName` | `Chartres` |
| `MachineName` | line from the file name |
| `Unique Machine Name` | `<MachineName>-Chartres` |
| `Data Source` | `Excel` |
| `Dept`, `Area`, `Product Type` | empty until the Chartres reference file (Machine Names) arrives |
| `loaded_at` | time of the run |

### 4.2 Plan_OPT_EU (per slot)
| Column | Rule |
|---|---|
| `Date` | ANNEE-MOIS-JOUR |
| `AreaName` | group: `CREAM Chartres` = `CREAM`, `NON TISSE` = `NON WOVEN`, `SKIN CARE` = `SKIN CARE` |
| `ShiftName` | `Semaine Matin`, `Weekend Matin` = `Day`; `Semaine Après Midi` = `Afternoon`; `Semaine Nuit`, `Weekend Nuit` = `Night` (proposal) |
| `PartName` | `Nom`, else `Code` |
| `Good Parts` | round(`Volume` - waste of the slot). Waste = `Déchets` of the slot, plus for NON TISSE: each `Déchets <machine> <Shift>` spread over the slots of that shift by volume share, each `Déchets Libre n` over all slots of the day by volume share |
| `Capacity` | `Vitesse` x `Temps` |
| `Total Time`, `Planned OpT` | `Temps` (whole minutes) |
| `OEE Time` | trunc(`Good Parts` / `Vitesse`); empty when no speed |
| `Downtime Units` | `Capacity` - `Good Parts` |
| `Product Key` | `<Unique Machine Name> <PartName>` |
| `OEE Target` | site target file (`Copie de Target 2026.xlsx`, sheet `OEE TARGET`: one row per day, one column per line, value constant per month): the value of the line and month. 2025 uses the same month of 2026. Match line names ignoring case, accents, spaces and dashes |
| `UPDT Target`, `PDT Target`, `source_hours` | empty |

### 4.3 Time_Utilisation_EU (per day)
| Column | Rule |
|---|---|
| `OEE Time Total` | `TU` |
| `Total Time Total` | `TOR` |
| `Planned OPT Total` | `TOR` (proposal; TOP is the alternative) |
| `All Time` | 1440 |

### 4.4 Daily_Losses_EU (per loss column with minutes > 0)
Level 1 / 2 / 3 from section 1, then renamed to the EU names:

| Category Level 1 EN | `OEELossLvl3Group` |
|---|---|
| Planned losses | Planned Loss |
| Unplanned losses | Unplanned Loss |
| other (Production not scheduled, NPD/CapEX & Trials) | as is (these are not-counted time and normally do not appear) |

| Category Level 2 EN | `OEELossLvl3SubGroup` |
|---|---|
| Minor stop | Minor Stops |
| Adjustment | Adjustments |
| Lack of Resources | Lack Of Resources |
| Quality issue | Quality Issues |
| Reduced speed | Reduced Speed |
| Planned maintenance | Planned Maintenance |
| Meals & breaks | Breaks / Meals |
| Start-up/end-up & Sanitization | Start up and Sanitisation |
| Changeover | Product Changeover |
| Undefined | Not Logged |
| other (Breakdown, Cleaning) | as is |

| Column | Rule |
|---|---|
| `Date`, `ShiftStartDate` | ANNEE-MOIS-JOUR |
| `OEELossLvl3Desc`, `Lvl 3 Loss Name`, `Loss Final Level` | Level 3 EN |
| `Breakdown Types` | = `OEELossLvl3SubGroup` |
| `Duration` | minutes as a duration (ms = minutes x 60000) |
| `Time in Mins` | minutes |
| `Equipment` | Level 3 for `Dysf` / `Panne` / `Réglages` columns, else `Unclassed` |
| `Loss Units` | minutes x `Vitesse` of the slot with the most `Temps` that day; empty without speed |
| `Volume Total` | sum of `Capacity` of the plan rows of the line and day |
| `Volume Key` | `DD/MM/YYYY <MachineName> <Group> <SubGroup> <Desc>` |
| `Loss Target Key` | `<Unique Machine Name> <SubGroup> 01/MM/YYYY` |
| `Equipment Loss Key` | `<MachineName> <Desc>` |
| `Time`, `PartName`, `ShiftName`, `Shift Time`, `Product Key`, `Comment`, `Value`, `target`, `batch_id`, `comment_count` | empty: `Base` losses are per day, not per shift or product |

Not-counted time (TownHall, trials, training, validation) is **not** a loss row: it is outside TOR.

## 5. Checks (the entry form's own rules; load the day anyway, list failures)
| Rule | Typical failures (2025 + 2026) |
|---|---|
| TOR = TOP - `Total Temps Fermeture` | 7 |
| TU + sum of all loss columns incl. NR (negatives too) = TOR | 80 |
| sum of `Temps` over the 20 slots = TOR | 268 |
| TU = round(OEE x TOR) | 794 |
| NR < 0 (not loaded) | 910 days |

Expected totals of the reference run (all 36 files, 2025 + 2026): 7,163 days, 22,141 plan rows, 7,163 time rows, 77,122 loss rows, 19 repeated days.

Test oracle: the CREAM 2026 daily macro exports (`SAISIE OEE/PlanOpt/*_plan_opt.xlsx`, `LineLosses/*_line_losses.xlsx`, sheet `FilteredData`). Capacity and Total Time per day should match (149 of 161 days do). Loss minutes will NOT match: the export includes not-counted time, leaves NR out, and has the lookup bug.

## 6. Writing it as a VBA macro inside the workbook
- Read `Base` into an array in one call (`Worksheets("Base").UsedRange.Value`), never cell by cell. Build a dictionary `name -> column index` from row 1 (normalised as in section 1).
- Do not change `Base`, `Category`, `Data` or the entry form. Write the output to new sheets or, better, to CSV files next to the workbook (`<folder>\export\<table>_<line>_<YYYY-MM>.csv`), one per table.
- Use the Category sheet of the workbook itself; the fallback block rule covers files without one.
- The target file is outside the workbook: either read it with `Workbooks.Open ... ReadOnly:=True` or leave `OEE Target` empty and let the loading script fill it.
- Write numbers with a dot decimal separator (`Str()` or `Format` with invariant culture, not the French locale comma). Dates as `Format(DateSerial(y, m, d), "yyyy-mm-dd")`.
- Never put credentials or API calls in the macro (anyone who opens the file can read the VBA). Uploading to Insights Hub stays a separate script or flow.
- The existing macros (`Module_PlanOPT`, `Module_LineLosses`, `Workbook_BeforeClose` export) have known bugs; replace, do not extend them. CUMULUS and HOME 2 have no close event.
- Note: Chartres is moving to manual OEE entry in Insights Hub, so a macro is only useful for the gap until that switch.

## 7. Output layout (data lake)
`report/<table>/site=Chartres/<table>_<YYYY-MM>_excel.parquet`, one file per table and month. The Chartres path format from the site is still to come: check before uploading.

## 8. Open points (change the rule, then rerun)
- Meaning of TOP / TOR / TU / NR (asked to the site).
- Shift start and end times; Day / Afternoon / Night naming of the 5 shift types.
- Total Time and Planned OPT: TOR (current) or TOP.
- Which entry of a repeated day is right.
- Split of NON TISSE machine waste per product (current: by volume).
- 2025 targets (current: 2026 values).
- Dept, Area, Product Type from the reference file.
- Optional: rename loss descriptions to the terms of the SIH manual entry page (`MASTERDATA.xlsx`, sheet `Downtime_updated`, English and French Level 1 to 4), so history and new SIH entries use the same names.
