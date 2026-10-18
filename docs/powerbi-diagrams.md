# Power BI data map (draw.io diagram)

| At a glance | |
|---|---|
| **What** | One draw.io file that shows, for every Power BI table of the EU report: which columns it has, an example, the column we create for it, and what is different (empty now, assumption, partly filled) |
| **File** | `diagrams/powerbi-data-map.drawio` (plain XML, tracked in git). Open it with draw.io (desktop, web or the VS Code extension) |
| **Sheets** | Overview (no number), then sheets 1 to 6, one per table (1 Machine Names, 2 Plan OPT, 3 Time Utilisation, 4 Daily Losses, 5 Shift Naming, 6 Calendar; the number is also on the overview card). Then sheets without a number that only explain: Targets (Glidepaths), Format List, Shift names, Machine Names, Equipment Coding, Loss Units (how each file is consumed by the report, with a key match example and the risks), Provideam vs Insights Hub, Data collection and conflicts (how each item is collected and where it conflicts with Insights Hub), Plan to get the missing data (three options: Power Automate, direct access to SharePoint, manual copy; classes of files; sequence; decisions; which missing data first) Three options flow charts (swim lanes: how it works, what Reckitt must do, the tests as diamonds with a fallback) and Not created yet (columns of each missing table) |
| **Colours** | Green = OK. Yellow = partly filled. Orange = assumption or difference to check. Purple = needs source file: the report takes the value from a file, and the values would be the same if the file is extracted (key names must match). Red = empty now or no column. Grey = not needed |
| **Made from** | The Power BI template and report file (outside the repo), the mapping workbook, the sample files of the Power BI local copy, and a profile of our parquet files (`diagrams/data/ours-profile.json`) |
| **Status** | Built 2026-10-13 on the Hull data of 2026-09-01 to 2026-10-12 (38 days). Not reviewed by Reckitt |

## How to refresh it
1. Download the lake files to `parquet/` (`parquet/extractdata.ipynb`). The `.parquet` files are git-ignored.
2. `python scripts/helper-profile-parquet.py parquet diagrams/data/ours-profile.json` reads them (types, filled share, examples; asset ids are shortened).
3. `node scripts/build-drawio.js` writes the diagram. The paths of the Power BI files are constants at the top of the script.
4. `node scripts/validate-drawio.js` checks ids, arrows, overlaps and whether the text fits the boxes.
5. `node scripts/export-drawio-summary.js` writes `docs/powerbi-data-map.md` (a text table per sheet 1 to 6) from the saved `.drawio`. Run it after every change of the diagram. `.graphifyignore` hides `diagrams/` from graphify, so it reads this Markdown instead of the big XML.

## Columns on a table sheet (left to right)
Power BI column and example, Insights Hub column and example, and **SIH integration** (status and difference, with the colour levels below). Inside the SIH integration box, below its last text, a **SIH source** box (bold dashed border, see-through fill) gives the API endpoint and the field the column is built from. Teal = API endpoint, indigo = built in the flow without an API call, grey = no Insights Hub source (file) or not needed. The endpoint texts are in the `SIH_SRC` map of `scripts/build-drawio.js` (key: `Power BI table|column`). Paths are shown without the Xcelerator service suffix (target platform), see [platform-switch.md](platform-switch.md). The overview cards list the endpoints of each table, and the last sheet shows the possible source of each missing table.

## Where the text of the "SIH integration" box comes from
- The notes written by hand are in the `NOTE` table of `scripts/build-drawio.js` (key: `Power BI table|column`). They hold what we decided and what we know now, for example the capacity assumption. Change a note there, not in the diagram.
- A column without a hand-written note takes its text from the mapping workbook (sheet "PBI column mapping").
- The colour also follows the data: a column with no values is red, a column below 99.5 % filled gets the "partly filled" label.

## What the first run showed (Hull, 2026-10-13)
- Empty now: `product_type`, the three targets in plan OPT, `value`, `target` and `volume_total` in daily losses.
- Partly filled: product columns (about 73 to 83 %, empty on days with no product), `loss_units`, `oee_time`, `batch_id` (71 %), `equipment` (16 %), `loss_lvl3_sub_group` (35 %), `breakdown_types` (0.2 %).
- Days with no product found: B2 Line 1 to 3 and 8 to 14 Sep; GT4 29 Sep, 3 Oct and 6 to 8 Oct.
- Power BI tables not created yet: 10 (listed on the last page).

