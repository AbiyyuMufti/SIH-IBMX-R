# Site dashboards (Nottingham, Hull): what they need beyond the EU report

| At a glance | |
|---|---|
| **What** | Analysis of the two site-level Power BI reports (Nottingham Site OEE Report 2025 V1, Hull Site OEE Report 2025 V3.1), read from their templates (`.pbit`), compared with the EU report template and with our three visualization tables (`Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU`) plus the reference files (Machine Names, Shift Naming, Glidepaths, Equipment Coding) |
| **Why** | The site dashboards and the EU dashboard become one Tableau workbook. The agreed pages follow the Nottingham dashboard. We need to know which data the site pages use that our EU-level tables do not have yet |
| **Steps** | 1 data model (this version), 2 what the agreed pages read, 3 comparison with the EU model and our tables, 4 what SIH can give |
| **Status** | Steps 1 to 4 done (2026-10-23). Nothing built (decision of the user): all open decisions are in section 5 |
| **Files** | Outside the repo (customer paths and names). Re-read with `node scripts/helper-pbit-outline.js <file.pbit>` |
| **Diagram** | `diagrams/site-dashboards-map.drawio`: 6 pages (agreed pages, EU filters, sources and tables, SIH coverage, open decisions, parked differences) plus every page of `powerbi-data-map.drawio` copied unchanged (prefix `PBI map:`). Rebuild: `node scripts/build-drawio-site-dashboards.js`, then `node scripts/validate-drawio.js diagrams/site-dashboards-map.drawio` |

## Step 1: data model of each file

### 1.0 Files checked
- Both files are templates: model without data, no `DataModel`. Nottingham uses the new Power BI report format (one file per page and visual). Hull uses the old format (one `Report/Layout` file): step 2 needs the helper extended for it.
- Both files have saved but unapplied query changes (`UnappliedChanges`). They are equal to the applied queries in both files, so the model below is the current one.
- Compared with: the EU template `Temp EU Daily OEE Report 2025 V1 1.pbit` (the original, not our earlier summary), table by table, column by column and query step by step.

### 1.1 Nottingham model (21 tables)
Grain and role. "EU twin" = the table of the EU model built from the same files.

| Table | Grain | Source (SharePoint) | Role | EU twin |
|---|---|---|---|---|
| Plan OPT N | day x machine x shift x part | Nottingham Plan OPT exports | fact | Plan OPT N, then Plan OPT EU |
| Daily Line Losses N | one row per stop | Nottingham Line Losses exports, joined to 5 lookups | fact | Daily Line Losses N, then Daily Losses EU |
| Time Utilisation N | day x machine (minutes summed) | Plan OPT exports again | fact | Time Utilisation N, then Time Utilisation EU |
| Run Rates N | hour x machine x part | Nottingham Run Rates exports | fact | Run Rates N, then Run Rates EU |
| Volume CoV N | day x shift x machine | Plan OPT exports again (grouped) | fact | Volume CoV N, then Volume CoV EU |
| **Historical OEE N** | day x machine: OEE, Availability, Performance | Nottingham "Historical OEE" folder | fact | **none (new)** |
| Machine Names N | machine | Machine Names file | dimension | Machine Names N, then Machine Names EU |
| Shift Naming N | shift name | Nottingham "Shift Pattern Naming" file (3 columns: Shift Type, **Day**, Shift) | dimension | Shift Naming Provideam (regional file, 2 columns, no Day) |
| Format List | product key | **the Hull Formats folder** (Hull SharePoint site) | dimension | Format List EU (regional "Formats EU" file, with Site Name) |
| Calendar | day | DAX, 2011 to 2050, plus `Day` (Mon, Tue...) | dimension | Calendar (no `Day`) |
| Volume Loss Correction N, Equipment Coding N, Targets Volume N | lookups joined into Daily Line Losses N | site files | staging | identical in the EU model |
| Targets N, OEE / UPDT / PDT Targets N | lookups joined into the facts | Nottingham "GlidePath Targets" folder (Line, OEE Bucket, 36 month columns, no Site Name) | staging | Targets Losses EU, OEE / UPDT / PDT Targets EU (regional "Glidepaths" file with Site Name) |
| **Period** | 14 rows: 2025, 2026 YTD, Q1 to Q4, Month -3 to -1, MTD, Week -4 to -1 | DAX table | slicer helper | **none (new)** |
| **Metrics** | 2 rows: OEE, Rate Loss | DAX table | slicer helper | **none (new)** |
| **Last Refresh** | 1 row: refresh time | query | label | **none (new)** |

Relationships: every fact joins Machine Names N on `MachineName` (not the EU `Unique Machine Name`), Format List on `Product Key`, Shift Naming N on `ShiftName = Shift Type`, Calendar on `Date` (losses on the shift start date). Historical OEE N joins only Machine Names N, not the Calendar.

### 1.2 Hull model (20 tables): what differs from Nottingham
Same design, with an older generation of the queries:
- Table names without the site letter (`New Plan OPT`, `New Daily Line Losses`, `New Machine Names`, `Time Utilisation`, `Run Rates`, `Volume CoV`...). All read the Hull SharePoint site.
- **Shift: colour, not shift time.** No join to a shift naming table. `ShiftName` is split at `-` into `Shift Type` and `Shift Colour` (empty colour becomes `Pink`), and a fixed table `Shift Colours` is the shift dimension. Nottingham and the EU model join the Shift Naming file and use `Shift Time`.
- **Two OEE history tables instead of one:** `Historical OEE` ("Performance Availability" folder: day, machine, OEE, Availability, Performance) and `Performance Metrics` ("Daily Performance Metrics" folder: day, machine, Availability, Performance, one row per machine and day, no `GT4 - Auto`). Neither is in the EU model.
- **Loss sub group names stay as exported** (`Adjustment`, `Minor Stop`, `Meals & Breaks`, `Product Change Over`, `In process Quality Control`...). The EU query renames them to the common names (`Adjustments`, `Minor Stops`, `Breaks / Meals`, `Product Changeover`, `In Process Quality`...). The Hull measures use the raw names. `Breakdown Classification` = the EU `Breakdown Types`.
- Glidepaths from the Hull "Targets GlidePath" folder (Line, OEE Bucket, 24 month columns). Formats from the same Hull folder as Nottingham.
- No Period, Metrics, Last Refresh tables.

