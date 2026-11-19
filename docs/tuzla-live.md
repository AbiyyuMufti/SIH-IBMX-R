# Tuzla to EU_OEE_Fact: history load, file watch, daily update

| At a glance | |
|---|---|
| **What** | Bring the Tuzla OEE workbook `2026_OEE_KPI.xlsx` (table `表12_4` on sheet `Template`, profile: [tuzla-source-files.md](tuzla-source-files.md)) into `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU` and `EU_OEE_Fact`: (1) a one-time history load, (2) a Power Automate watch to prove the file is updated every day, (3) a daily update like Chartres live |
| **One rule set** | The history script runs the SAME function nodes the live tab will run: [t1-read-rows.js](../scripts/vfc/t1-read-rows.js), [t2-plan-time.js](../scripts/vfc/t2-plan-time.js), [t3-loss-rows.js](../scripts/vfc/t3-loss-rows.js), then [e2-fact-rows.js](../scripts/vfc/e2-fact-rows.js) of the fact tab. Lookups through `b5-machine-lookup.js`, `b5-target-lookup.js`, `b5-scope-lookup.js` |
| **Status (2026-11-19)** | (1) built and run locally: [downloads/tuzla-convert/run3](../downloads/tuzla-convert/run3), checked against the dashboards `Günlük` and `Aylık`, **not uploaded**. (2) guide below, the user builds it. (3) design proposed, **the VFC tab is not built yet** (waits for approval) |
| **Open with the site** | the loss mapping (section 4), Dept / Area / Product Type of the 6 lines, `In EU Report` for Tuzla, the file location and the 2027 file |

