# Run log (CSV in the data lake)

| At a glance | |
|---|---|
| **What** | Every run line and every caught error is added to one CSV file per month and flow |
| **Where** | `<root>/logs/<flow>/log_YYYY-MM.csv` (flow = `hull`, `reference`; the site flow name is the site name in lower case) |
| **Always written** | Independent of `DRY_RUN`. The debug sidebar still shows the same lines (node `Run log`) |
| **Status** | Mock tests pass (`node scripts/test-vfc-log.js`). First VFC run (2026-10-04): the read of a missing file only warned (404), see below. Fix built, to be re-checked in the VFC |
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
| ERRORS | `catch` (errors that nodes raise with `node.error`) -> `Describe error` -> `to LOG`. Errors of the log nodes are not logged again |
| LOG | `to LOG` in -> `Format log line` (also feeds the debug node) -> join (30 s) -> delay (one batch per 10 s) -> `Build log write` -> `Read log file` -> `to APPEND`. `Build log write` also feeds `Wait for read 10 s` -> `to APPEND` |
| LOG WRITE | `to APPEND` in -> `Append log rows` -> `Log to data lake` (write object) |

The data lake has no append: the whole file is read, the new rows are added, and the file is written back. The delay keeps two batches from overlapping. If two flows write the same file at the same time a row can be lost; the flows have their own folders, so this only happens inside one flow.

## Missing file (found in the VFC, 2026-10-04)
`read object` on a file that does not exist does not send an error to `catch` and sends no message. It only prints a yellow warning in the debug sidebar ("Request failed with status code 404"). So the read cannot be used to branch. Design now:
- Every batch goes two ways: through `Read log file` and through `Wait for read 10 s`. Both end in `Append log rows`.
- `Build log write` gives each batch an id and removes the payload. If the read answers, the payload is the old file. If not, there is no payload.
- `Append log rows` writes a batch once (it remembers the last 50 batch ids in flow context). The first copy that arrives wins, normally the read answer.
- No payload (read gave no answer): the file is assumed missing and a new file with a header is written.
- Safeguards so history is not replaced: a flow remembers (flow context) the monthly files it has read or written. If the read gives no answer for such a file, or the answer is not text, the rows go to a new file `log_YYYY-MM_<timestamp>.csv` with a line that says why. After a redeploy the memory is empty; if the read fails for another reason right then, the monthly file could be replaced. Accepted for a log.
- The yellow warning stays in the debug sidebar on the first batch of every month. That is expected.

## API error text
`3.x` and `4.x` checks add the API message to a failed call, for example `HTTP 413: Too many status changes (12345)`.

## To confirm in the VFC
1. Does `read object` in mode Object return a CSV file as text or as a buffer? `Append log rows` accepts both. Any other type goes to a time-stamped file.
2. Does `write object` write a string payload as text (not as JSON with quotes)?
3. Does the join in custom mode send after the 30 s timeout, and the delay node in delay mode after 10 s?