### 1.3 Load rules: site dashboards against the EU model
The site queries are the EU site queries before the EU added its own steps. The site steps are the same as ours, apart from the points in this list.

| Rule | Site dashboards | EU model (and our build, which copies it) |
|---|---|---|
| **Machine filter, Nottingham** | all machines except `N11 Auto` (plan, util, CoV) and `B1 - Auto`, `B4 Auto`, `B5 Auto` (losses) | in addition: Plan OPT only areas `SD Packing` and ` Strepsils Packing` and not `S14`; Time Utilisation only 23 packing lines; losses without `Bosch`, `Fette*`, `Gran0`, `S14`; Machine Names only the two packing areas; Run Rates and Volume CoV without the process machines |
| **Machine filter, Hull** | all machines except `GT4 - Auto` | in addition: 19 process machines out (`4 Tonne`, `6 Tonne`, `6000L`, `Analgesics Processing`, `Bosch Capsulator `, `GG4` to `GG7`, `Lemsip Process`, `Senokot Press`, ...); Machine Names only Dept `Dries Pack` and `Liquids Pack` |
| Machine key | `MachineName` | `Unique Machine Name` = machine + `-` + site (targets and product keys use it too) |
| Shift | Nottingham: Shift Naming N (site file, has `Day`). Hull: shift colour split | Shift Naming Provideam (regional file) |
| Sub group names | Nottingham: same renames as EU. Hull: raw names | renamed to one common list |
| Glidepaths | site file without Site Name | regional file with Site Name (the one we hold in `eu_report/reference/glidepaths/`) |
| Formats | Hull Formats folder for both sites | regional "Formats EU" file |

**Result of 1.3.** Most of what the site pages show beyond the EU pages is not new data. It is rows the EU drops: the manufacturing and process machines. In the Nottingham Machine Names file, 41 of 66 machines are outside the two packing areas (granulation, compressing, coating, Optrex, Pharma Pac, Strepsils manufacturing). Their rows are already in the Provideam month files we hold (`plan_opt`, `line_losses`, `volume_loss_correction`). Our build removes them, because it copies the EU filters. They come back if the filter becomes a per-site setting instead of a fixed rule.

### 1.4 Columns: site fact tables against our three visualization tables
Our tables = the EU union tables + `Dept`, `Area`, `Product Type`, `Data Source`.

| Our table | Site columns we do not have | Can it be calculated from what we have? |
|---|---|---|
| `Plan_OPT_EU` | `ShiftStartTime`, `Defect Parts`, `Target` (rate), `OEE` (per row), `Shift Time` (Hull: `Shift Type`, `Shift Colour`) | No for the first four (they are in the Plan OPT export, our build drops them). `Shift Time` is a lookup in the Shift Naming file |
| `Plan_OPT_EU` | `Week`, `Week Start`, `Year`, `* (Min)` minutes, `Good Parts - No Zeros`, `Targets Key` | Yes (dates, time to minutes, 0 to empty, key) |
| `Time_Utilisation_EU` | `Running %`, `Planned Running %`, `Utilized Running %`, `Run Time (Hours)`, `Planned Time (Hours)`, `Available Time (Hours)` | Yes, all are calculated columns |
| `Daily_Losses_EU` | `Duration (Minutes)`, `Duration (Hours)`, `Loss in CUs`, `Target %` (Hull: `Shift Type`, `Shift Colour`, `Breakdown Classification`) | Yes. `Loss in CUs` = Loss Units x Duration / Time in Mins, all three columns are in our table |
| none | **Run Rates** (hourly Good Parts and Capacity per machine and part) | No: a separate Provideam export. We hold 3 raw files per site, not normalized, not in the lake |
| none | **Volume CoV** (day x shift x machine: Good Parts sum, max Capacity, time on shift; kept only above 1,000 parts; outlier flag) | Yes, from `Plan_OPT_EU` (Date, ShiftName, MachineName, Good Parts, Capacity, Total Time) |
| none | **Historical OEE** (Hull also **Performance Metrics**): OEE, Availability, Performance per machine and day | No: separate Provideam exports, not downloaded |
| none | **Format List** (Brand, Unit Size, Unit Count/Format, Extra Info) | Reference file: Hull, Weinheim and Mira are in `sharepoint/reference/format_list/`, **no Nottingham file**. The Nottingham dashboard reads the Hull file, so its Nottingham product keys probably find no format (to check in step 2) |
| none | Shift Naming `Day` column (Nottingham) | Not in our 2-column shift file |

### 1.5 Measures (DAX that the Tableau workbook must copy)
- **Nottingham, 89 measures:** 51 are the same as in the EU model, 0 changed, 38 new:
  - period measures on the Period slicer: OEE, Loss % and stop count for 2025, YTD, Q1 to Q4, Month -1 to -3, MTD and Week -1 to -4; `OEE Period`, `Rate Loss Period`, `OEE/Loss matrix`, `Count Dynamic`, `Count 2026 YE Estimate`
  - `Rate Loss calculation` = 1 - (Loss % CU without Not Logged + Weighted OEE)
  - `MTBF RAW` = (planned minutes - stop minutes) / number of stops
  - `Total Hours` (sum of stop hours)
  - `Volume Target`, a hard-coded constant
  - `Data Accurate` (refresh label)
