# Chartres OEE source files (OEE*.xlsm)

| At a glance | |
|---|---|
| **What** | The daily OEE entry workbooks of the Chartres site, one per line and year, and what is inside them (sheets, columns, formulas, macros), so they can be recreated and loaded as-is into the report tables |
| **Sources read** | the unzipped folders `downloads/Chartres/<group>/<year>/SAISIE OEE/OEE*.xlsm` (git-ignored, untrusted; 36 files). Nothing was opened in Excel and no macro was run. The VBA source of all 36 files was read as text (`scripts/helper-chartres-vba-extract.py`, 2026-10-26) |
| **Scripts** | `node scripts/chartres-compare.js downloads/Chartres` (all OEE files, picks the pattern itself), `scripts/chartres-profile.js` (one file); they use `readZip` of `scripts/lib-office.js` |
| **Status** | Steps 1 to 3 done on 2026-10-26, VBA read the same day (section 2b). French to English dictionary, column map to the report tables, recompute and automation are NOT started (waiting for the user's go) |
| **Blocker** | DOR L3 has no `SAISIE OEE/OEE*.xlsm` (see below). To confirm with Laura (site owner) |

## 1. Files found (step 1)
Found with the pattern `<group>/<year>/SAISIE OEE/OEE*.xlsm` in the unzipped folders (SKIN CARE 2025 was moved by the user from a wrong place, `2026/2025/`, a copy-paste mistake).

| Group | Lines (one file per line and year) | 2025 | 2026 |
|---|---|---|---|
| CREAM Chartres | CUMULUS, CUPIDON, DAISY, IWKA 1, IWKA 2, IWKA 3 | 6 files | 6 files |
| NON TISSE | HOME 1 to 4, SACHA 1 and 2, SUGAR | 7 files | 7 files |
| SKIN CARE | APOLLON, CLÉOPATRE, NEPTUNE, OLYMPE, ZEUS | 5 files | 5 files |
| DOR L3 | none | none | none |

- 36 files, 0.6 to 2.8 MB each (sizes in the profile output).
- No `OEE*.xlsm` exists for 2024 (CREAM 2024 has `DOR Personal Care.xlsm`, an older file outside the pattern).
- Left out as agreed: Backup, PDF, PPTX, and other xlsm in the same trees (`Archives/`, `Fichiers de travail/`, `SAISIE 2025/` hold copies and tests such as `DOR Personal Care - 27012025.xlsm`).

### DOR L3: blocker for this group only
The zip has no `SAISIE OEE` folder and no `OEE*.xlsm`. The Excel files are other kinds: `L3 DOR.xlsm` (2024), `L3 DOR Version 2025.xlsm`, `BREAKFAST CHARTRES 2025/2026.xlsm`, `L3 board - Daily Management - Chartres.xlsm`, `DATA CHARTRES 2026.xlsm`, `OEE Simulator 2026.xlsx`, and `.pptm` weekly reviews. Which of them is the OEE source of the DOR L3 lines is not known. Not guessed; not profiled. Question for Laura: which file does DOR L3 use for the daily OEE entry?

## 2. How one workbook works (step 2)
Read from the sheet content, the formulas and the VBA source (see 2b, the flow below is confirmed by the code):

1. Operators enter the day through a form (module classes `BSAISIE`, `lancement`, `Retour`). The result is one row per day in the sheet `Base`.
2. `Base` holds 383 columns per day: losses in minutes by category and by machine part, and per shift up to 4 products with time, volume and waste.
3. Hidden sheets read the newest day with `INDIRECT("Base!ET3")` and similar: `OEE` (OEE per product), `OEE global report` (a `TODAY()` day picker).
4. Since 2026 the macros `Module_PlanOPT` and `Module_LineLosses` fill two hidden sheets, `PlanOPT` and `LineLosses`, with the day in the **same layout as the Provideam exports** (see [powerbi-source-files.md](powerbi-source-files.md)). `Module_Update` is a third module.
5. In CREAM 2026 the day is also saved as a file: `SAISIE OEE/PlanOpt/<file>_<yyyymmdd>_plan_opt.xlsx` and `SAISIE OEE/LineLosses/<file>_<yyyymmdd>_line_losses.xlsx` (161 and 165 files, sheet `FilteredData`, same columns as the two sheets). Other groups: not in the download.

### Sheets (three profiled files)
Counts are cells with a value (input) and cells with a formula. `*` = hidden in at least one of the profiled files.

| Sheet | Job | CREAM IWKA 2 2026 | NON TISSE HOME 1 2026 | SKIN CARE OLYMPE 2026 |
|---|---|---|---|---|
| Base | one row per day, 383 columns | A1:NS193, 11,744 input / 2,506 formula | A1:ON192, 8,052 / 2,590 (404 columns) | A1:NS175, 7,278 / 2,352 |
| Data* | master list: SKU CODE, FORMAT, PRODUCTION LINE, FORMULA 1 and 2, CASE, FORMULA NAME, PF NAME, Vitesse (speed) | A1:J215, 918 / 0 | A1:M67, 797 / 65 | A1:K188, 574 / 0 |
| OEE* | OEE per product of the newest day, an Excel table with `INDIRECT` and `IFERROR` formulas | A1:I33, 32 / 163 | A1:L54, 71 / 260 (adds weight and waste ratio columns, VLOOKUP into Data) | A1:I33, 32 / 163 |
| Presentation | empty dashboard sheet | A1:X34, 5 / 0 | same | same |
| Category* | loss tree: Level 3 FR and EN, Level 2 FR and EN, Level 1 FR and EN | A1:F545, 639 / 0 | A1:F536, 585 / 0 | A1:F500, 369 / 0 |
| OEE global report* | day picker, `F9 = TODAY()` | 1 / 1 | same | same |
| LineLosses* | day export, loss rows | A1:AA1981, 781 / 0 | 706 / 0 | 454 / 0 |
| PlanOPT* | day export, product rows | A1:AR2332, 466 / 0 | 451 / 0 | 446 / 0 |

`PlanOPT` and `LineLosses` exist only in the 2026 files of 13 lines, and 3 of those are empty (section 5); `Category` exists in the 2026 files of 16 lines (all except CUPIDON and DAISY). `Feuil1`, `Feuil2`, `Feuil7`... are empty or test sheets in some files. 5 to 10 Excel tables per file, no pivot tables, no external links, no data connections.

### Base columns (CREAM IWKA 2 2026, French names)
The first row holds the names, the second row the codes `ENR1`, `ENR2`, ... (entry fields). Data starts in row 3, newest day on top.

| Columns | French names (examples) | Count |
|---|---|---|
| A to D | ANNEE, MOIS, SEMAINE, JOUR | 4 |
| E to H | TOP, TOR, TU, NR | 4 |
| I to Q | Organisation: Démarrage Ligne, Arrêt Ligne, Pauses, Nettoyage, Désinfection, Perte Cadence, Organisation Autre, Orga Libre 1 and 2 | 9 |
| R to AD | Changements: de Format (+ Nbre), de Formule (+ Nbre), Composant / Lot / OF (+ Nbre), de consommable, Changement Libre 1 to 6 | 13 |
| AE to AM | Ruptures: Formule, Composants, Personnel, Utilité, Technicien, Manque Documentation, Évacuation - Alarme Incendie, OF / Planning, Libre 2 | 9 |
| AN to AT | Qualité: Composants, Formule, Erreur / Retraitement / Recontrôle, Réglages Caméra, Libre 1 to 3 | 7 |
| AU to BZ | `Dysf <machine part>` (Dysfonctionnement = minor stop) | 32 |
| CA to DF | `Panne <machine part>` (breakdown) | 32 |
| DG to EL | `Réglages <machine part>` (adjustment) | 32 |
| EM to ES | Maintenance: Auto Maintenance, Préventive Mensuelle, Annuelle, Autre, Action Planifiée, Libre 1 and 2 | 7 |
| ET to LQ | Product blocks: 5 shifts (Semaine Matin, Semaine Après Midi, Semaine Nuit, Weekend Matin, Weekend Nuit) x 4 products (PF1 to PF4) x 9 fields (Code, Temps, Volume, Déchets, Nom, Nom Formule, Caisse, Format, Vitesse) | 180 |
| LR to LW | Temps non compté: TownHall - Réunion, Essais Planifiés, Formation, Validation / Qualification, Libre 1 and 2 | 6 |
| LX to MI | People: Journée, Matin, Après Midi, Nuit, Week End Matin, Week End Nuit, Libre 1 to 6 | 12 |
| MJ to MS | Totals (formulas): Total Organisation, Changement, Rupture, Qualité, Dysfonctionnement, Panne, Réglage, Maintenance Planifiée, Temps Fermeture, Volume | 10 |
| MT to NG | Checks and results: Vérification TO, OEE, Date, Vérification Semaine, Vérification TOR, Total Déchets, Total Temps de production, Vérification TU, Date et heure de la saisie, Vérification Libre 5 to 9 | 14 |
| NH to NS | Sécurité: Nombre d'actions ouvertes, cloturées, Nombre de "NON" total de la journée, Sécurité Libre 1 to 9 | 12 |

**Formulas in Base** (the same in all files; only column MY and MZ differ in sums): 14 columns, copied down every row:
- `Total Organisation = SUM(I:Q)`, `Total Changement = R + T + V + X`, `Total Rupture = SUM(AE:AM)`, `Total Qualité = SUM(AN:AT)`, `Total Dysfonctionnement = SUM(AU:BZ)`, `Total Panne = SUM(CA:DF)`, `Total Réglage = SUM(DG:EL)`, `Total Maintenance Planifiée = SUM(EM:ES)`, `Total Temps Fermeture = SUM(LR:LW)`.
- `Total Volume`, `Total Déchets`, `Total Temps de production` = sum of the Volume, Déchets and Temps cell of each of the 20 product slots.
- `Vérification TO = TU + NR + sum of the eight loss totals`, `Vérification TOR = TOR + Temps fermeture`.
- `OEE`, `Date`, `Vérification Semaine`, `Vérification TU` and `Date et heure de la saisie` are **values**, not formulas (written by the macro).

### Output sheets (Provideam layout)
| Sheet | Columns | One row is |
|---|---|---|
| PlanOPT | Date, Area Name, MachineName, (4 helper columns with the Base column labels), ShiftName, ShiftStartTime, Batch ID, PartName, Good Parts, Defect Parts, Target, Capacity, OEE, Total Time, Planned OpT, OEE Time, Downtime Units, then Vitesse, TOR and helper columns (AD, Equipe, Temps, Volume, Déchets) | one shift and product slot of one day (a day is about 20 rows) |
| LineLosses | StartDate, MachineName, Batch ID, PartName, ShiftName, (a French loss name), OEELossLvl3Group, OEELossLvl3SubGroup, OEELossLvl3Desc, Duration, ShiftStartDate | one loss of one day (Planned / Unplanned losses; Level 3 text in English from the sheet Category) |

Dates are Excel serial numbers. The sheets hold only the last exported day (about 21 and 60 to 105 rows), so history must come from `Base` or from the daily files.

### Macros
`xl/vbaProject.bin` of 0.77 to 0.88 MB in every file. Modules: `ThisWorkbook`, sheet modules, form `BSAISIE` (the entry form, 3,300 to 3,650 lines, 36 different versions), form `Vérification`, `lancement` (opens the form), `Divers`, `Retour`, and in 2026 `Module_PlanOPT`, `Module_LineLosses`, `Module_Update`, `Module1`. What they do: section 2b.

### Defined names
181 names in the CREAM file, nearly all `_xlpm.*` / `_xleta.*` (parameters of Excel `LAMBDA` functions, shown as `#NAME?`) and broken ones (`#REF!`). Working: `BDBASE = Base!$A$2:$CM$186` (stale, only 91 columns), `PRES = Presentation!$A$1:$G$15`. The workbook uses `LAMBDA`, so a reader that does not calculate cannot recompute it; our script reads the stored values.

## 2b. What the VBA does (read 2026-10-26, nothing run)
Extraction: `python -I scripts/helper-chartres-vba-extract.py downloads/Chartres <new folder>` unzips `xl/vbaProject.bin` in memory, reads the OLE streams and decompresses the module source (MS-OVBA). The source lands in `downloads/chartres-vba/run1/` (git-ignored). The diagram page "2b How it works (VBA)" shows the flow.

**Entry form `BSAISIE`** (opened by `Lance_Saisie`):
- The operator types the day: date and week, safety answers (`Secu1` to `Secu3`), `Temp0` = TOP, `Temp2` = TU, `TempsNR1` = NR, `Temp15` to `Temp18` = the four not-counted times (TownHall, trials, training, validation), the losses by cause (`Orga`, `Change`, `Rupt`, `Qual`, `Dysf`, `Panne`, `Reg`, `Maint`; 24 named slots for each machine block, so the 8 other slots of the block are never written), labour `MOD1` to `MOD6` (Main d'Œuvre Directe), and per shift up to 4 products (code, time, volume, waste).
- `Temp1` = TOR = TOP minus the four not-counted times (computed). The losses total (`Pertes` = NR + Orga + Change + Rupt + Qual + Dysf + Panne + Reg + Maint) must equal TOR - TU (a box turns green at 0).
- For each product code the form does a `VLOOKUP` in the sheet `Data`: name (column I in the IWKA 2 layout), formula (G), format (B), case (F), speed (J). "Non trouvé" refuses the day.
- `Valider` inserts a NEW row 3 in `Base` (newest on top), writes the typed values (323 of the 383 columns; the 60 "Libre" spare columns are never written), inserts the total and check formulas, copies the OEE from the sheet `OEE` (cell C33 = sum of (Volume - Déchets) / sum of (Vitesse x Temps)), the date, the ISO week and the time of saving. Then it refuses the day, and deletes the row, unless: (1) TU + NR + the eight loss totals = TOR, (2) the week matches the date, (3) TOR + not-counted time = TOP, (4) the sum of Temps over the product slots = TOR, (5) every product code is in `Data`, (6) TU = Round(OEE x TOR). The form `Vérification` then asks the user to confirm; Cancel deletes the row.
- Measured on all 7,181 day rows of the 36 files (`node scripts/helper-chartres-invariants.js`): rule (3) fails on 5 rows, (1) on 81, (4) on 269, (6) on 804, mostly 2025 (older form versions or later edits).

**Export macros** (13 lines, 2026): `ThisWorkbook.Workbook_BeforeClose` (11 of the 13) runs `Run_Reports` (`LineLosses` then `PlanOPT`) and `Export_All_CSVs`, for the ONE day in the sheet `OEE global report`, cell F10. The export saves `<workbook>_<yyyymmdd>_line_losses.xlsx` and `_plan_opt.xlsx` in the folders `LineLosses` and `PlanOPT` (the same day again overwrites). CUMULUS and HOME 2 have the modules but no close event.
- `PlanOPT`: 21 rows per Base row of that date (20 slots + 1 spare). Batch ID = Code, Total Time = Temps, Good Parts = Volume (Déchets is read but never written), speed looked up in `Data` by the code, Target = Capacity = speed x time, OEE = Good Parts / Capacity, Downtime Units = Capacity - Good Parts, TOR = the first Base column from H whose name contains "TOR" (that is "Vérification TOR" = TOP). Planned OpT and OEE Time are never written. PartName = one column of `Data` chosen per file (D in IWKA 2, B in CUMULUS, IWKA 1, IWKA 3, OLYMPE, M in HOME), so it is a format or a code, not always a name. AreaName ("CREAM", "NON WOVEN", "SKIN") and MachineName are typed in the code of each file. The export keeps only rows with a PartName.
- `LineLosses`: one row per Category row, French name, Level 3 English text, then Level 1 and Level 2 taken from the FIRST Category row with the same Level 3 text (not from its own row): a bug. Because "Filling machine", "Other" and similar texts exist under Dysf, Panne, Réglages and Organisation, every Panne and Réglages line comes out as "Minor stop" and every "Autre" line as Planned losses / Cleaning. 19 to 49 rows per file are wrong. The duration (looked up by the French name in Base) is right.
- Exceptions: CLÉOPATRE `Module_PlanOPT` writes MachineName "APOLLON" (copy mistake) and `Module_LineLosses` "CLEOPATRE" without accent; ZEUS `Module_PlanOPT` is empty (the call would fail); CUPIDON and DAISY have no export macros; SACHA 1, SACHA 2 and SUGAR have `Module1` with `Load_LineLosses` and `Load_PlanOPT`, which fill a whole month with `LET` / `SEQUENCE` formulas for the month typed in a cell (the target sheets are not in our copies). The January files were probably made like that (inferred).

## 3. Groups and years compared (step 3)
**One template, not several.** All 36 files share the same skeleton: same sheets, same 14 Base total formulas, same block order and sizes (4 + 4 + 9 + 13 + 9 + 7 + the three machine blocks + 7 + 180 + 6 + 12 + totals + checks + 12). What changes between files is below.

| Difference | Detail | Files |
|---|---|---|
| Machine part columns | The names of the three machine blocks (Dysf / Panne / Réglages) are specific to the line; the unused ones are `Libre n`. About 63 to 85 of the 383 names differ from CREAM IWKA 2 | every line |
| Fewer columns | IWKA 3: 353 columns (22 Dysf, 22 Panne, 22 Réglages) | IWKA 3, 2025 and 2026 |
| Réglages named `Réglage` | The first 18 Réglages slots are called `Réglage <part>` (singular) | APOLLON, CLÉOPATRE |
| More columns | NON TISSE: 404 columns. Adds `People ZAC / Ext ZAC` (12), `Déchets <machine> <shift>` (15 in HOME, 5 in SACHA, in the 2025 files too) and `Déchets Libre 1 to 6`; `Total Déchets` then sums those columns, not the product waste cells (checked on HOME 1). All SKIN CARE files and NON TISSE HOME / SACHA have the 12 `People ZAC` columns, CREAM and SUGAR do not | HOME, SACHA (2025, 2026); SKIN CARE |
| Sheet `OEE` | HOME has 12 columns (waste weight, ratio) instead of 9 | HOME 1 to 4 |
| Output sheets | `PlanOPT` and `LineLosses` (with their macros) exist only in the 2026 files of CUMULUS, IWKA 1 to 3, HOME 1 to 4, APOLLON, CLÉOPATRE, NEPTUNE, OLYMPE, ZEUS (13 files); CUMULUS, APOLLON and CLÉOPATRE hold no day. `Category` is in 16 files of 2026. None in any 2025 file, nor in CUPIDON and DAISY (and no PlanOPT in SACHA 1 and 2, SUGAR) | see list |
| Macro modules | 2025: 3 modules; 2026 lines with output sheets: 5 to 6 (`Module_PlanOPT`, `Module_LineLosses`, `Module_Update`); SACHA / SUGAR 2026: 4 | see list |
| Hidden sheets | Which sheets are hidden varies by file (Base is visible in some, hidden in others) | all |
| Empty files | `OEE CUPIDON - 2026` and `OEE DAISY - 2026` hold no day (template only). CUPIDON 2025 ends 2025-09-22, DAISY 2025 ends 2025-11-06 | 2 |

### Per file (rows = row 3 on, with an ANNEE value)
| Group | File | Year | Base columns | Day rows | First to last date | Output sheets |
|---|---|---|---|---|---|---|
| CREAM | CUMULUS | 2025 | 383 | 280 | 2025-01-06 to 2026-01-04 | no |
| CREAM | CUPIDON | 2025 | 383 | 88 | 2025-01-06 to 2025-09-22 | no |
| CREAM | DAISY | 2025 | 383 | 202 | 2025-01-06 to 2025-11-06 | no |
| CREAM | IWKA 1 | 2025 | 383 | 266 | 2025-01-05 to 2025-12-23 | no |
| CREAM | IWKA 2 | 2025 | 383 | 271 | 2025-01-05 to 2025-12-23 | no |
| CREAM | IWKA 3 | 2025 | 353 | 244 | 2025-01-06 to 2025-12-23 | no |
| CREAM | CUMULUS | 2026 | 383 | 253 | 2026-01-03 to 2026-10-23 | yes |
| CREAM | CUPIDON | 2026 | 383 | empty | none | no |
| CREAM | DAISY | 2026 | 383 | empty | none | no |
| CREAM | IWKA 1 | 2026 | 383 | 221 | 2026-01-05 to 2026-10-23 | yes |
| CREAM | IWKA 2 | 2026 | 383 | 180 | 2026-01-05 to 2026-10-23 | yes |
| CREAM | IWKA 3 | 2026 | 353 | 189 | 2026-01-05 to 2026-10-23 | yes |
| NON TISSE | HOME 1 / 2 / 3 / 4 | 2025 | 404 | 216 / 231 / 224 / 231 | 2025-01-06 to 2025-12-23 | no |
| NON TISSE | SACHA 1 / 2 | 2025 | 404 | 279 / 299 | 2025-01-06 to 2025-12-23 | no |
| NON TISSE | SUGAR | 2025 | 383 | 182 | 2025-01-08 to 2025-12-23 | no |
| NON TISSE | HOME 1 / 2 / 3 / 4 | 2026 | 404 | 186 / 189 / 196 / 196 | 2026-01-05 to 2026-10-23 | yes |
| NON TISSE | SACHA 1 / 2 | 2026 | 404 | 228 / 221 | 2026-01-05 to 2026-10-23 | no |
| NON TISSE | SUGAR | 2026 | 383 | 140 | 2026-01-06 to 2026-10-16 | no |
| SKIN CARE | APOLLON | 2025 / 2026 | 383 | 232 / 190 | 2025-01-06 to 2025-12-23 / 2026-01-05 to 2026-10-22 | no / yes |
| SKIN CARE | CLÉOPATRE | 2025 / 2026 | 383 | 115 / 112 | 2025-01-06 to 2025-12-18 / 2026-01-05 to 2026-10-05 | no / yes |
| SKIN CARE | NEPTUNE | 2025 / 2026 | 383 | 220 / 186 | 2025-01-06 to 2025-12-23 / 2026-01-05 to 2026-10-23 | no / yes |
| SKIN CARE | OLYMPE | 2025 / 2026 | 383 | 249 / 169 | 2025-01-05 to 2025-12-22 / 2026-01-05 to 2026-10-23 | no / yes |
| SKIN CARE | ZEUS | 2025 / 2026 | 383 | 336 / 195 | 2025-01-05 to 2026-01-04 / 2026-01-03 to 2026-10-09 | no / yes |

Dates are from the `Date` column. A Base row is one day of one line (IWKA 2 2026: 179 rows, 179 distinct dates). A few files repeat a date: CUMULUS 2025 has 7 repeated days, ZEUS 2025 has 2 (two entries for one day, to check before loading). The files run 7 days a week.

## 4. Macro output against the workbook (2026-10-26, diagram page 2)
Checked on the 10 files whose `PlanOPT` / `LineLosses` hold a day (IWKA 1 to 3, HOME 1 to 4, NEPTUNE, OLYMPE, ZEUS):
- Plan rows: `Good Parts` = `Volume` of the slot, `Target` = `Capacity` = `Vitesse` x `Temps`, `Total Time` = `Temps`, `Downtime Units` = Target - Good Parts. Equal on every row. `Planned OpT` and `OEE Time` are empty (ZEUS has some values). `Good Parts` ignores `Déchets`, unlike the sheet `OEE` (Volume Réel = Volume Annoncé - Déchets). `ShiftName` is the number 1 to 5.
- Loss rows (cause found in the code, section 2b): the French name is looked up in `Category`, but Level 1 and 2 come from the first row with the same Level 3 text, so every `Panne` and `Réglages` line is written as "Minor stop" (Category: Breakdown, Adjustment) and every `Dysf / Panne / Réglages ... Autre` line as Planned losses / Cleaning / Other (Category: Unplanned / Minor stop, Breakdown, Adjustment / Other). 19 to 49 rows per file differ.
- Time: `TOR` = `TOP` minus the not-counted columns (LR to LW); `TU` = Round(OEE x TOR) by the rule of the form (section 2b), not simply the sum of Volume / Vitesse (that sum is off by more than 1 minute on about 14 percent of the days, because the OEE nets the waste); `Vérification TO` = TU + NR + the eight loss totals = TOR.
- Macro history: the daily export files start 2026-08-01 / 03 (to 2026-10-23, SKIN CARE to 2026-10-06; 12 of 18 lines); January 2026 has one file per line (5 to 30 Jan, 13 lines, all in the NON TISSE folders `PlanOPT_january` / `LineLosses_january`). Nothing for 2025 and for February to July 2026.
- Decision (user, 2026-10-26): the Plan / LineLosses conversion was for a Power BI project that was stopped; build from `Base` directly, use the macro output only as a test.
- Diagram of all this, the columns and the mapping to the three report tables: `diagrams/chartres-source-map.drawio` (`node scripts/helper-chartres-diagram-data.js`, `node scripts/build-drawio-chartres.js`).

## 4b. One row per Base column (Excel)
`node scripts/helper-chartres-base-columns.js` then `python -I scripts/helper-chartres-base-columns-xlsx.py` write `downloads/chartres-base-columns.xlsx` (git-ignored, it holds product names): sheet 1 the 383 columns of the reference template (CREAM IWKA 2 2026) with French name, entry code, English, type, example, meaning, formula, target table, how sure, and in how many of the 18 files of 2026 the name exists; sheet 2 the 665 columns of the other lines that are not in the reference. The `People` columns hold labour time in person-minutes (for example 2250), not a headcount.

## 5. Open points
1. DOR L3: which file is the OEE source (Laura).
2. Time_Utilisation_EU: which of TOP and TOR is Total Time and which is Planned OPT. The Plan_OPT_EU slot times add up to TOR (enforced).
3. Good Parts: the macro writes Volume, the OEE of the workbook uses Volume - Déchets. Proposal: net.
4. Days that fail the form rules (about 1,100 of 7,181) and dates entered twice (CUMULUS 2025: 7, ZEUS 2025: 2): load and flag, or leave out.
5. Losses are per day, not per shift or product: what to put in ShiftName, PartName and Time of Daily_Losses_EU.
6. Which lines are still in production (CUPIDON and DAISY have no days in 2026).
7. Tell the site about the LineLosses lookup bug, the CLÉOPATRE machine name and the empty ZEUS module? Our rows will use the Category row itself.
8. Meaning of the abbreviation NR (not spelled out in the code).
