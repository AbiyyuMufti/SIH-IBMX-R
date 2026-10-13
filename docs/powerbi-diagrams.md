# Power BI data map (draw.io diagram)

| At a glance | |
|---|---|
| **What** | One draw.io file that shows, for every Power BI table of the EU report: which columns it has, an example, the column we create for it, and what is different (empty now, assumption, partly filled) |
| **File** | `diagrams/powerbi-data-map.drawio` (plain XML, tracked in git). Open it with draw.io (desktop, web or the VS Code extension) |
| **Sheets** | Overview (no number), then sheets 1 to 6, one per table (1 Machine Names, 2 Plan OPT, 3 Time Utilisation, 4 Daily Losses, 5 Shift Naming, 6 Calendar; the number is also on the overview card). Then two sheets without a number that only explain: "Explanation Targets (Glidepaths)" "Explanation Provideam vs Insights Hub" (which data both systems have, what only one has, what is independent) and "Not created yet" (columns of each missing table) |
| **Colours** | Green = OK. Yellow = partly filled. Orange = assumption or difference to check. Purple = needs source file: the report takes the value from a file, and the values would be the same if the file is extracted (key names must match). Red = empty now or no column. Grey = not needed |
| **Made from** | The Power BI template and report file (outside the repo), the mapping workbook, the sample files of the Power BI local copy, and a profile of our parquet files (`diagrams/data/ours-profile.json`) |
| **Status** | Built 2026-10-13 on the Hull data of 2026-09-01 to 2026-10-12 (38 days). Not reviewed by Reckitt |

## How to refresh it
1. Download the lake files to `parquet/` (`parquet/extractdata.ipynb`). The `.parquet` files are git-ignored.
2. `python scripts/helper-profile-parquet.py parquet diagrams/data/ours-profile.json` reads them (types, filled share, examples; asset ids are shortened).
3. `node scripts/build-drawio.js` writes the diagram. The paths of the Power BI files are constants at the top of the script.
4. `node scripts/validate-drawio.js` checks ids, arrows, overlaps and whether the text fits the boxes.

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