- **Hull, 52 measures:** 27 the same as the EU, 14 changed and 11 new. All of the changed and new ones are the per-sub-group loss measures and their target gaps, rewritten for the raw Hull sub group names. Also, `UPDT Target %` and `PDT Target %` divide by 100 in Hull but not in Nottingham or the EU. Either one model is wrong or the glidepath files use different units; to check in step 2.
- The EU-only measures (running hours, `Loss % of Site`, the `(EU)` copies) are not in the site files.
- None of the new measures needs a new column. They are time windows and ratios on the columns listed in 1.4.

### 1.6 Summary for step 1
1. **New source data:** two Provideam export types (Historical OEE / Performance Metrics, Run Rates), and the Nottingham Format List file. Nothing else.
2. **Rows we already have but filter out:** manufacturing and process machines of both sites. This is the biggest gap. It is a filter decision, not new data.
3. **Columns we drop:** `ShiftStartTime`, `Defect Parts`, `Target`, `OEE` in Plan OPT. Step 2 found that no page uses them, so no change is needed.
4. **Calculated in Tableau:** all calculated columns, Volume CoV and the period measures.
5. **Differences to settle:** Hull shift colours against Shift Time, Hull raw sub group names, the site glidepath files against the regional file we hold, and the UPDT/PDT target /100. All four were settled in step 3 (3.1, 3.2): the regional Shift Naming file maps Hull shifts to their colours, we keep the common sub group names and the regional glidepaths, and Tableau divides the targets by 100.

### 1.7 Questions for step 2
- Which agreed pages read the process machines, Historical OEE, Run Rates, Volume CoV, Format List, `Defect Parts`, `Target`, `OEE`, `ShiftStartTime`?
- Do the site pages filter by area or department, so that the process machines are shown on their own pages (for example Maintenance or L2/L3 FIT View)?
- Is Hull's shift colour shown on By Shift Breakdown, or only the shift type?

### 1.8 Answers to the user's questions on step 1 (2026-10-23)
1. **Are the filters deliberate in the EU report?** Yes. They are explicit query steps in the EU file (area, department and machine lists, section 1.3), so the EU report shows packing lines only. For the one workbook: do not filter in the build. Keep the EU scope as a column instead, for example `In EU Report`. It is true when the machine is in the EU-filtered Machine Names: Nottingham areas `SD Packing` and ` Strepsils Packing`, Hull Dept `Dries Pack` and `Liquids Pack`. The EU pages filter on it; the site pages do not. The Machine Names lookup must be unfiltered too, so Dept, Area and Product Type are filled for every machine. The exclusions that both reports apply stay in the build: Nottingham `N11 Auto` (plan side) and `B1 - Auto`, `B4 Auto`, `B5 Auto` (losses), Hull `GT4 - Auto`. Page-level rules stay in Tableau (S14 only on the VSU pages, packing only on Volume Trending, section 2.2).
2. **Historical OEE range:** the page titles say "OEE Trending (Jan 22 - Nov 24)" (Nottingham) and "(Jan 22 - Oct 24)" (Hull). The chart title is "Historical OEE (Old Method) by Month and Year". It is a frozen archive of the period before the Provideam Plan OPT data, which starts in Dec 2024. It was calculated with an older method, so it is not a compacted copy of the current data. It has one row per machine and day. The page uses only `OEE`, as a simple average (not weighted), by month, line and department. For archiving, a one-time static table (day or month x machine x OEE) is enough. The range comes from the titles only; the files would confirm it.
3. **Run Rates:** used now. In the EU file, the pages By Shift and By Format exist but are hidden, so no visible page used Run Rates. Both pages are on the agreed list: By Shift Breakdown ("Run Rate Comparison (CUs/hr)") and By Format Breakdown ("Run Rates by SKU (CUs/hr)") show the average good parts per hour and `% Adherence` (average Good Parts / average Capacity).
4. **Format List:** used only on By Format Breakdown. It maps a product to `Brand`, `Unit Size`, `Unit Count/Format` and `Extra Info`, so that OEE, losses and run rates can be grouped by brand and pack format. The key is `Product Key` = MachineName + space + PartName, exactly as in the Plan OPT export. File columns: Site Name, MachineName, Product Name, Brand, Unit Size, Unit Count/Format, Extra Info, one row per machine and product. A starter list (every MachineName + PartName pair in the Nottingham Plan OPT files) can be made from the files we hold, for Nottingham to fill in.
5. Dropped columns: not needed, because no page uses them (section 2.3).

## Step 2: what the agreed pages read
Read with `node scripts/helper-pbit-outline.js <file> --report` (it now also reads the old Hull format and names the pages) and a dump of each visual. The measures named here are defined in section 1.5.

### 2.1 Agreed pages and their data
"Ours" = our three tables and the reference files have every field the page needs.

