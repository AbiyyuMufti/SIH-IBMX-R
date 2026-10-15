# SharePoint files of the Power BI report: what they contain and how they fit Insights Hub

| At a glance | |
|---|---|
| **What** | Findings from the 36 files downloaded from the Nottingham site and the Hull Plan OPT folder (2026-10-13/14), compared with the Insights Hub tables in the data lake and with the load queries of the Power BI model |
| **Files** | Since 2026-10-15: `sharepoint/<group>/<type>/site=<site>/` in the project root (git-ignored, list in `sharepoint/MANIFEST.md`). Groups: `reference` (format_list, glidepaths, shift_naming, machine_names, equipment_coding), `source` (plan_opt, line_losses, run_rates, volume_loss_correction), `staging` and `report` (empty). Hull now complete like Nottingham and Weinheim (the user downloaded the five other Hull folders on 2026-10-14). Machine Names converted from xlsx to CSV (originals in `sharepoint/_original_xlsx/`). Shift Patterns has no site column: `site=All`. Not reachable: the whole Mira site (only its Glidepath and Format List are here) |
| **Only the newest files** | Per Provideam folder only the newest files were downloaded: Aug, Sep and the current month (Hull Plan OPT also Jul). The folders hold more (first run counted Nottingham Line Losses 22 files, Run Rates and Volume Correction 16 each). Weinheim is on the Nottingham SharePoint site, in its own folder `EU OEE Weinheim A Sz` |
| **Repeat the analysis** | `python scripts/helper-analyze-sharepoint.py` writes `diagrams/data/sharepoint-findings.json`; `node scripts/build-drawio.js` redraws the sheets |
| **Where to see it** | `diagrams/powerbi-data-map.drawio`: sheets Explanation Targets, Format List, Shift names, Machine Names, Equipment Coding, Loss Units, Data collection and conflicts. See [powerbi-diagrams.md](powerbi-diagrams.md) |
| **Status** | Analysis of 2026-10-14. Numbers are for the files and lake data of that day |

## Normalized layer (2026-10-15)
- `sharepoint/source_original/` holds the raw exports (the download watcher writes here); `sharepoint/source/` holds the normalized month files `<type>/site=<Site>/<type>_<YYYY-MM>.csv` for plan_opt, line_losses and volume_loss_correction (Run Rates is not used). Script: `python -I scripts/normalize-sharepoint-source.py` (`--dry-run` first). Rules are at the top of the script. Re-run after new downloads: it rewrites only the months that changed and lists them in `sharepoint/normalize-changed.txt`.
- Result of the first run: 175 month files, 0 problems. Raw rows = kept rows + duplicates + invalid for every type and site; the `Total:` row of each raw file against the parsed sum agrees within rounding (largest relative gap 4e-7); a re-run changes 0 files; Hull Sep 2026 Plan OPT equals the raw file (967 rows, 22,354,544 Good Parts). One real conflict: Hull Plan OPT 17 Dec 2025 is in two daily files (`20251217` and `20251218`, 3 rows differ: capacity, planned OpT, OEE); the later publish is kept, please confirm with Reckitt.
- Kept as text on purpose: OEE (`75.9%`) and the time columns HH:MM:SS (hours can pass 24). Column names stay as in the raw files, except `PartDesc` becomes `PartName` and `SiteName` is added first. About 790 Nottingham/Hull line loss comments contained a tab; the parts are joined back with a space.
- Differences between raw files that the normalizer removes: the Hull history file (`Plan OPT 1dec24_9nov25`) has CRLF, quoted numbers, dd/mm/yyyy dates and no trailing empty column; Weinheim Line Losses calls the part column `PartName`; `No data found` file (Hull volume correction 26 Dec 2025) is skipped.

## File format (all Provideam report files)
UTF-16 with byte order mark, tab separated, lines end with a bare CR, a trailing empty column, a `Total:` row at the end of the Plan OPT files, no quote characters. The comment text in the Line Losses files contains unescaped quotes, so a normal CSV reader fails: read them without a quote character. Excel-kept files (formats, glidepaths, shift coding, equipment coding) are UTF-8 with a byte order mark, comma separated. The two Machine Names files are `.xlsx`. The folders hold one file per month plus a current-month file (rewritten by an hourly job).

