# Hull / Nottingham loss rows counted twice: Power Query as-is and to-be

Written 2026-11-11. Read-only: nothing changed in flows, lake or the .pbix. Not committed (holds the Power Query text of the report, with the SharePoint address masked).

Background: [hull-loss-duplicates.md](hull-loss-duplicates.md). Picture: [diagrams/hull-loss-fanout.drawio](../diagrams/hull-loss-fanout.drawio). Proof: [analysis/proof-loss-fanout.ipynb](../analysis/proof-loss-fanout.ipynb).

## The problem in four lines

1. `Daily Line Losses H` builds a **Volume Key** for every loss event (day, machine, group, sub group, description). Before that it renames the sub group `Breakdown - Electrical` / `Breakdown - Mechanical` to `Breakdown`.
2. `Volume Loss Correction H` builds the same key for every correction row, with the same rename.
3. SP8, 14 Sep 2026, `CasePacker Carton Infeed`: the correction file has TWO rows (Electrical 96 min, Mechanical 30 min). After the rename both rows have the SAME key.
4. `NestedJoin(... LeftOuter)` returns one output row per match. Every event with that key gets 2 rows. Count of Volume Key = 2, minutes doubled (96 -> 192, 30 -> 60).

## What to change: ONE query, at the very end

Only `Volume Loss Correction H` (and the same in `Volume Loss Correction N`) changes. `Daily Line Losses H / N` stay as they are: they only read `Loss Units` and `Time in Mins` from the correction table, and those two columns stay.

### Option A (recommended): one row per key, units and minutes added up

Replace the last two lines of the query:

```
    #"Renamed Columns3" = Table.RenameColumns(#"Added Custom",{{"Custom", "Time in Mins"}})
in
    #"Renamed Columns3"
```

with:

```
    #"Renamed Columns3" = Table.RenameColumns(#"Added Custom",{{"Custom", "Time in Mins"}}),
    #"Grouped by Volume Key" = Table.Group(
        #"Renamed Columns3",
        {"Volume Key"},
        {
            {"Loss Units", each List.Sum([Loss Units]), Int64.Type},
            {"Time in Mins", each List.Sum([Time in Mins]), type number}
        }
    )
in
    #"Grouped by Volume Key"
```

Why this is right: Loss Units of an event = correction Loss Units x event minutes / correction minutes. With the sums, that is the average rate of the two correction rows (units per minute), and each event is matched once. For SP8 14 Sep: (5,280 + 1,650) / (96 + 30) = 55 units per minute, so the 96 minute event keeps 5,280 and the 30 minute event keeps 1,650, exactly as in the lake.

### Option B: keep the first row per key (exactly what the lake does)

Same place, instead of the group step:

```
    #"Renamed Columns3" = Table.RenameColumns(#"Added Custom",{{"Custom", "Time in Mins"}}),
    #"Removed Duplicates" = Table.Distinct(#"Renamed Columns3", {"Volume Key"})
in
    #"Removed Duplicates"
```

Same result as A when the two correction rows have the same rate (all of Aug and Sep 2026). With different rates the result depends on the order of the files. A does not.

### Checks after the change

- SP8, 14 Sep 2026 in `Daily Losses EU`: Count of Volume Key = 1 on every row, `CasePacker Carton Infeed` shows 96 and 30 minutes (not 192 and 60).
- The sum of `Duration` of the day must equal the raw file (see the notebook).
- Other queries that read `Volume Loss Correction H`: look in Power Query "Query Dependencies" before you apply. This note only knows `Daily Line Losses H`. Group removes every column except Volume Key, Loss Units, Time in Mins.

## As-is: `Volume Loss Correction H` (from the .pbix, SharePoint address masked)