| Agreed page | Source page | Fields and measures | Data |
|---|---|---|---|
| Site-Level Overview (enhanced) | Nottingham Homepage | The same visuals as the EU Site-Level Overview: hours cards (available, planned, run), Time Utilisation %, gauges for OEE, planned loss and unplanned loss against targets, loss by sub group against `Weighted Target % (per Subloss)`, monthly trend against PDT and UPDT targets, Volume vs Loss treemap, Top Losses, Event Count & MTTR | Ours. The Hull Homepage adds Availability and Performance gauges from Performance Metrics (Hull only, not in Nottingham) |
| VSU Homepage | Nottingham VSU Homepage | Copy of the Homepage with the page filter MachineName = `S14` | Ours, once S14 is no longer filtered out |
| Planned Losses | Nottingham Planned Losses | As the EU page, plus a sub group slicer. The drill-down shows `Loss in CUs` (the EU shows Loss Units) | Ours |
| Unplanned Losses | Nottingham Unplanned Losses | As the EU page, plus a sub group slicer | Ours |
| VSU Losses | Nottingham VSU Losses | Loss page with the page filter `S14`, planned and unplanned together | Ours, once S14 is no longer filtered out |
| Unplanned Losses Daily Report | Hull | Cards, slicers (also `Lvl 3 Loss Name` and shift colour) and the stop drill-down: machine, stop, comment, date, minutes, count, Loss % CU, Loss in CUs | Ours |
| L2/L3 FIT View | both | Matrix of machine x shift for the last 24 h (Calendar filter relative to today): Good Parts, Capacity, OEE, Loss %, 16 sub group loss % measures; Top Losses table | Ours |
| Loss Trending | both | Loss % and MTTR by month, week and line; top losses drill (group, sub group, equipment, stop, final level); planned and unplanned % by Product Type | Ours |
| Maintenance | both | Breakdowns only: MTTR (average minutes) and MTBF (`MTBF RAW`) by week, month and line; drill by `Breakdown Types` (Electrical / Mechanical), equipment and stop | Ours. The weekly MTTR chart averages `Duration (Minute Only)`, which drops the hours: this is a bug in the source, do not copy it |
| By Shift Breakdown | both | OEE per shift by month and week; top 3 planned and unplanned losses per shift; average activity minutes; a table per shift with `AVG Volume`, `CoV Aggregate` (Volume CoV, rows with `Capacity Checker` = 0), average run rate, `% Adherence`, OEE and OEE target adherence | Ours + **Run Rates** + Volume CoV (from Plan OPT) |
| By Format Breakdown | both | OEE by brand and size and by brand and format; loss drill; `Loss Normalised` by product key; loss % by month; top 5 losses by format; run rates by SKU | Ours + **Run Rates** + **Format List** |
| OEE Trending | both | OEE against the OEE target by year, month, week, line and department; part slicer | Ours |
| Historical OEE | both | Average OEE by month and year, by line and by department (Jan 2022 to Nov 2024) | **Historical OEE** archive |
| Loss Tree (Nottingham) / Monthly breakdown (Hull) | both | Nottingham: a matrix with rows group / sub group / equipment / stop and columns the 14 periods of the Period table (2025, YTD, Q1 to Q4, Month -3 to -1, MTD, Week -4 to -1), showing `OEE/Loss matrix` and `Count Dynamic`, plus `OEE Period` and `Rate Loss Period`. Hull: a matrix of machine x year x month x week with Good Parts, Capacity, OEE and every sub group loss %. The two pages are different views of the same measures | Ours. The period columns are calculated in Tableau |
| Unplanned Loss Tree (Nottingham) / Unplanned Losses (frequency) (Hull) | both | Nottingham: hours by sub group x stop and by sub group x equipment (unplanned only). Hull: the Unplanned Losses page with stop counts in the monthly trend | Ours |
| Volume Trending | Nottingham | Good Parts by week, month, line, shift and weekday; a gauge against `Volume Target` (a fixed number in the file); the page filter removes the manufacturing machines | Ours. The volume target needs a source (today it is one hard-coded number) |
| OEE/LOSS GRAPH | Hull | Weekly OEE (weighted) against the unplanned Loss % CU, plus the loss cards | Ours |

### 2.2 Filters the pages apply
- Every Nottingham page except the VSU pages filters MachineName not `S14`. The VSU pages show only `S14`.
- Volume Trending also removes 38 manufacturing machines (Fette, Gran, coating, Kilian, Manesty, ...). So even the site dashboard compares volume on packing lines only.
- Machine slicers hide `GT4 - Auto` and `Dettol 1`. The Dept and Product Type slicers hide empty values, so a machine without a Dept in Machine Names cannot be picked. This is one more reason the lookup must be unfiltered.
- Loss visuals filter `OEELossLvl3Group`: unplanned = `Unplanned Loss` + `Not Logged`, planned = `Planned Loss` (a few visuals also include `NPD / CapEX & Trials`).
- Sub group cards list both spellings (for example `Minor Stop` and `Minor Stops`, `Adjustment` and `Adjustments`). Hull keeps the raw names, see 1.2.
- Some visuals still point at tables that no longer exist (`Master Mode Comment`, `_TimeInsights`, `Plan OpT`). These filters have no effect; ignore them.

### 2.3 Columns the pages really use
- **Plan OPT:** Good Parts, Capacity, PartName, Year and the date; the targets through the measures. Not used: `ShiftStartTime`, `Defect Parts`, `Target`, `OEE`.
- **Time Utilisation:** the hour cards and the three running %, all calculated from our three minute totals.
- **Daily losses:** group, sub group, stop (`OEELossLvl3Desc`), `Loss Final Level`, `Equipment`, `Breakdown Types`, `Comment`, `Date`, MachineName, `Product Key`, minutes and hours, `Loss in CUs`; Hull also uses `Lvl 3 Loss Name`. All of these are in `Daily_Losses_EU` or can be calculated from it.
- **Machine Names:** MachineName, Dept, Product Type (Area is not shown).
- **Shift:** Nottingham uses `Shift` (the shift time from Shift Naming). Hull uses both `Shift` and `Shift Colour`.
- **Calendar:** Date, Year, Quarter, MonthShortName, MonthNumber, Week Number, Day (the weekday name, on Volume Trending).
- **Run Rates:** Good Parts, Capacity (through `% Adherence`), PartName. **Volume CoV:** Good Parts Sum, Cap Max (through `Capacity Checker`). **Historical OEE:** day, OEE. **Format List:** all columns.