## What each file gives
| File | Content | Check against Insights Hub |
|---|---|---|
| Glidepaths (4 files, one per site) | Site Name, Line, OEE Bucket, then 48 month columns (01/01/2025 to 01/12/2028, text dates). Hull: 30 lines x 17 buckets. 2026 is 91 % filled, 2027 and 2028 are empty | Line names equal Plan OPT names (B2 Auto, GT4), not Insights Hub (B2 Line). Bucket names (Adjustments, Breakdown, Minor Stops ...) do not equal Insights Hub reason names: 22 of 10,100 stops match |
| Format Mapping (3 files) | Site Name, MachineName, Product Name, Brand, Unit Size, Unit Count/Format, Extra Info. Hull: 286 rows, 25 machines, 188 products | GT4: 13 of 13 Insights Hub names match. B2: 0 of 27 (SAP-style descriptions against short names). 111 of 178 (machine, part) pairs of the Hull Plan OPT files are in the list |
| Shift Pattern (1 file) | ShiftName (raw) to Shift. 188 rows, 7 values: Afternoon, Blue, Day, Gold, Green, Night, Red | All 105 raw Hull shift names are covered. Insights Hub Blue, Gold, Green, Red match; Yellow, Shift 1, Shift 2 do not. The report keeps the mapped value in `ShiftName` and drops the raw name |
| Equipment Coding (Nottingham, Weinheim) | MachineName, OEELossLvl3Desc, Merged Unique Identifier (machine + description), Equipment, Lvl 3 Loss Name (empty). Hull not downloaded | 98 % (Nottingham) and 70 % (Weinheim) of the unplanned stop rows have an entry. Insights Hub reason texts (B2: alarm texts) are not the descriptions |
| Volume Loss Correction (Nottingham, Weinheim) | ShiftStartDate, MachineName, Group, SubGroup, Desc, Time, Loss Units. A daily Provideam report, not a manual file | Loss units per minute = capacity per planned minute: 2,341 of 2,349 machine-days (one product) within 3 %. This is the rule the Insights Hub flow assumes (design speed x duration) |
| Line Losses (Mode Log) | StartTime, MachineName, PartDesc, ShiftName, Group, SubGroup, Desc, Duration, ShiftStartDate, Comment | Comment text filled for 63 % of the Nottingham rows and 4 % of Weinheim. Groups: Planned Losses, Unplanned Losses, Production Not Scheduled, NPD / CapEx & Trials, Not Logged |
| Run Rates | AreaName, MachineName, hour, PartName, ShiftName, Good Parts, Capacity (hourly) | Not compared (group 2) |
| Machine Names (Nottingham 66 rows, Weinheim 6) | MachineName, Dept, Area, Product Type. Hull sample from the local copy: 29 rows | Hull file not downloaded |

## What the report query does (read from the Power BI model)
- **Loss names:** the Hull query makes Provideam sub group names equal to the glidepath buckets with 17 text rules (for example `Minor Stop` to `Minor Stops`, `Breakdown - Mechanical` to `Breakdown`). The groups `Planned Losses` and `Unplanned Losses` are renamed to `Planned Loss` and `Unplanned Loss`.
- **Loss Target Key** = machine name + sub group + month start (text); **Loss Key** in the glidepaths = line-site + bucket + month.
- **Volume Total** = the sum of **Capacity** per machine and per **day** from the Plan OPT files (key machine + date). Earlier docs said good parts per month: corrected.
- **Equipment Loss Key** = machine name + loss description; an empty equipment becomes `Unclassed`.
- **Product Key** = machine name + site + part name; **Unique Machine Name** = machine name + `-Hull`.

## What this completes in the data mapping
- Targets (3 Plan OPT columns, Value and Target in Daily Losses): the Glidepaths file gives them, once the line names and the loss names are mapped.
- Shift list: the Shift Pattern file gives the list, with Insights Hub names to map.
- Format List: the Format Mapping file gives brand, size and count, with the B2 names to map.
- Volume Total: needs no file, build it from the Plan OPT Capacity.
- Loss Units: the rule is confirmed, no file needed if the speed per minute is the same.
- Equipment, Dept, Area, Product Type: structure and key known; the Hull files are still missing.

## What is still missing
- Hull folders: Equipment Coding, Line Losses, Machine Names, Packing Run Rates, Volume Loss Correction (no access). Mira site: no access.
- Mappings that do not exist anywhere yet: Insights Hub machine name to Provideam machine name; Insights Hub product to Provideam product (B2); Insights Hub shift to Shift value; Insights Hub reason to bucket and to equipment description.
- Glidepath targets for 2027 and later (empty in the file).
- Decision: which system is the official OEE source per site.
- Not tested: Power Automate to VFC transfer (size limit, key, POST on `http in`).