## Purple level: needs source file (2026-10-13)
Purple only where the report takes the value from the Glidepaths files: the three targets in Plan OPT, Value and Target in Daily Losses, and the four target tables on the "Not created yet" sheet. It means: if the file is extracted, the values are the same as in the report, if the key names match. Items that depend on other files (Machine Names, Shift Naming, Equipment Coding, Volume Loss Correction, Targets Volume) keep their own colour (orange assumption or red empty) until we have looked at those files. The label also says "EMPTY NOW" or the filled share. List of files and questions: [prompt-response/file-integration-questions.md](../prompt-response/file-integration-questions.md).
 (2026-10-13)
Shows the path: Glidepaths files, 4 target tables, 5 filled columns (3 in Plan OPT, 2 in Daily Losses), and the visuals that use them (from the data lineage document): OEE Target for visuals 1 and 4, PDT Target for 3 and 7, UPDT Target for 2 and 8, Daily Losses Value and Target for visual 5. Volume Total (visual 5) is not from Glidepaths. The lower part shows the key match and three reasons why a target can stay empty (machine name, loss category name, month text).

## Update 2026-10-14 (downloaded files)
The findings of the SharePoint files are in [sharepoint-files.md](sharepoint-files.md); numbers in the sheets come from `diagrams/data/sharepoint-findings.json` (made by `python scripts/helper-analyze-sharepoint.py`). Purple still means: the report takes the value from a file that was checked, and the values are the same if the file is extracted. Corrected: Volume Total is the sum of the Plan OPT Capacity per machine and day (not good parts per month), so it is no file item. Hull files of Machine Names, Equipment Coding and Volume Loss Correction are not downloaded, so those columns stay orange.

## Hand-edited file: how to add new parts (2026-10-14)
The saved file is edited by hand, so `node scripts/build-drawio.js` must NOT overwrite it. Build to a temporary file with `DRAWIO_OUT=<path> node scripts/build-drawio.js`, then merge only a NEW page with `python scripts/helper-merge-drawio-new.py <saved file> <generated file> "<new page name>" "<after page name>" [--overview]` (adds the page, and with --overview the new cells of the overview, nothing else). The overview has a panel "Priority of all 16 tables" (the 6 created and the 10 not created tables), ranked by the number of visuals of the EU-Level Overview page that depend on the table (Segun's data lineage; a table that only feeds a column counts the visuals that use that column), then by the report pages that read it. To swap that panel in the hand-edited file use `python scripts/helper-replace-drawio-panel.py <saved file> <generated file>`.

## Overview panels for eu_report (2026-10-15)
Right of the priority panel: "Table separation for eu_report" (the 6 finished tables, the reference files, the monthly Provideam exports, the staging tables and whether they are needed) and a flow chart "How pbi_report is combined" (files in `sharepoint/`, prepare steps, join steps, the 6 tables, gaps). Merged into the hand-edited file with `helper-merge-drawio-cells.py --min-x 2400 --prefix sep-` and `--min-x 3400 --prefix flow-` (the flow chart first; run the separation merge with a max x if it is redone).

## Sheet "Plan ih_report and pbi_report" (2026-10-15)
New sheet after "Explanation Three options flow charts": two flow charts (ih_report: Insights Hub APIs and the reference files through the VFC flows to the 6 tables; pbi_report: Provideam exports and reference files through download, watcher, normalizer and upload to the lake, then the VFC build still to do), a box per report for what it covers and does not cover, and a table by table comparison of the sources. Green = done, yellow = to build. Code: the block "Page: plan of ih_report and pbi_report" in `scripts/build-drawio.js`; merged into the hand-edited file with `helper-merge-drawio-new.py` (new page after "Explanation Three options flow charts").

## How Power BI creates each table (2026-10-14)
Each table sheet (1 to 6) has a flow chart on the right. Left: the data sources of the table. Middle: the steps in Power BI (stack, left join, keys). Right: the Power BI table and our Insights Hub table. Each source has a status: green = Insights Hub replaces it (the original file is used for validation); purple = needed and missing (we must get this file); grey = built inside Power BI (nothing to collect). Purple steps are the joins that use a missing file. Source: the load queries of the Power BI template. The content is the `FLOWS` map in `scripts/build-drawio.js`. To add the cells to the hand-edited file: `python scripts/helper-merge-drawio-cells.py <saved> <generated> --min-x 1340 --prefix how2- --remove-prefix how2- "<page>" ...` (use `--remove-prefix how-` once to remove the old text boxes).