### 2.4 Summary for step 2
1. 13 of the 17 agreed pages need only what our tables already have, once the EU filters become a column instead of a build rule.
2. Three data needs: **Run Rates** (By Shift, By Format), a **Format List for Nottingham** (By Format) and **Historical OEE** (the Historical OEE page, a static archive).
3. Two small inputs: the **volume target** (Volume Trending) and, for Hull only, Performance Metrics (the Availability and Performance gauges on the Hull Homepage; they are not on the Nottingham Homepage).
4. Built in Tableau: Volume CoV, the 14 periods, all calculated columns, and the S14 / VSU and packing-only page filters.

### 2.5 Files to download (links given to the user in chat, not stored here)
| Priority | Folder | Why |
|---|---|---|
| 1 | Nottingham "Historical OEE" | Confirm the range, grain and size of the archive |
| 1 | Hull "Performance Availability" | The same for Hull |
| 2 | Nottingham "GlidePath Targets", Hull "Targets GlidePath" (site files) | Compare with the regional files we hold; settle the UPDT/PDT /100 difference |
| 3 | Nottingham "Run Rates", Hull "Packing Run Rates": months before Aug 2026 | Only if Run Rates needs history (Aug, Sep and the current month are already local) |
| 4 | Hull "Daily Performance Metrics" | Only if the Hull Availability / Performance gauges are kept |

## Step 3: the site data against the EU model and our tables

### 3.0 Downloaded files (2026-10-23, `downloads/`, git-ignored)
| File | Folder | What it is |
|---|---|---|
| `Notts_HistoricalOEE_1jan22_30nov24.csv` | Nottingham Historical OEE | 42,401 rows, one per machine and day, 2022-01-03 to 2024-11-30 (35 months), 70 machines; OEE, Availability, Performance as text `60.8%`; UTF-16, tab, `Total:` row at the end, no duplicate machine-days |
| `Historical_OLD_OEE.csv` | Hull Performance Availability | 28,944 rows, 2022-01-01 to 2024-10-31 (34 months), 50 machines; same format |
| `Notts GlidePath Targets Add Updates as New Columns.csv` | Nottingham site glidepath | 23 lines x 17 buckets, values for 2026 only (columns up to 2028 are empty); UTF-8, comma |
| `Glide Path Targets V7 Add Updates as New Columns.csv` | Hull site glidepath | 30 lines x 17 buckets, 2025 and 2026 |
| `2025121x-` / `2026102x-daily_performance_availability.csv` (5 files) | Hull Daily Performance Metrics | One file per day with the previous day: 21 machines, Availability and Performance, `Total:` row |

Archive machines not in today's Machine Names: Nottingham `Fette1`, `Fette3`, `Fette15`, `S09`, `ShortBed Printing`, `LongBed Printing`, `Drops Filling` (old machines); Hull `B1 - Auto`, `B4 Auto`, `B5 Auto` and `Bosch Capsulator ` (with a trailing space; Machine Names has it without). In the site dashboards these rows have no Dept either; keep them as they are.

### 3.1 Glidepaths: site files against the regional files we hold
- **Nottingham:** the same lines and buckets. 4,152 of 4,692 cells are equal. The 540 different cells are all `Unplanned Downtime (Total)` and `Planned Downtime (Total)`: the site file keeps them as fractions (`0.147`), the regional file as percent (`14.7`, rounded to one decimal; 39 cells differ by more than rounding). **This explains the /100 question**: Nottingham's `UPDT Target %` and `PDT Target %` do not divide by 100 because its file is in fractions. Hull's file and the regional file are in percent, so Hull divides. Our tables take the regional file: **Tableau divides OEE, PDT and UPDT targets by 100** (the loss target already has `target` = Value / 100).
- **Hull:** the same lines. The bucket names are the raw Hull loss names (`Minor Stop`, `Adjustment`, `Meals & Breaks`...); the regional file uses the common names. That is why the Hull report keeps raw sub group names: they match its own glidepath. 524 cells differ in value (2026 targets of GT4, T1, S1, Fybogel 10s / 30s, Rimini and others). **Open: which Hull file is the master** (the regional one is what the EU report and our build use).
- Decision for us: keep the regional files and the common sub group names. No site glidepath file is needed.

### 3.2 Every site data need, against the EU model and our tables
Class: (a) the same as an EU table, (b) a site query the EU changes, (c) new.

| Need | Class | EU model | Our tables today | Change |
|---|---|---|---|---|
| Plan, time utilisation, losses of the packing lines | (a) | Plan OPT EU, Time Utilisation EU, Daily Losses EU | `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU` | None |
| The same for manufacturing and process machines (incl. `S14` for the VSU pages) | (b) | Removed by the EU queries | Removed by our build (copies the EU rules) | **C1** scope column |
| Dept, Area, Product Type of every machine | (b) | Machine Names filtered to the packing areas / departments | Filled only for EU machines | **C1** (unfiltered lookup) |
| Shift time (`Shift`) | (a) | Shift Naming Provideam | `ShiftName` (plan, losses), `Shift Time` (losses) hold the mapped shift | None |
| Hull shift colour (Hull-only pages) | (a) | Shift Naming Provideam maps every Hull shift name to its colour (`TueDay - Red` to `Red`) | `ShiftName` holds the colour for Hull rows; SIH calendar shifts are the colours too | None (C6 dropped). Only the day / night part of the raw name is lost; no agreed page needs it |
| Loss sub group names | (a) for Nottingham, (b) for Hull | Common names | Common names | None (Tableau cards use the common names) |
| Targets (OEE, PDT, UPDT, loss) | (a) | Regional glidepath | Regional glidepath, in percent | Tableau / 100 (3.1) |
| Run Rates | (a), hidden pages in the EU | Run Rates EU (union of the site queries) | none | **C2** new table |
| Volume CoV | (a), hidden page in the EU | Volume CoV EU (grouped plan rows) | none | **C3** new table |
| Format List | (a), hidden page in the EU | Format List EU (regional "Formats EU" file) | none; Nottingham file missing | **C4** new table + Nottingham file |
| Historical OEE | (c) | none | none | **C5** one-time archive table |
| Volume target | (c) | none | none | **C7** a number (Tableau parameter or Config) |
| Hull Performance Metrics | (c) | none | none | Skip (Hull Homepage only), unless asked |
| Calendar, Period, Last Refresh, Metrics | helper tables | Calendar | none | Tableau |

