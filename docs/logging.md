# Run log (CSV in the data lake)

| At a glance | |
|---|---|
| **What** | Every run line and every caught error is added to one CSV file per month and flow |
| **Where** | `<root>/logs/<flow>/log_YYYY-MM.csv` (flow = `hull`, `reference`; the site flow name is the site name in lower case) |
| **Always written** | Independent of `DRY_RUN`. The debug sidebar still shows the same lines (node `Run log`) |
| **Status** | Tested on the mock only (`node scripts/test-vfc-log.js`). Not yet run in the VFC |
| **Format** | Comma separated, every field in double quotes, a quote inside a field is doubled, line breaks become a space |

## Columns
`ts_utc, seq, flow, site, production_day, mode, level, source, message`

- `seq` counts lines per flow in the flow context, so the order inside one second is clear.
- `level`: `info`, `warn` (NOTHING TO WRITE), `failed` (FAILED ...), `error` (a node raised an error).
- `source`: `flow` for normal lines, the node name for caught errors.

## Separator
Every field is quoted, so a comma, a quote or a `|` in the text cannot break a row. Line breaks are replaced by a space. To use another separator change the constant `SEPARATOR` in `scripts/vfc/l4-append-log.js` (quoting stays). Excel and Tableau read quoted CSV.

## Lanes (end of every tab)
| Lane | Nodes |
|---|---|
| ERRORS | `catch` (all nodes of the tab) -> `Describe error` -> `to LOG`. Errors of the log nodes are not logged again |
| LOG | `to LOG` in -> `Format log line` (also feeds the debug node) -> join (30 s) -> delay (one batch per 10 s) -> `Build log write` -> `Read log file` -> `to APPEND` |
| LOG WRITE | `to APPEND` in -> `Append log rows` -> `Log to data lake` (write object) |

The data lake has no append: the whole file is read, the new rows are added, and the file is written back. The delay keeps two batches from overlapping. If two flows write the same file at the same time a row can be lost; the flows have their own folders, so this only happens inside one flow.

If the old file cannot be read for a reason that does not look like "not found", a new file `log_YYYY-MM_<timestamp>.csv` is written, so the old history is never replaced.

## API error text
`3.x` and `4.x` checks add the API message to a failed call, for example `HTTP 413: Too many status changes (12345)`.

## To confirm in the VFC
1. Missing file: what error does `read object` raise? The regex `NOT_FOUND` in `l4-append-log.js` is a guess (`not found`, `no such`, `does not exist`, `404`).
2. Does `catch` receive errors of `http request` nodes?
3. Does `write object` write a string payload as text?
4. Does the join in custom mode send after the 30 s timeout?
