# Questions for Reckitt: files that fill the gaps in the Insights Hub tables

Status: draft, 2026-10-13. For the user to check before it goes to Reckitt.

## Why we ask
The Power BI report reads several files from SharePoint folders. Insights Hub has no data for these items. We need the files to fill the gaps. For now the user can copy Hull and Nottingham files by hand to the data lake. We want an automatic way later.

## Files we need
| File (SharePoint folder name) | What it fills in our tables | Sites with access now |
|---|---|---|
| Glidepaths (regional folder) | OEE, PDT, UPDT targets in Plan OPT. Loss targets in Daily Losses | Nottingham folder |
| Machine Names | Department, Area, Product Type | Hull, Nottingham |
| Shift Naming (shift coding) | Shift name mapping | Nottingham folder |
| Equipment Coding | Equipment name of a stop | Hull, Nottingham |
| Volume Loss Correction | Correction of loss units | Hull, Nottingham |
| Targets Volume | Volume Total (weight for targets) | Hull, Nottingham |
| Plan OPT (monthly files) | Not a gap. We use it to check our numbers | Hull, Nottingham |
| Format List (product master) | Brand, unit size, unit count. Source not checked | Not known |

## Questions for each file
1. Who owns the file? Who changes it? How often (monthly file and current-month file)?
2. Is this file the official source for the report? Is it changed by hand?
3. Can we read it automatically? Which method do you prefer: a SharePoint connector, a Power Automate copy to storage, or a manual export?
4. Who gives us access? Can we have a service account (not a personal account)? Which sites: Hull, Nottingham, Weinheim, Mira?
5. Can the file be UTF-8 (or Excel) with normal line ends and no `Total:` row? Today the Plan OPT files are UTF-16, tab separated, with a carriage return at line end and a `Total:` row at the end.
6. How many months of history exist? How many do we need?
7. Who tells us when column names, machine names or shift names change?

## Questions about content
1. **GT4 production.** Our Insights Hub data holds 44% of the good parts in the real Plan OPT file (24 days). How is GT4 filled in the file? Is it entered by hand? Is the file edited by hand?
2. **Planned stops.** Real Planned OpT is below the day length on some days. Where do these planned stops come from? Are they in Insights Hub?
3. **Machine scope.** The report query drops 10 of the 34 Hull machines (a fixed list in the query). Which machines must be in the first version?
4. **Machine names.** The file says "B2 Auto". Insights Hub says "B2 Line". Which name must the report show?
5. **Capacity.** What is the rule for Capacity? (design speed x planned time? a target speed?) The speed differs for the same machine and product in the file.
6. **Product Type, Department, Area.** Insights Hub has only the area. We use it for all three now. Please give the Machine Names file for each site.
7. **Shift names.** Raw names look like `FriDay - Blue` or `Friday Early Shift`. Which mapping file turns them into the shift names of the report?
8. **Volume Loss Correction.** What is the rule? We do not know it. Please explain or give an example.
9. **Local time.** Which time zone does each site use for dates in the files?

## Interim plan (manual copy)
- The user copies the files by hand to the data lake. Keep the original file unchanged in a `raw` folder. Write the converted table in a second folder.
- The conversion must handle: UTF-16, tab separator, carriage-return line ends, thousands commas, `HH:MM:SS` time, `75.9%` text, the `Total:` row and the empty last column.
- Machine names in the files must match the Insights Hub asset names. Keep a mapping table for differences (for example B2 Auto and B2 Line).
- Write the download date in the file name. Then we know how old the data is.