### 3.3 Proposed build changes
**C1. EU scope as a column, not a filter (plan, time utilisation, losses).**
- The rules stay in the build exactly as now (Nottingham: plan by area and not `S14`, time utilisation by the 23-line list, losses without the 9 names; Hull: the 19 machines; Machine Names: Nottingham areas `SD Packing`, ` Strepsils Packing`, Hull Dept `Dries Pack`, `Liquids Pack`), but they set a new column `In EU Report` (true / false) instead of dropping the row. The EU pages filter `In EU Report = true` and show the same numbers as today; the site pages do not filter.
- The Machine Names lookup is no longer filtered, so Dept, Area and Product Type are filled for every machine in the file.
- Still dropped, as in both reports: Nottingham `N11 Auto` (plan side), `B1 - Auto`, `B4 Auto`, `B5 Auto` (losses); Hull `GT4 - Auto`.
- Size: Nottingham plan rows grow about 2.4 times (Sep 2026: 1,132 to 2,744 rows); losses grow by the stops of the excluded machines (Nottingham excludes only 9 names from losses today). Small either way.
- Rebuild: every month already in the lake (the backfill of step 3 of the report configuration). Proof: the old and the new flow on the same months, rows with `In EU Report = true` equal to today's files.

**C2. `Run_Rates_EU`, new table.**
- Source: the Provideam Run Rates month exports (the same format as Plan OPT: UTF-16, tab, `Total:` row, thousands commas; hourly rows `YYYY-MM-DD HH`, AreaName, MachineName, PartName, ShiftName, Good Parts, Capacity). Nottingham holds 57 machines, all areas. Add `run_rates` to the normalizer and to `eu_report/pbi_report/source/run_rates/site=<Site>/`; Aug, Sep and the current month are local, more only if history is needed.
- Rules from the EU query: rows without a machine out, `Good Parts` = 0 out, shift mapped with the Shift Naming file (`ShiftName` = shift time), `Product Key` = unique machine name + space + PartName, `Unique Machine Name`, `SiteName`; EU-only exclusions (`S14` for Nottingham, `Senokot Press` for Hull) become `In EU Report`.
- Columns: Date (hour), AreaName, MachineName, PartName, ShiftName, Good Parts, Capacity, SiteName, Unique Machine Name, Product Key, Dept, Area, Product Type, Data Source, In EU Report.
- Flow: one more month table in the PBI report build (like time utilisation) and one more type in the listener.

**C3. `Volume_CoV_EU`, new table (from the plan rows already in the month job).**
- Per date x shift x machine: `Good Parts Sum`, `Cap Max` (max Capacity), `Time on Shift` (minutes); only groups with more than 1,000 parts. Plus SiteName, Unique Machine Name, the lookups and `In EU Report`.
- In Tableau: `Capacity Checker` = Good Parts Sum > 0.7 x Cap Max, `AVG Volume`, `CoV Aggregate` = STDEV / AVG of Good Parts Sum. `Is Outlier` is not used on any page: skip.
- Why a table and not a Tableau calculation: the 1,000-part filter and the standard deviation run on grouped rows; in Tableau that needs nested level-of-detail calculations. In the build it is one grouping of rows that are already in memory.

**C4. `Format_List_EU`, new table, plus the Nottingham file.**
- Source: the reference `format_list` files (Hull, Weinheim, Mira local; Nottingham missing). Columns as the EU: Site Name, MachineName, Product Name, Brand, Unit Size, Unit Count/Format, Extra Info, Unique Machine Name, `Product Key` = unique machine name + space + Product Name (the same key as in plan, losses and run rates).
- The listener drops `format_list` today ("no table uses it"); it becomes a reference job that rebuilds this one table.
- Nottingham: a starter list of every MachineName + PartName in the Nottingham Plan OPT and Run Rates files, with empty Brand, Unit Size, Unit Count/Format, Extra Info, for Nottingham to fill.

**C5. `Historical_OEE_EU`, one-time archive table.**
- From the two archive files: Date, MachineName, SiteName, Unique Machine Name, OEE, Availability, Performance (fractions, `60.8%` becomes 0.608), Dept, Area, Product Type (lookup; empty for the old machines), Data Source `Provideam archive`. Drop the `Total:` row. About 71,000 rows, one small parquet file per site.
- The data never changes, so no flow: a one-time conversion script and an upload to `eu_report/report/Historical_OEE_EU/site=<Site>/` (with your approval, as for the other uploads).
- The page shows a simple average of daily OEE (not weighted); copy that in Tableau so the numbers match.
- Archiving later: this is also the pattern for our own old data (one row per machine and day, a few numbers).

**C6. Dropped (2026-10-23).** A raw shift name column was proposed for the Hull shift colour slicer. It is not needed: the regional Shift Naming file maps every Hull shift name to its colour, so `ShiftName` already holds Red, Blue, Gold or Green for Hull rows.

