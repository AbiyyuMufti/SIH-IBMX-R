# Power BI source files (Hull Plan OPT) and comparison with our data

| At a glance | |
|---|---|
| **What** | Where the Power BI local copy gets its data (SharePoint folders, from the lineage document and the model queries) and what the real Hull Plan OPT files look like, checked against our `pbi_plan_opt` |
| **Sources read** | The data lineage document, the Power BI template (load queries), 4 Hull Plan OPT files downloaded on 2026-10-13 (`downloads/`, git-ignored): current month (to 13 Oct) and Jul, Aug, Sep 2026 |
| **Status** | Explored 2026-10-13. Numbers below are for 2 machines (B2 Auto = our B2 Line, GT4) and the overlap days only |

## Where the data comes from
- Every regional table is a SharePoint folder read by Power Query (`SharePoint.Contents`, then folder names). Hull: site `X-seedHull`, `Shared Documents / General / Power BI / OEE Board A Sz /` with sub folders `Plan OPT`, `Line Losses`, `Machine Names`, `Equipment Coding`, `Volume Loss Correction`. The same query of the model gives these paths, so the lineage document and the model agree.
- Nottingham and Weinheim share one site (`NottinghamCI`), Mira is on a third site. Targets (Glidepaths) and shift coding are in Nottingham folders ("EU OEE Regional ASZ").
- The files are exports of Provideam reports (see [provideam-source.md](provideam-source.md)): one per month (`<Mon><Year>-monthly_opt_volume.csv`) plus `Current_Month_OPT.csv`, which changed 28 minutes before it was downloaded. The guide describes daily files; the monthly files are not explained yet.

## File format (Plan OPT)
- UTF-16 with byte order mark, tab separated, lines end with a bare carriage return, a trailing empty column, and a `Total:` row at the end of the file. Importers must handle all four.
- 15 columns: date, AreaName, MachineName, ShiftName, ShiftStartTime, PartName, Good Parts, Defect Parts, Target, Capacity, OEE, Total Time, Planned OpT, OEE Time, Downtime Units.
- Numbers use thousands commas (`74,740`); the three time columns are `HH:MM:SS` (hours can pass 24 in totals); OEE is text `75.9%`.
- Hull has 34 machines in these files; the report query then drops 10 of them (a hard-coded exclusion list in the query), leaving 24. AreaName is site plus area (`Hull Dries`, `Hull Liquids`, `Hull BUP`), unlike the Insights Hub area (Bottles, Blisters).
- A row is a segment of a shift with one product: `ShiftStartTime` is the real start of the segment (a 12 h shift split by a product change gives two rows, 9 h 05 and 2 h 55).
- Shift names are not colours only: 105 distinct raw values such as `FriDay - Blue`, `SatNight - Green`, `Friday Early Shift`. The model maps them to a shift label through a "Shift Naming" file.
- Keys are built in the query: Unique Machine Name = machine name + `-Hull`; Product Key = Unique Machine Name + space + part name; Targets Key = Unique Machine Name + month start. Part name is sometimes a numeric code (251 of 3,369 rows).

## Our pbi_plan_opt against the real files (overlap days)
| Check | B2 Auto / B2 Line | GT4 |
|---|---|---|
| Overlap days | 38 | 24 |
| Good parts, ours / real | 0.966 (4.09 M / 4.24 M) | 0.436 (0.86 M / 1.96 M) |
| Day correlation (same day) | 0.86 (best at lag 0) | 0.62 |
| Total time | equal (1,440 per day) | differs: real days are often 630 to 720 min, ours 1,440 |
| Planned OpT | ours mostly 1,440; real 1,000 to 1,440 | differs |
| Capacity | ours = design speed x our planned time, so it is higher where real planned time is lower | differs |
| OEE time | close (for example 673 / 682 min) | far lower in ours |
| Products | matched names | different on some days (for example 12 Sep) |

What this means (to confirm with the owner of the files):
1. B2 is close. The gap is mostly planned stops: the real Planned OpT is below the day length on some days, ours is not, so capacity differs for the same reason.
2. GT4 is production entered by hand in Insights Hub. Ours holds less than half of the real good parts and the days do not line up well. Not explained yet: manual entries missing or placed on other hours, product assignment, or the real file being edited by hand.
3. The grain of the real file (shift segment by product, real start time) is finer than ours (shift by product).