```
let
    Source = SharePoint.Files("<HULL-SITE-URL>", [ApiVersion = 15]),
    #"Filtered Rows" = Table.SelectRows(Source, each ([Folder Path] = "<HULL-SITE-URL>/Shared Documents/General/Power BI/OEE Board A Sz/Volume Loss Correction/")),
    #"Filtered Hidden Files1" = Table.SelectRows(#"Filtered Rows", each [Attributes]?[Hidden]? <> true),
    #"Invoke Custom Function1" = Table.AddColumn(#"Filtered Hidden Files1", "Transform File (15)", each #"Transform File (20)"([Content])),
    #"Renamed Columns1" = Table.RenameColumns(#"Invoke Custom Function1", {"Name", "Source.Name"}),
    #"Removed Other Columns1" = Table.SelectColumns(#"Renamed Columns1", {"Source.Name", "Transform File (15)"}),
    #"Expanded Table Column1" = Table.ExpandTableColumn(#"Removed Other Columns1", "Transform File (15)", Table.ColumnNames(#"Transform File (20)"(#"Sample File (20)"))),
    #"Changed Type" = Table.TransformColumnTypes(#"Expanded Table Column1",{{"Source.Name", type text}, {"ShiftStartDate", type datetime}, {"MachineName", type text}, {"OEELossLvl3Group", type text}, {"OEELossLvl3SubGroup", type text}, {"OEELossLvl3Desc", type text}, {"Time", type text}, {"Loss Units", type number}, {"", type any}}),
    #"Replaced Value" = Table.ReplaceValue(#"Changed Type","Breakdown - Mechanical","Breakdown",Replacer.ReplaceText,{"OEELossLvl3SubGroup"}),
    #"Replaced Value1" = Table.ReplaceValue(#"Replaced Value","Breakdown - Electrical","Breakdown",Replacer.ReplaceText,{"OEELossLvl3SubGroup"}),
    #"Replaced Value2" = Table.ReplaceValue(#"Replaced Value1","In Process Quality Control","In process Quality Control",Replacer.ReplaceText,{"OEELossLvl3SubGroup"}),
    #"Replaced Value3" = Table.ReplaceValue(#"Replaced Value2","Lack of resources","Lack of Resource",Replacer.ReplaceText,{"OEELossLvl3SubGroup"}),
    #"Removed Columns" = Table.RemoveColumns(#"Replaced Value3",{"Source.Name"}),
    #"Removed Columns1" = Table.RemoveColumns(#"Removed Columns",{""}),
    #"Changed Type1" = Table.TransformColumnTypes(#"Removed Columns1",{{"ShiftStartDate", type text}}),
    #"Split Column by Delimiter" = Table.SplitColumn(#"Changed Type1", "ShiftStartDate", Splitter.SplitTextByEachDelimiter({" "}, QuoteStyle.Csv, false), {"ShiftStartDate.1", "ShiftStartDate.2"}),
    #"Removed Columns3" = Table.RemoveColumns(#"Split Column by Delimiter",{"ShiftStartDate.2"}),
    #"Duplicated Column" = Table.DuplicateColumn(#"Removed Columns3", "MachineName", "MachineName - Copy"),
    #"Duplicated Column1" = Table.DuplicateColumn(#"Duplicated Column", "OEELossLvl3Group", "OEELossLvl3Group - Copy"),
    #"Duplicated Column2" = Table.DuplicateColumn(#"Duplicated Column1", "OEELossLvl3SubGroup", "OEELossLvl3SubGroup - Copy"),
    #"Duplicated Column3" = Table.DuplicateColumn(#"Duplicated Column2", "OEELossLvl3Desc", "OEELossLvl3Desc - Copy"),
    #"Renamed Columns" = Table.RenameColumns(#"Duplicated Column3",{{"ShiftStartDate.1", "ShiftStartDate"}}),
    #"Changed Type4" = Table.TransformColumnTypes(#"Renamed Columns",{{"ShiftStartDate", type date}}),
    #"Duplicated Column4" = Table.DuplicateColumn(#"Changed Type4", "ShiftStartDate", "ShiftStartDate - Copy"),
    #"Changed Type3" = Table.TransformColumnTypes(#"Duplicated Column4",{{"ShiftStartDate - Copy", type text}}),
    #"Reordered Columns" = Table.ReorderColumns(#"Changed Type3",{"ShiftStartDate", "MachineName", "OEELossLvl3Group", "OEELossLvl3SubGroup", "OEELossLvl3Desc", "Time", "Loss Units", "ShiftStartDate - Copy", "MachineName - Copy", "OEELossLvl3Group - Copy", "OEELossLvl3SubGroup - Copy", "OEELossLvl3Desc - Copy"}),
    #"Merged Columns" = Table.CombineColumns(Table.TransformColumnTypes(#"Reordered Columns", {{"ShiftStartDate - Copy", type text}}, "en-GB"),{"ShiftStartDate - Copy", "MachineName - Copy", "OEELossLvl3Group - Copy", "OEELossLvl3SubGroup - Copy", "OEELossLvl3Desc - Copy"},Combiner.CombineTextByDelimiter(" ", QuoteStyle.None),"Volume Key"),
    #"Changed Type2" = Table.TransformColumnTypes(#"Merged Columns",{{"Volume Key", type text}}),
    #"Changed Type5" = Table.TransformColumnTypes(#"Changed Type2",{{"ShiftStartDate", type text}, {"Time", type text}}),
    #"Removed Columns4" = Table.RemoveColumns(#"Changed Type5",{"ShiftStartDate"}),
    #"Changed Type6" = Table.TransformColumnTypes(#"Removed Columns4",{{"Loss Units", Int64.Type}}),
    #"Filtered Rows1" = Table.SelectRows(#"Changed Type6", each ([MachineName] <> "")),
    #"Split Column by Delimiter1" = Table.SplitColumn(#"Filtered Rows1", "Time", Splitter.SplitTextByDelimiter(":", QuoteStyle.Csv), {"Time.1", "Time.2", "Time.3"}),
    #"Changed Type7" = Table.TransformColumnTypes(#"Split Column by Delimiter1",{{"Time.1", Int64.Type}, {"Time.2", Int64.Type}, {"Time.3", Int64.Type}}),
    #"Renamed Columns2" = Table.RenameColumns(#"Changed Type7",{{"Time.1", "Hour Time"}, {"Time.2", "Minute Time"}, {"Time.3", "Second Time"}}),
    #"Added Custom" = Table.AddColumn(#"Renamed Columns2", "Custom", each ([Hour Time]*60)+[Minute Time]+([Second Time]/60)),
    #"Renamed Columns3" = Table.RenameColumns(#"Added Custom",{{"Custom", "Time in Mins"}})
in
    #"Renamed Columns3"
```

