# Data blending gap: measured (S3)

| At a glance | |
|---|---|
| **Question** | In the Tableau site dashboard (data blending), does a line-day that is in one report table and missing in another drop out, and does that explain Charles's EU vs site differences? |
| **Data** | Lake download 2026-11-06 of `eu_report/report/{Plan_OPT_EU,Time_Utilisation_EU,Daily_Losses_EU}/`, all four sites (2024-12-01 to 2026-11-05). Workbook `downloads/Site OEE Report - Draft_Live V0.1.twbx` (XML only) |
| **Blend key** | Most sheets: **SiteName + MachineName + ShiftName**, no date. The custom relationship Plan to Losses also has Month (`DATETRUNC(month)` of `Date` / `ShiftStartDate`). Two sheets link on `Date`. The date range is a filter on each source, not a link. A null `ShiftName` never links |
| **Main result** | For a month (Charles's test, Oct 2026) the blend drops **no** Hull or Nottingham loss rows and no measurable plan rows. The gap does **not** explain Charles's numbers. What does: Tableau has no `In EU Report` filter. With that filter our tables give the Power BI EU volume exactly (Hull + Nottingham 59.67 M) |
| **Where the gap is real** | 1. Short date ranges (one day, one week): Hull 8 % of capacity sits on shift-days with no loss row. 2. **Chartres: every loss row has `ShiftName` null**, so Chartres losses and plan never link (a data fix, not a filler) |
| **D1** | Hull line D1 has no day with losses and no plan. It has 7 shift-days with plan and no losses (dates below). The 66 sheets with Losses as primary drop those plan rows |
| **Filler** | Worth building for plan to losses (zero loss rows on plan shift-days without losses). Rule below. The other direction is small. Time Utilisation needs no filler |
| **Scripts** | `scripts/helper-twb-blend-links.py` (blend per sheet), `scripts/helper-blend-gap.py` (gaps, 6 directions), `scripts/helper-blend-trace.py` (one site and month, filter by filter). All run with `python -I`, read only |

## 1. How the workbook blends (from the .twb XML)
`scripts/helper-twb-blend-links.py` lists every sheet with its primary source (the first one in the sheet's data source list) and the fields that link each secondary source. 97 blends in total:

| Primary to secondary | Sheets | Link fields |
|---|---|---|
| Daily_Losses_EU to Plan_OPT_EU | 66 | SiteName + MachineName + ShiftName |
| Daily_Losses_EU to Plan_OPT_EU | 9 | the same plus one of: Date (1), Month (1), Week Number (1), Week Number + Date (1), MonthNumber (1), Product Type (1), Brand (+ Unit Size, + Extra Info + Unit Count/Format) (3) |
| Plan_OPT_EU to Daily_Losses_EU | 9 | MachineName + ShiftName: the dials OEE % (Europe), OEE % by Site, OEE (%) In Selected Period, Planned / Unplanned Loss % (and "- 2"), Site Hours Summary, Volume by Site |
| Time_Utilisation_EU to Plan_OPT_EU / Daily_Losses_EU | 2 + 2 | Dept + MachineName + Product Type (+ SiteName) |
| Historical_OEE_EU, Run_Rates_EU, Volume_CoV_EU, Plan to Time Util | 9 | Date, Dept, MachineName, or none |

How it works: Tableau sums the secondary source per link value (for example per machine and shift over the selected dates) and keeps only the link values that the primary source has after its filters. So:
- **Losses primary (most sheets):** the plan rows (Capacity, Good Parts, OEE) of a machine + shift with **no loss row** in the selected period drop out.
- **Plan primary (the 9 dials):** the loss rows of a machine + shift with **no plan row** in the period drop out. This is the case described in the job (losses missing from the loss sum).
- The period is the user's date range. The date is not a link field, so a gap counts only when the machine + shift has nothing in the **whole** range. A month is safe; one day or one week is not.
- `In EU Report` is not used anywhere in the workbook (no data source filter, not in `Record Selection` / `OEE Date Selection`).

## 2. Gaps per table (line-day = site + machine + day)
Loss rows are dated by `ShiftStartDate` (the date the Tableau filter uses), plan and time rows by `Date`. All 6 directions, whole history:

| In, not in | Chartres | Hull | Nottingham | Weinheim |
|---|---|---|---|---|
| losses, not plan | 15 line-days, 11,819 min | 38, 19,193 min, 1.74 M loss units | 43, 18,511 min, 0.94 M | 6, 1,028 min |
| losses, not time util | 0 | 38 (the same days) | 43 | 6 |
| plan, not losses | 21, 4,800 good parts | 1,581, 29.0 M good parts | 2,214, 8.1 M | 0 |
| time util, not losses | 120 | 1,581 | 2,214 | 0 |
| time util, not plan | 114 | 0 | 0 | 0 |
| plan, not time util | 0 | 0 | 0 | 0 |

Per site, month and line, with the dates: `downloads/blend-gap-20261106-out/gaps_line_day.csv` (local, not committed).

On the blend key (site + machine + **shift** + day), plan vs losses:

| Site | Shift-days in both | Plan only | Losses only | Losses only: share of loss units | Plan only: share of capacity |
|---|---|---|---|---|---|
| Hull | 20,500 | 2,433 | 60 | 0.24 % | 8.1 % |
| Nottingham | 43,026 | 5,464 | 102 | 0.18 % | 1.5 % |
| Weinheim | 2,666 | 2 | 8 | 0.15 % | 0.1 % |
| Chartres | **0** | 14,282 | 7,038 | 100 % | 100 % |

Over a whole month the drop is much smaller. Plan machine + shift with no loss row in the month: Hull 167 cases, 0.49 % of capacity; Nottingham 129, 0.06 %. Loss machine + shift with no plan in the month: only 6 cases, all in 2026-11. The losses already hold 5 Nov, the plan stops at 4 Nov: the last day of the losses arrives one day before its plan. Over a year: Hull 0.15 to 0.2 % of capacity (2024: 1.7 %), Nottingham under 0.03 %.

### Chartres
Chartres `Daily_Losses_EU` has `ShiftName` empty (null) on every row: the source (sheet `Base`) has one row per day and line. The plan has Day, Afternoon and Night. A null never links, so in every sheet with a ShiftName link the Chartres losses (Plan primary) or the Chartres plan (Losses primary) drop out completely. Filler rows cannot fix this. It needs a converter decision (see Questions).

## 3. Line D1 (Hull)
D1 is in all three tables (plan and time util 558 days, losses 553 days, 2024-12-01 to 2026-11-04). **No D1 day has losses without plan.** On the blend key, D1 has 7 shift-days with plan and no loss row:

| Date | Shift | Good Parts | Capacity |
|---|---|---|---|
| 2024-12-01 | Blue | 39,000 | 77,760 |
| 2025-04-08 | Red | 6,480 | 14,400 |
| 2025-06-01 | Blue | 4,944 | 7,200 |
| 2026-01-20 | Blue | 0 | 57,600 |
| 2026-06-08 | Gold | 0 | 0 |
| 2026-07-07 | Blue | 0 | 0 |
| 2026-07-08 | Red | 13,284 | 21,600 |

On a day view of D1 (Losses primary) these days show no OEE or volume. That matches "D1 drops for some dates", but in the plan direction. If Segun saw lost **losses** on D1, that was in an older extract or another sheet. We cannot rebuild his dates from today's data.

## 4. Charles's differences (Hull test, 1 to 31 Oct 2026)
Traced filter by filter with `python -I scripts/helper-blend-trace.py downloads/blend-gap-20261106 <site> 2026-10`:

| Hull, Oct 2026 | Rows | Sum |
|---|---|---|
| Plan, all files of the site | 25,265 | Capacity 1,440.8 M |
| Plan, date in October | 1,108 | Capacity 51.59 M, Good Parts 25.08 M |
| Plan, `In EU Report` true | 914 | Capacity 49.30 M, Good Parts 23.93 M |
| Losses, all files of the site | 255,940 | Loss Units 731.9 M |
| Losses, `ShiftStartDate` in October | 11,487 | Loss Units 25.12 M, Duration 287,612 |
| Losses whose machine + shift is in the October plan (blend) | 11,487 | unchanged: **0 rows dropped** |
| Losses, `In EU Report` true | 10,988 | Loss Units 23.92 M |

Nottingham the same: 19,306 loss rows, 0 dropped by the blend.

Loss % = loss units / capacity, Oct 2026:

| | Hull unplanned / planned | Nottingham unplanned / planned | Hull + Nottingham unplanned / planned / volume |
|---|---|---|---|
| Our tables, all rows (Tableau logic, with or without the blend) | 22.90 / 25.78 | 23.06 / 18.04 | 22.99 / 21.48 / 62.28 M |
| Our tables, `In EU Report` only | 22.60 / **25.91** | 23.77 / 18.45 | **23.25** / 21.76 / **59.67 M** |
| Power BI EU (Charles) | 23.04 / **25.91** | 23.47 / 17.88 | **23.28** / 21.44 / **59.67 M** |
| Tableau (Charles) | 21.6 / 24.76 | 22.85 / 17.71 | 22.29 / 20.84 / 60.5 M |

Conclusions:
- **The blending gap does not cause these differences.** Over a month nothing drops for Hull and Nottingham.
- **Missing `In EU Report` filter in Tableau (proven):** with the filter, our tables give the Power BI EU volume exactly (59.67 M), the Hull planned loss exactly (25.91 %) and the combined unplanned loss within 0.03 points. Without it, Tableau counts the process machines too: Hull capacity +4.4 %, Nottingham +3.8 %. That is also Charles's item 8 (machines that should be filtered out appear) and the known volume difference of 4 to 5 %.
- **Tableau's own numbers cannot be rebuilt from today's lake:** none of our variants gives 21.6 / 24.76. Likely causes, not proven: the extract was taken before later corrections of the last days of October; Weinheim (history uploaded 2026-11-04) and Chartres are in the folder now and maybe not then; Chartres capacity counts while its losses never link. To close this, the same Tableau dials need a screenshot with the extract date, for Hull only and for a closed month.
- Other differences in Charles's sheet that are not about blending: Nottingham planned loss 18.45 % (our tables, EU only) against 17.88 % (Power BI EU), so the source data differs there; item 11 (loss minutes 2x, loss % 10x for one machine) points at the sheet formula (`Capacity - Ignore Line` is a `FIXED :` sum over every line), not at the data; item 17 (OEE by year 5 % / 2 % off): the year-level blend drop is at most 0.2 %, so it comes from something else (machines, the year 2025 history).

## 5. Filler rule for S4
Key: **SiteName + MachineName + ShiftName + day** (Plan `Date`, Losses `ShiftStartDate`). That is the finest link Tableau uses: one filler on the day level covers the sheets that link per machine and shift, per month, week or date. Time Utilisation links on Dept + MachineName + Product Type without a date and has no `ShiftName`, so it needs no filler.

Rule (per site and month, rebuilt with the month):
1. Take the shift-day keys of Plan_OPT_EU and of Daily_Losses_EU. The union is the target.
2. **Losses filler (the one that matters):** for every plan key with no loss row, one Daily_Losses_EU row. Hull 2,433 rows and Nottingham 5,464 over the whole history (about 1 % of the loss rows).
3. **Plan filler (small):** for every loss key with no plan row, one Plan_OPT_EU row. Hull 60, Nottingham 102, Weinheim 8.
4. Values: additive measures 0 (`Duration`, `Loss Units`, `Good Parts`, `Capacity`, `Total Time`, `Defect Parts`). Ratio columns **null**, not 0 (`OEE`, `Target`, `Value`, the PDT / UPDT targets), so averages ignore them.
5. Dimensions copied from the line's own rows of the month: `SiteName`, `MachineName`, `Unique Machine Name`, `Dept`, `Area`, `Product Type`, `In EU Report`, `ShiftName`, `Shift Colour`. Otherwise the Time Utilisation sheets (link on Dept + Product Type) and the dashboard filters treat the filler as another machine. Product columns (`PartName`, `Brand`, `Unit Size`, `Extra Info`, `Unit Count/Format`) empty: the 3 format sheets that link on Brand do not match the filler. Accepted.
6. `OEELossLvl3Group` and its sub-columns empty, so every loss-group filter (Planned, Unplanned, Not Logged) skips the filler.
7. `Data Source` = a marker you choose (proposal `Filler`). Same columns, order and types as the folder (`pbiPlanSchema`, `pbiLossSchema` in `scripts/lib-pbi-report-schemas.js`), so the Tableau extract still reads one schema per folder.

What filler rows change:
- **Row counts:** sheets that count loss rows go up unless they skip the filler: PL Card Total Event Count, PL Card Unique Event Count, the event counts behind Average Loss (Mins), and repair time / time between failures. Point 6 covers the ones that filter on a loss group. Any count without a group filter needs `Data Source <> "Filler"` in the workbook (your change) or must be accepted.
- **Averages:** a plain AVG over a measure column falls (more rows of 0). Weighted measures (sum / sum, such as OEE weighted, loss % = units / capacity) do not change. Null ratio columns keep AVG(OEE) and AVG(Target) as they are.
- **Day counts** (COUNTD of dates, for example "Daily plan average"): the plan filler adds days only where losses exist without a plan, which is 170 shift-days in the whole history.
- **Totals:** nothing changes, every measure is 0.

Not fixed by the filler: the Chartres null `ShiftName`, the missing `In EU Report` filter, and the last day where losses arrive one day before the plan (the filler of that month fills it until the plan arrives, if the month is rebuilt after the plan).

## Questions for you
1. `Data Source` marker for the filler: `Filler`, `No production`, or something else?
2. Chartres losses have no shift. Options: (a) the converter writes the losses on one shift (for example the first plan shift of the day), (b) Chartres sheets link without ShiftName (a workbook change), (c) leave it as it is. Your choice.
3. Should the dashboard filter on `In EU Report` (a data source filter in Tableau, your change), or should the table hold only EU rows? It explains most of what Charles reported.
4. For the Tableau-side numbers: a screenshot of the Hull dials for a closed month, with the extract date, would let us close the rest of the trace.
