# Hull Daily_Losses_EU: 20 more loss rows in Power BI than in the lake (Aug 2026)

Read-only investigation, 2026-11-10. Nothing was written to the lake, uploaded or changed in flows or config.

## Answer in one paragraph

The lake is right and Power BI double counts. Nothing is collapsed in the lake: the raw Hull export holds each of the 18 events once. Power BI shows them twice because its query joins every loss event to the volume loss correction table on a key that is **not unique**. The query first renames `Breakdown - Electrical` and `Breakdown - Mechanical` to `Breakdown`, so a machine / day / loss description that has an Electrical row and a Mechanical row in the correction file gets the same key twice. A left join on a key with two matches returns the event twice (a fan-out). The lake lookup keeps the first correction row per key, so the event stays once. In Aug 2026 the two correction rows always have the same rate (units per minute), which is why both Power BI copies carry the same loss units.

## Evidence per question

| # | Question | Answer |
|---|---|---|
| 1 | Where does the lake drop or merge identical rows? | Only in [scripts/vfc/b7-loss-rows.js](../scripts/vfc/b7-loss-rows.js) lines 204 to 209: it drops a second row with the same `MachineName + StartTime` (the report's `Removed Duplicates` on `Merged`). It drops **0 rows** for Hull Aug 2026: the raw file has 22,083 rows and 0 repeated machine + start time, and the lake output has none either. So this step is not the cause. The step that makes the difference is [scripts/vfc/b7-vol-lookup.js](../scripts/vfc/b7-vol-lookup.js) lines 60 to 73: `if (map[key] !== undefined) return;` keeps the first correction row per key, and `b7-loss-rows.js` line 225 reads one value per key. No other distinct / group-by step exists in the Hull loss build. |
| 2 | Are the repeats real in the source? | No. [sharepoint/source_original/line_losses/site=Hull/Hull_Aug2026-monthly_line_losses.csv](../sharepoint/source_original/line_losses/site=Hull/Hull_Aug2026-monthly_line_losses.csv): B6 on 28 Aug has 4 de-pal events (10:00 26 min, 11:00 60 min, 12:00 60 min, 13:00 26 min), D1 on 21 Aug 3 casepacker events, SP8 on 11 Aug 2 antares events, each **once**. Power BI has each of them twice. The correction file [sharepoint/source_original/volume_loss_correction/site=Hull/Hull_Aug2026-monthly_vol_corr.csv](../sharepoint/source_original/volume_loss_correction/site=Hull/Hull_Aug2026-monthly_vol_corr.csv) has two rows for each of these: B6 28 Aug de-pal `Breakdown - Electrical` 02:26:00 / 21,900 units and `Breakdown - Mechanical` 00:26:00 / 3,900 units (both 150 units per minute); D1 21 Aug casepacker 6,000 units / 50 min and 16,680 / 139 min (both 120 per minute). |
| 3 | What does the Hull query do? | `Daily Line Losses H` has the same `Table.Distinct(..., {"Merged"})` step as N and W (Merged = machine + start time, so it only removes a second row with the same machine and start). It runs **before** the join `NestedJoin(Volume Key, Volume Loss Correction H, Volume Key, LeftOuter)` and nothing removes duplicates after the join. In `Volume Loss Correction H` the `Breakdown - Mechanical` / `- Electrical` replace runs before the Volume Key is built and the table is not made unique. The stored correction table in the .pbix has 131 keys with more than one row (Hull) and 67 (Nottingham). The `Removed Duplicates` step of Nottingham is the same and does not help either. |
| 4 | Which side is right? | The lake. All 18 events are single events in the export; the two correction rows are two parts of the same Breakdown total, not two events. Power BI counts the 139 minute casepacker stop twice (278 minutes). Hull Aug 2026: 6,818 Unplanned Loss rows in Power BI against 6,798 in the lake = 0.77 % more loss units, which is the 23.78 % against 23.60 % unplanned loss. |
| 5 | Nottingham and Weinheim? | Nottingham: the same, 9 events, 9 extra Power BI rows, 10,113 units (0.10 % of its unplanned units), all 9 traced to 4 correction keys with two rows (Basing2 24 Aug, Film Coating 4 17 and 24 Aug, S04 7 Aug), rate equal in the pair. Weinheim: no effect (0 events; its correction query has no Breakdown replace and the correction table has no duplicate key). |

## Numbers for Aug 2026 (shift start dates 1 to 31 Aug, lines of the EU report)

| Site | Events Power BI has more of | Extra Power BI rows | Extra loss units | Extra minutes | Unplanned Loss rows Power BI / lake |
|---|---|---|---|---|---|
| Hull | 18 | 20 | 90,655 | 1,319 | 6,818 / 6,798 |
| Nottingham | 9 | 9 | 10,113 | 1,644 | 8,403 / 8,394 |
| Weinheim | 0 | 0 | 0 | 0 | 464 / 464 |

Not Logged and Planned Loss rows are equal on all three sites. The monthly gap is the same size in the other months (Hull Jan to Jul 2026: 14 to 40 rows, 36,000 to 183,000 units a month; Nottingham 0 to 12 rows), so it is a standing difference, not an August accident. The September rows differ for another reason (the .pbix stops in mid September).

## Side findings (not part of the question)

- The rate in the two correction rows is equal in Aug 2026, but not always: in the stored history 3 of 131 Hull and 9 of 67 Nottingham duplicate keys have rates more than 2 % apart (up to 82 % for one Nottingham key). Power BI then shows two copies with two different unit values; the lake takes the unit value of whichever row comes first in the file, so for these rare keys the result depends on the row order.
- The comment in `b7-vol-lookup.js` says the first row is kept "as the report does (checked against its Daily Losses table, 2026-10-17)". The report does not keep one row, it keeps both. The check must have compared unit values of matched rows only.
- Description text: the lake keeps a trailing space in 605 `OEELossLvl3Desc` values (for example `Unable to Hookup to Liquid `, 28 raw Hull rows in Aug 2026 have one); Power BI has none, so a filter on the description in Tableau shows two entries. It does not change any total. Not fixed here.

## Proposed change (not applied, you decide)

1. **Lake: no change to the row count.** Keep one row per event. Do not copy the Power BI fan-out; it would add 1,319 minutes (22 hours) of loss to Hull and 1,644 minutes (27 hours) to Nottingham in Aug 2026 that did not happen.
2. **Optional, makes the unit value independent of the file order** ([scripts/vfc/b7-vol-lookup.js](../scripts/vfc/b7-vol-lookup.js), the block at lines 60 to 73): when a key appears again, add the units and the minutes to the first entry instead of skipping it. The event then gets the pooled rate (sum of units divided by sum of minutes), which is 150 units per minute for B6 28 Aug, the same as now, and a fair average for the rare keys with two different rates. The check line (`node scripts/test-vfc-flow.js`) needs one made-up case with two rows on one key.
3. Fix the comment in the same file so it says: "the report joins both rows and shows the event twice (fan-out, wrong); the lake keeps one event".
4. Tell Reckitt / Segun: the Power BI Hull and Nottingham `Daily Losses` count events twice when the correction file has an Electrical and a Mechanical row for the same machine, day and loss. Their fix in Power BI is to group `Volume Loss Correction H` and `N` by `Volume Key` (sum of Loss Units and Time in Mins) before the join. Until then the Tableau EU numbers will be 0.18 points lower than Power BI for Hull unplanned loss and that is the correct side.
5. Optional, separate: trim `OEELossLvl3Desc` in `b7-loss-rows.js` (the equipment and correction keys use the untrimmed text today, so the key text would have to be trimmed in `b7-vol-lookup.js` and `b7-equip-lookup.js` too).

## How it was checked

Power BI side: `pbixray` on [downloads/EU Daily OEE Report 2025 V1 1.pbix](../downloads/EU%20Daily%20OEE%20Report%202025%20V1%201.pbix) (tables `Daily Losses EU`, `Daily Line Losses H`, `Volume Loss Correction H / N / W`, Power Query steps of `Daily Line Losses H / N / W`). Lake side: [bi-builder/data/eu_report_latest/Daily_Losses_EU.csv](../../bi-builder/data/eu_report_latest/Daily_Losses_EU.csv) (downloaded 2026-11-10, `In EU Report` = true). Events compared on machine, shift start date, shift, description (trimmed), duration, group. Raw side: the two Aug 2026 files listed above (UTF-16, tab separated). The stored correction table in the .pbix ends on 10 Mar 2026, so for August the proof is the raw correction file (8 Hull and 4 Nottingham keys with two rows after the replace, which cover all 27 events) and not the stored table. Scratch scripts stayed in the session scratchpad; nothing was committed.