**C7. Volume target.** One number in the Nottingham file, used by one gauge. A Tableau parameter now; a source (per site, per year) from Reckitt later.

### 3.4 What Tableau must rebuild (no data change)
- Calculated columns: minutes and hours from `Duration` and the plan times, `Loss in CUs` = Loss Units x Duration minutes / Time in Mins, the running % and hours of time utilisation (All Time 1440), week, week start, year.
- Measures: the ones in 1.5 used by the agreed pages (2.1). Loss % CU divides a loss sum by the plan capacity, so losses and plan must be related on machine and date (as on the EU pages already built).
- The 14 periods of the Period table (2025, YTD, Q1 to Q4, Month -3 to -1, MTD, Week -4 to -1) and `Count Dynamic`, `OEE Period`, `Rate Loss Period`.
- Page filters: not `S14` (all site pages), only `S14` (VSU pages), packing only (Volume Trending), `In EU Report = true` (EU pages).

### 3.5 Decisions needed
| # | Decision | Recommendation |
|---|---|---|
| D1 | C1: scope column instead of filters | Yes |
| D2 | C2 and C3: two new tables in the PBI report build | Yes; Run Rates history only Aug 2026 onward unless asked |
| D3 | C4: Format List table, and who fills the Nottingham list | Yes; we make the starter list |
| D4 | C5: archive as a one-time upload | Yes |
| D5 | (dropped: the Hull shift colour is already in `ShiftName`) | none |
| D6 | C7: volume target source | Tableau parameter now |
| D7 | Hull glidepath: regional file or the site V7 file (524 cells differ in 2026) | Ask Reckitt; keep the regional file meanwhile |
| D8 | Hull Performance Metrics (Availability / Performance gauges) | Skip; SIH gives Availability and Performance later (step 4) |

### 3.6 Summary for step 3
1. No blocker. Every agreed page can be fed from the Provideam files we hold or have just downloaded.
2. One change to the existing tables (C1, a column instead of a filter) and three new tables (Run Rates, Volume CoV, Format List), plus one static archive (Historical OEE).
3. The /100 question is explained by the file units: our targets are in percent, Tableau divides by 100.

## Step 4: what SIH can give
Basis: the SIH report daily tab (writes the same three tables from the API, [sih-report-daily.md](../docs/sih-report-daily.md)), the shift report tab (`rpt_hour`, `rpt_window`, `rpt_event`, [shift-report-flow.md](../docs/shift-report-flow.md)), the asset list ([assets.md](../docs/assets.md)) and the reference files in the data lake (Glidepaths, Machine Names, Shift Patterns, Equipment Coding; copied by hand from SharePoint).

### 4.1 Which lines SIH covers today
| Site | OEE assets in SIH | Meaning for the site pages |
|---|---|---|
| Hull | B2 Line and its 7 machines (automatic), GT4 (manual) | 2 of about 50 Hull machines. Every other Hull line stays Provideam |
| Nottingham | `N1` only, not configured (HTTP 400, checked 2026-10-02) | All Nottingham pages stay on Provideam data until lines are set up in SIH |

So the agreed pages run on Provideam data for nearly every line. SIH replaces a line only when the line is configured and switched (`reportSource` per line in Config, the existing mechanism). Each table below must therefore exist on both sides with the same columns.

### 4.2 Every data need: Provideam source and SIH source
Status: **have** (SIH writes it today), **fetched** (the API data is already read by a tab, the output is missing), **API** (in the API, not read yet), **file** (reference file in the lake, manual copy), **none** (no SIH source).

| Need | Provideam (today) | SIH | Status | Gap or difference on SIH lines |
|---|---|---|---|---|
| Plan OPT: Good Parts, Capacity, PartName, ShiftName, Date | Plan OPT export | SIH report daily (KPIs per hour, product of each hour) | have | Grain machine x day x shift x product (Provideam: one row per run). Capacity = design speed x minutes: check the design speeds (B2 Line once showed performance above 100 %) |
| Time Utilisation (three minute totals) | Plan OPT export | SIH report daily | have | Minutes cut to whole minutes |
| Daily losses: group, sub group, stop, equipment, final level, breakdown types, minutes, Loss Units, Time in Mins | Line Losses + Volume Loss Correction + Equipment Coding | SIH report daily (`downtimeReasons`, reason tree) | have | Reasons are machine alarm texts; 68 % of stops have no category (`Not Logged`); Equipment = the reason sub group (no Equipment Coding). For SIH rows `Time in Mins` = the stop minutes, so `Loss in CUs` = `Loss Units` |
| Daily losses: `Comment` | Line Losses | none (comment count only) | none | The drill-down tables of Planned, Unplanned, VSU and Daily Report pages show no comment text for SIH lines |
| Loss targets per sub group (`Value`) | Glidepaths by the report sub group name | Glidepaths (file) | file | Filled only where the SIH reason category has a report sub group name (Breakdown, Quality Issues, ...). Needs the reason mapping |
| OEE, PDT, UPDT targets | Glidepaths | Glidepaths (file) | file | None (by Unique Machine Name and month); divide by 100 in Tableau |
| Dept, Area, Product Type | Machine Names | Machine Names (file) | file | None. SIH has its own area (Bottles, Blisters) but no Dept or Product Type |
| Shift (incl. Hull colour) | Shift Naming file | SIH calendar event names (Red, Green, Gold, Blue, ...) | have | Some calendars use names outside the report list (`Yellow`, `Morning Shift`, `Second Shift`); kept as they are and logged. Nottingham shift names ("Tuesday Early Shift") need the Shift Naming map when Nottingham moves |
| `In EU Report` (C1) | the EU rules | the same rules on the Config lines | have (rule only) | The SIH tab takes every Config line; the column follows the same Machine Names rules |
| Run Rates (hour x machine x part: Good Parts, Capacity) | Run Rates export | KPIs per hour are already read by SIH report daily (and by the shift report: `rpt_hour` has asset x hour with shift, product, parts, capacity) | fetched | A fourth output of SIH report daily from the hourly values it already has. No new API call |
| Volume CoV | grouped Plan OPT rows | grouped SIH Plan OPT rows | have (input) | Built the same way from the plan rows (C3) |
| Format List (Brand, Unit Size, Unit Count/Format) | Formats file | none (SIH products have name, code, description, design speed, no brand or pack size) | none / file | The key is machine + product name: for SIH lines the Format List needs the SIH product names (product description), which differ from the Provideam part names. A mapping per line when it switches |
| Historical OEE (2022 to 2024) | archive files | none (before SIH) | none | Static, one-time load (C5) |
| Volume target | hard-coded number | none | none | Reckitt (C7) |
| Hull Availability / Performance (Hull Homepage only) | Daily Performance Metrics files | `evaluateKPIs` availability and performance per asset and day (already in `rpt_window`; the KPI call of SIH report daily has them) | fetched | Only if D8 keeps the gauges |
| Calendar, periods, refresh time | Power BI tables | Tableau | n/a | n/a |