## 1. History load (built)
```
node scripts/tuzla-convert.js out=downloads/tuzla-convert/<new folder> [before=YYYY-MM-DD]
python -I scripts/helper-chartres-write-parquet.py downloads/tuzla-convert/<same folder>
```
`before=` leaves out that day and later (the live tab's first day, see 3.4). Defaults: workbook `downloads/05 SITE Tuzla/2026_OEE_KPI.xlsx`, line list `parquet/daily_refresh/lake/eu_report/report/Dim/Machine_Names_EU.csv` (`lines=`).

| Output in the run folder | Content |
|---|---|
| `report/<table>/site=Tuzla/<table>_<YYYY-MM>_excel.parquet` | Plan_OPT_EU, Time_Utilisation_EU, Daily_Losses_EU, 11 months each (Jan to Nov 2026) |
| `report/EU_OEE_Fact/site=Tuzla/EU_OEE_Fact_<YYYY-MM>.parquet` | the fact month files (Plan + Time Utilisation + Loss rows), the 65 columns of `euOeeFactSchema` |
| `reference/machine_names/site=Tuzla/Tuzla_MachineNames.csv` | Dept, Area, Product Type per line (proposal) |
| `reference/glidepaths/site=Tuzla/Glidepath Tuzla V1 20261119.csv` | OEE target per line and month from sheet `2026 Target` (percent) |
| `reference/Dim/Machine_Names_EU_add_Tuzla.csv` | the 6 rows to add to `report/Dim/Machine_Names_EU.csv` (else the fact marks Tuzla `In EU Report` false) |
| `checks.csv` | notes per line and day (below) |

### Rows and rules
| Table | One row per | Rule |
|---|---|---|
| Plan_OPT_EU | Template row (line, day, shift, order) | `Good Parts` = Üretilen Miktar (adet); `Capacity` = theoretical speed x net operation time / 60 (= column U); `Total Time` = `Planned OpT` = net operation time; `OEE Time` = good / speed x 60; `Defect Parts` = Fire (dk) x speed / 60; `PartName` = Ürün Adı; `ShiftName` Gündüz = `Day`, Gece = `Night`; `ShiftStartTime` = Başlangıç Saati; `OEE Target` from the glidepath; `Batch ID` (losses) = order number |
| Time_Utilisation_EU | line and day | `OEE Time Total` = sum of run time, `Total Time Total` = `Planned OPT Total` = sum of net operation time, `All Time` 1440 |
| Daily_Losses_EU | Template row and loss column with minutes above 0 | group / subgroup / name from the map in section 4; `Loss Units` = minutes x speed / 60; real shift, start time and product of the row (better than Chartres, whose losses are per day) |
| EU_OEE_Fact | the three tables stacked | `e2-fact-rows.js`; `In EU Report` = line in `Machine_Names_EU.csv` |

Not loaded: Üretim Planı Yok, Eğitim & Toplantı, Deneme (outside the net operation time, as the not-counted time of Chartres). No `Run_Rates_EU` (no hourly data), no `Volume_CoV_EU` and `Format_List_EU` yet (not needed for the fact).

**Remainder and speed loss:** the workbook's `Diğer` = net time - run time - all typed stops - Fire, and it CONTAINS `Düşük Hızda Çalışma` (speed loss). Loaded as `Reduced Speed` = speed loss (at most the remainder) and `Not Logged` = the rest, so run time + losses = net operation time on every row. (The site dashboard adds both bars, so its bars pass 100 % when a speed loss is typed.)

### Proof (run3, 2026-11-19)
Site values are not written here (public repo): the script prints them, the run folder holds them.

| Check | Workbook | Result |
|---|---|---|
| `Günlük` 2026-11-17, factory | good units, theoretical units, OEE % | equal |
| same day per line | OEE % of the 4 lines that ran | equal |
| same day, loss bars (units) | Hat Dönüşümü, Mola, Analiz, Genel Temizlik, Materyal Besleme, Arıza, Diğer and their total | equal as Product Changeover, Breaks / Meals, In Process Quality, Operator Asset Care, Refilling Materials, Breakdown, Not Logged; good + losses = theoretical units |
| `Aylık` November, factory and per line | good units, theoretical units, OEE % | equal |
| OEE targets | `2026 Target` and `Günlük` Hedef OEE % | equal |
| Fact schema | a Chartres fact month file | same 65 names, order and types (pyarrow `string` vs `large_string` only, as the Chartres day files) |

Counts: 1,572 Template rows, 1,092 line-days, 1,570 plan rows (2 rows without time or output left out), 1,090 time rows, 6,555 loss rows, 9,215 fact rows. Notes in `checks.csv`: 120 rows where the typed stops plus the run time exceed the net time by 1 to 101 minutes (median 11; the remainder is negative, so no `Not Logged` row, the typed stops are kept), and 2 shift-orders entered twice (both kept).

### Upload (the user's decision, not done)
When approved, like Chartres: back up nothing (Tuzla is new in the lake), then
1. `node scripts/datalake-upload-tree.js downloads/tuzla-convert/<run>/report eu_report/report` (new folders `site=Tuzla`).
2. The three reference CSVs to `<root>/reference/...` (same paths as in the run folder).
3. The 6 rows of `Machine_Names_EU_add_Tuzla.csv` appended to `report/Dim/Machine_Names_EU.csv` (download, append, upload: the file is shared by every site).
4. Check that the Tableau data source picks up `site=Tuzla` and that the site filter shows it.

## 2. Is the file live? Power Automate watch
Two ways, use both:

**Now, by hand (2 minutes):** in Excel for the web, File > Info > Version history. A live file has saves on every working day, mostly in the morning (the supervisors type the day after). The copy we have ends on 2026-11-17 and `Günlük` already shows 18.11 in its header, which looks live. Also copy the path (File > Info > Copy path): it tells whether the file sits in SharePoint (a site library) or in someone's OneDrive. Power Automate can read both, but a personal OneDrive breaks when that person leaves: ask for a site library.

**Flow `Tuzla file watch`** (Power Automate, standard connectors only):
| # | Step | Setting |
|---|---|---|
| 1 | Trigger: SharePoint `When a file is created or modified (properties only)` (OneDrive for Business: `When a file is modified`) | Site address and library of the file; `Limit Columns by View` none. Settings > Trigger conditions: `@equals(triggerOutputs()?['body/{FilenameWithExtension}'], '2026_OEE_KPI.xlsx')` (else it fires for every file of the library). Concurrency 1 |
| 2 | Excel Online (Business) `List rows present in a table` | Location, library, file `2026_OEE_KPI.xlsx`, table `表12_4`. Advanced: DateTime Format `ISO 8601`. Settings: Pagination on, threshold 5000 |
| 3 | `Filter array` | From `body('List_rows_present_in_a_table')?['value']`, condition `item()?['Üretim Hattı']` is not equal to an empty text (drops the empty rows of the table) |
| 4 | `Compose` (name `Last row`) | `last(body('Filter_array'))` (the last typed row: its `Tarih`, `Üretim Hattı`, `Vardiya`) |
| 5 | Excel Online `Add a row into a table` in a log workbook in your OneDrive (`Tuzla file watch.xlsx`, table `log` with columns Checked, Modified, Rows, LastDate, LastLine) | Checked `utcNow()`, Modified `triggerOutputs()?['body/Modified']`, Rows `length(body('Filter_array'))`, LastDate `outputs('Last_row')?['Tarih']`, LastLine `outputs('Last_row')?['Üretim Hattı']` |

Keep it on for a week. The file is live when: a log line comes on every working day, `LastDate` moves to the previous day each morning, and `Rows` grows. Autosave can fire the trigger several times while someone types: that is fine, the log just gets more lines. Do not log the editor name (personal data). The log workbook stays in the tenant, never in the repo.

Signs that it is NOT the live file: no saves for days while the site produces, `LastDate` stays still, or the site says they type into another copy (ask: "is this the file the supervisors type into every day, and where does it live?").

## 3. Daily update (design, waiting for approval)
Same shape as Chartres live ([chartres-live.md](chartres-live.md)): Power Automate reads the table and POSTs rows, a VFC tab `Tuzla live` builds the tables with t1 to t3 and writes day files, and sends the rows to the tab `EU OEE Fact write`.

### 3.1 Power Automate flow `Tuzla OEE daily to VFC`
| # | Step | Setting |
|---|---|---|
| 1 | Trigger `Recurrence` | every 1 hour (as Chartres; the supervisors type through the morning), time zone (UTC+03:00) Istanbul |
| 2 | `List rows present in a table` | as step 2 of the watch (file, table `表12_4`, ISO 8601, pagination 5000) |
| 3 | `Filter array` | advanced mode: `@and(not(empty(item()?['Üretim Hattı'])), greaterOrEquals(item()?['Tarih'], formatDateTime(addDays(utcNow(), -7), 'yyyy-MM-dd')))` = the rows of the last 7 days |
| 4 | `HTTP` (premium, available since 2026-11-06) | POST `https://<tenant VFC host>/tuzla-live`, header with the access key of the `http in` node (as for Chartres; never written down), header `Content-Type: application/json`, body `body('Filter_array')` |

Sending the whole last 7 days every hour makes the load safe: a day that is corrected later is rebuilt, a missed run is caught by the next one. About 60 rows of 63 columns per call.

### 3.2 VFC tab `Tuzla live` (to build after approval, about 60 nodes)
| Lane | Nodes | From Chartres live |
|---|---|---|
| Reference | inject at deploy and hourly at minute 7, list and read `machine_names/site=Tuzla`, `glidepaths/site=Tuzla`, `report_scope`; `b5-machine-lookup`, `b5-target-lookup`, `b5-scope-lookup` | same nodes, site `Tuzla`; no format list, no localisation file (the loss map is in t3) |
| Request | `http in` POST `/tuzla-live` -> check ready (503 while the reference loads) -> `t1 Read rows` (out 1: one message per line and day; out 2: answer 200 or 400) -> `http response` | `y0-check-ready`, `y6-answer` |
| Build | `t2 Build plan and time` (out 2: line not in Machine Names = log) -> `t3 Build losses` | new nodes (this change) |
| Write | route the 3 tables -> parquet -> path `<root>/report/<table>/site=Tuzla/<table>_<YYYY-MM-DD>_<line>_excel.parquet` -> write object; 4th output `to eu-oee-fact WRITE` (fact day files `EU_OEE_Fact_<YYYY-MM-DD>_<LINE>_<plan\|tu\|loss>_excel.parquet`) | `y5-route-tables`, `y5-set-path`, the fact link with its fixed id |
| Log | link outs `to LOG` -> log node -> debug | the shared log lanes, `logs/tuzla-live/log_YYYY-MM.csv` |

Settings node: `DRY_RUN` `true` by default (the user switches it), `FIRST_DAY` in t1. One day file per line and day: a resend replaces it, two lines never overwrite each other. Proof as Chartres: a test script runs the tab's nodes on the workbook rows and compares with the history run (`node scripts/test-tuzla-live.js`, to write with the tab).

### 3.3 Known limits of the design
- A line-day that the supervisor deletes later keeps its old day file (no delete in the flow). Rare; fix by hand.
- One file per year: `2027_OEE_KPI.xlsx` needs both Power Automate flows pointed to the new file in January (ask the site how the new year starts).
- The Excel connector reads the saved file; rows typed but not yet saved come with the next run.

### 3.4 Cutover (history to live)
1. Pick `FIRST_DAY` (for example the day after the upload). Set it in `t1-read-rows.js` before the build of the tab.
2. History up to the day before: `node scripts/tuzla-convert.js out=<new> before=<FIRST_DAY>` + parquet writer, upload (section 1). The month file of that month then ends before `FIRST_DAY`, the live day files start on it: no day is counted twice.
3. Import the tab with `DRY_RUN` true, turn on the Power Automate flow, read the log lines, then `DRY_RUN` false.

## 4. Loss map (proposal, to confirm with the site)
Planned stops (Planlı Duruşlar) are `Planned Loss`, unplanned (Plansız Duruşlar) `Unplanned Loss`. The constant is `LOSSES` in [t3-loss-rows.js](../scripts/vfc/t3-loss-rows.js). Breakdown rows carry the machine in `Equipment`, all others `Unclassed`.

| Column (Turkish) | English name | EU subgroup |
|---|---|---|
| Formül Değişikliği / Ebat Değişikliği | Formula Change / Size Change | Product Changeover |
| Yemek / Çay | Meal / Tea Break | Breaks / Meals |
| Analiz ve Kontroller | Analysis and Checks | In Process Quality |
| Planlı Bakım | Planned Maintenance | Planned Maintenance |
| Genel Temizlik & Hat Kontrol | General Cleaning and Line Check | Operator Asset Care |
| Temizlik & Sanitasyon | Cleaning and Sanitisation | Start up and Sanitisation |
| Ambalaj, Etiket vs. Besleme / Yarı Mamül Besleme | Packaging Feeding / Bulk Feeding | Refilling Materials |
| Elektrik/Hava Kesintisi, Personel / Üretim Planı / Yarı Mamül / Ambalaj Bekleme | Power / Air Cut, Waiting for Staff / Plan / Bulk / Packaging | Lack Of Resources |
| Acil Durum Tahliye, Diğer Duruşlar | Emergency Evacuation, Other Stops | Others |
| 3 x Kalite Problemi, Fire (dk) | Finished Product / Bulk / Packaging Quality, Rejects | Quality Issues |
| Makine Ayarı | Machine Set-up | Adjustments |
| 6 x Makine Arızası, Diğer Arızalar | Bottle Unscrambler, Filler, Date Coder, Labeller, Case Packer, Case Barcode Printer, Other Breakdown | Breakdown |
| Kısa Duruşlar | Short Stops | Minor Stops |
| Hat Hızı Düşürme/Eksik Personel, Düşük Hızda Çalışma | Line Slowed / Short Staff, Low Speed Running | Reduced Speed |
| Diğer (remainder) | Not Logged | Not Logged |

Questions for the site: is general cleaning and line check operator asset care or cleaning; is Fire a quality loss for you; should the 120 rows with more stops than time be corrected; Dept / Area / Product Type of the 6 lines; is Tuzla in the EU report.
