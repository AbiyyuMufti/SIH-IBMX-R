# Lake API (Python reads parquet through the VFC)

## At a glance
| Item | Value |
|---|---|
| Goal | Python downloads a parquet file of the data lake through an `http in` endpoint of the VFC |
| Why | The Insights Hub data lake API did not work directly from Python |
| Status | SPIKE built (`flows/vfc-lake-api-spike.json`), not run yet |
| Direction | Read only. Write back is a later step |
| Auth | Platform key of the `http in` node (access: key). Generated in the VFC, never in the repo |
| Allowed paths | Any path in the lake, but only `.parquet`, no `..`, no leading `/` |
| Formats | `bytes` (default) or `base64` (JSON). Rows as JSON only if both fail |

## Spike flow
Tab `Lake API spike`, script `scripts/build-vfc-lake-spike.js`, function code `scripts/vfc/k*.js`.
- Lane 1: `http in` (GET `/parquet-data-lake-spike`) -> `1.1 Check request` -> `read object` -> `1.2 Shape answer` -> `http response`. Bad requests get 400.
- Lane 2: inject `{"path":"<folder>"}` -> `list objects` -> debug. Shows what the list node returns, for a later "does the file exist" check.
- A missing file makes the request hang (read object sends nothing). Expected in the spike.
- Header `x-parquet-magic: ok` tells that the answer starts with PAR1.

Test: `node scripts/test-vfc-lake-spike.js` (offline, checks the two functions only).

## Python
Use your own URL and key. How the key is sent depends on the VFC (to be confirmed).
```python
import io
import requests
import polars as pl

r = requests.get(
    URL,
    params={"path": "reports/fact_kpi/site=Hull/fact_kpi_2026-09-30.parquet"},
    headers=KEY_HEADER,
    timeout=60,
)
r.raise_for_status()
print(r.headers.get("x-parquet-magic"), len(r.content))
df = pl.read_parquet(io.BytesIO(r.content))
```
Base64 mode (`format=base64`):
```python
import base64
j = r.json()
df = pl.read_parquet(io.BytesIO(base64.b64decode(j["data"])))
```
pandas works the same: `pd.read_parquet(io.BytesIO(...))`.

## Open
- Does `http response` send a Buffer unchanged (bytes mode)? The VFC serialises messages between nodes.
- How is the key sent (header or query)?
- Output of `list objects` (for the existence check, so Python gets "file does not exist" at once).