### 4.3 What this means
1. **Every agreed page can run on SIH lines with the tables SIH report daily writes today,** apart from Run Rates (an extra output from data it already reads), the comment text (not available), and the Format List for SIH product names.
2. **Coverage, not columns, is the limit.** Hull has 2 lines in SIH, Nottingham none configured. For the site pages that means Provideam for nearly every line for now. The design must keep both sources in one table per folder (as today), so that a line can switch on its own.
3. **Loss reasons are the weak point for SIH lines.** The loss pages (trees, top losses, maintenance, sub group cards, targets per sub group) all group by sub group and stop. On SIH lines these come from the reason tree and the alarm texts, and 68 % of the stops have no category. The pages will work but show different groupings until the reason tree is mapped to the report sub groups (already open with Reckitt).
4. **The reference files stay the bridge.** Glidepaths, Machine Names, Shift Patterns (and the Format List, once added) are needed for both sources. They are copied by hand today; the listener rebuilds the tables when they change.

## 5. Open decisions (nothing is built yet)
| # | Decision | Who | Recommendation |
|---|---|---|---|
| D1 | EU filters become an `In EU Report` column, and the Machine Names lookup is no longer filtered (C1) | User, Segun | Yes: the EU pages keep their numbers by filtering the column |
| D2 | New tables `Run_Rates_EU` and `Volume_CoV_EU` in the PBI report build (C2, C3) | User, Segun | Yes; Run Rates history from Aug 2026 unless more is asked |
| D3 | New table `Format_List_EU` from the reference Format List files (C4) | User, Segun | Yes |
| D4 | Nottingham Format List: who fills it (we can generate the starter list of machine + part names) | Reckitt (Nottingham) | We make the starter list, Nottingham fills Brand, Unit Size, Unit Count/Format |
| D5 | Historical OEE as a one-time conversion and upload (C5), simple average of daily OEE in Tableau | User, Segun | Yes |
| D6 | Volume target: source and grain (per site, per year?) | Reckitt | Tableau parameter until a source exists |
| D7 | Hull glidepath master: regional file (used now) or the site V7 file (524 cells differ in 2026) | Reckitt (Hull) | Keep the regional file meanwhile |
| D8 | Hull Availability / Performance gauges (Hull Homepage only) | User, Segun, Reckitt | Skip for now (the Nottingham Homepage is the model); SIH has the values if wanted later |
| D9 | Run Rates for SIH lines: a fourth output of SIH report daily from the hourly KPIs it already reads | User | Yes, when D2 is accepted. The Hull SIH report daily tab has 195 of 200 nodes: a new lane does not fit, so a second tab or a split |
| D10 | Comment text for SIH lines (only a count exists): accept empty comments in the drill-downs, or ask Siemens / Reckitt | Reckitt, Siemens | Accept for now, raise with Siemens |
| D11 | Reason mapping: SIH reason tree to report groups and sub groups (affects every loss page and the loss targets on SIH lines) | Reckitt | Needed before a line switches to SIH for the loss pages (already open) |
| D12 | Format List for SIH lines: SIH product names against Provideam part names | Reckitt, user | A mapping per line when it switches |
| D13 | Which page set is the EU view and which the site view in the one workbook, and how the `In EU Report`, `S14` (VSU) and packing-only (Volume Trending) filters are applied | Segun | Page filters in Tableau as listed in 3.4 |
| D14 | Earlier open points that these pages make more visible: SIH shift names outside the report list (`Yellow`, `Morning Shift`, ...), design speeds behind Capacity, the Nottingham downtime targets that differ by more than rounding (39 cells) | Reckitt | Parked until the SIH setup is finished; one register in the diagram (page "Parked: SIH vs Provideam differences") |

Notes of the user (2026-10-23):
- Coverage: understood; the plan to switch lines exists.
- Run Rates: a new lane in the PBI report build tab (164 of 200 nodes, room enough).
- Comment text (D10): look deeper in a separate session.
- Differences SIH / Provideam: known and parked on purpose until the setup is finished; escalate to Reckitt when the time is right. They are collected on one diagram page.
- SIH has a loss tree; why the stops do not map to it is still open (D11).
- Glidepaths are updated during the year (someone from Nottingham mentioned it): the reference copy to the lake needs an owner and a routine (D7).
4. Open with Reckitt: the Nottingham Format List, the Hull glidepath master, the volume target.
