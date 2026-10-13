# Power BI data map (draw.io diagram)

| At a glance | |
|---|---|
| **What** | One draw.io file that shows, for every Power BI table of the EU report: which columns it has, an example, the column we create for it, and what is different (empty now, assumption, partly filled) |
| **File** | `diagrams/powerbi-data-map.drawio` (plain XML, tracked in git). Open it with draw.io (desktop, web or the VS Code extension) |
| **Pages** | 1 Overview (tables, where used, joins, tables not created), then one page per table (Machine Names, Plan OPT, Time Utilisation, Daily Losses, Shift Naming, Calendar), then "Targets (Glidepaths)" (how the targets reach the visuals, and how a stop finds its target), then "Not created yet" with the columns of each missing table |
| **Colours** | Green = OK. Yellow = partly filled. Orange = assumption or difference to check. Purple = needs source file (assumption or empty now, the real source is a file that is not connected yet). Red = empty now or no column. Grey = not needed |
| **Made from** | The Power BI template and report file (outside the repo), the mapping workbook, the sample files of the Power BI local copy, and a profile of our parquet files (`diagrams/data/ours-profile.json`) |
| **Status** | Built 2026-10-13 on the Hull data of 2026-09-01 to 2026-10-12 (38 days). Not reviewed by Reckitt |

## How to refresh it
1. Download the lake files to `parquet/` (`parquet/extractdata.ipynb`). The `.parquet` files are git-ignored.
2. `python scripts/helper-profile-parquet.py parquet diagrams/data/ours-profile.json` reads them (types, filled share, examples; asset ids are shortened).
3. `node scripts/build-drawio.js` writes the diagram. The paths of the Power BI files are constants at the top of the script.
4. `node scripts/validate-drawio.js` checks ids, arrows, overlaps and whether the text fits the boxes.

## Where the text of the "difference" box comes from
- The notes written by hand are in the `NOTE` table of `scripts/build-drawio.js` (key: `Power BI table|column`). They hold what we decided and what we know now, for example the capacity assumption. Change a note there, not in the diagram.
- A column without a hand-written note takes its text from the mapping workbook (sheet "PBI column mapping").
- The colour also follows the data: a column with no values is red, a column below 99.5 % filled gets the "partly filled" label.

## What the first run showed (Hull, 2026-10-13)
- Empty now: `product_type`, the three targets in plan OPT, `value`, `target` and `volume_total` in daily losses.
- Partly filled: product columns (about 73 to 83 %, empty on days with no product), `loss_units`, `oee_time`, `batch_id` (71 %), `equipment` (16 %), `loss_lvl3_sub_group` (35 %), `breakdown_types` (0.2 %).
- Days with no product found: B2 Line 1 to 3 and 8 to 14 Sep; GT4 29 Sep, 3 Oct and 6 to 8 Oct.
- Power BI tables not created yet: 10 (listed on the last page).

## Purple level: needs source file (2026-10-13)
A column or table is purple when its real source in the Power BI report is a SharePoint file (Glidepaths targets, Machine Names, Shift Naming, Equipment Coding, Volume Loss Correction, Targets Volume) and Insights Hub has no data for it. The label also says "EMPTY NOW" or the filled share, so the stand-in value is still visible. The list of files and questions for Reckitt: [prompt-response/file-integration-questions.md](../prompt-response/file-integration-questions.md). Set the level in the NOTE table of the builder with `'file'`.

## Targets page (2026-10-13)
Shows the path: Glidepaths files, 4 target tables, 5 filled columns (3 in Plan OPT, 2 in Daily Losses), and the visuals that use them (from the data lineage document): OEE Target for visuals 1 and 4, PDT Target for 3 and 7, UPDT Target for 2 and 8, Daily Losses Value and Target for visual 5. Volume Total (visual 5) is not from Glidepaths. The lower part shows the key match and three reasons why a target can stay empty (machine name, loss category name, month text).