Nottingham (`Volume Loss Correction N`) is the same in the last steps (`#"Renamed Columns3"` is also the last step), so the same two lines change. Its rename list also has `Planned Losses` and `Unplanned Losses` on the group.

## As-is: the steps of `Daily Line Losses H` that matter (unchanged in the fix)

These are the steps you pasted, only the ones that build the key and join. The full query stays as you have it.

```
    #"Duplicated Column18" = Table.DuplicateColumn(#"Merged Columns6", "OEELossLvl3SubGroup", "OEELossLvl3SubGroup - Copy"),
    #"Renamed Columns6" = Table.RenameColumns(#"Duplicated Column18",{{"OEELossLvl3SubGroup - Copy", "Breakdown Classification"}}),
    #"Replaced Value8" = Table.ReplaceValue(#"Renamed Columns6","Breakdown - Mechanical","Breakdown",Replacer.ReplaceText,{"OEELossLvl3SubGroup"}),
    #"Replaced Value9" = Table.ReplaceValue(#"Replaced Value8","Breakdown - Electrical","Breakdown",Replacer.ReplaceText,{"OEELossLvl3SubGroup"}),
    ...
    #"Removed Duplicates" = Table.Distinct(#"Merged Columns", {"Merged"}),
    ...
    #"Merged Columns2" = Table.CombineColumns(..., {"ShiftStartDate.1 - Copy", "MachineName - Copy", "OEELossLvl3Group - Copy", "OEELossLvl3SubGroup - Copy", "OEELossLvl3Desc - Copy"}, Combiner.CombineTextByDelimiter(" ", QuoteStyle.None), "Volume Key"),
    ...
    #"Merged Queries" = Table.NestedJoin(#"Changed Type6", {"Volume Key"}, #"Volume Loss Correction H", {"Volume Key"}, "Volume Loss Correction", JoinKind.LeftOuter),
    #"Expanded Volume Loss Correction" = Table.ExpandTableColumn(#"Merged Queries", "Volume Loss Correction", {"Loss Units", "Time in Mins"}, {"Loss Units", "Time in Mins"}),
```

Reading it: the `Breakdown` rename (the first two steps) keeps the original name in the column `Breakdown Classification`, which is shown as `Breakdown Types`. That is why the report still shows Electrical and Mechanical on the event rows: only the join key is flattened. `Table.Distinct` on `Merged` (machine + start time) runs BEFORE the join, so it can not remove the copies the join makes.

## Compare with the VFC (lake build)

| Power Query step | VFC code | Same? |
|---|---|---|
| Rename `Breakdown - Mechanical / Electrical` to `Breakdown` in the key | [b7-vol-lookup.js](../scripts/vfc/b7-vol-lookup.js) `BREAKDOWN`, `RULES.Hull.sub` (lines 5 to 18) | yes |
| Other renames of the correction file (`In Process Quality Control`, `Lack of resources`) | same file, `RULES.Hull.sub` | yes |
| Key = day (dd/MM/yyyy) + machine + group + sub group + description, joined with a space | same file, `var key = ...` (lines 62 to 67) | yes |
| Time in Mins = hours x 60 + minutes + seconds / 60 | same file, `minutes()` | yes |
| Loss Units whole number | same file, `Math.round(units)` | yes |
| Several correction rows with the same key | same file, `if (map[key] !== undefined) return;` (lines 70 to 72): **first row kept** | Power BI: both rows kept (join gives 2 rows). Fix A or B makes it one |
| Event: remove second row with same machine + start time | [b7-loss-rows.js](../scripts/vfc/b7-loss-rows.js) lines 204 to 209 | yes |
| Event Loss Units = correction units x event minutes / correction minutes | [b7-loss-rows.js](../scripts/vfc/b7-loss-rows.js) near line 225 | yes |
| `Breakdown Types` keeps the original sub group | [b7-loss-rows.js](../scripts/vfc/b7-loss-rows.js) line 280 | yes |

If you pick option A, the lake should follow so both sides stay identical for the rare different-rate keys: in `b7-vol-lookup.js` add `units` and `minutes` to the first entry instead of the `return`. That is the optional change 2 of [hull-loss-duplicates.md](hull-loss-duplicates.md), not applied. With option B nothing changes in the lake.
