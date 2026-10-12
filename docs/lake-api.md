# Lake API (Python reads parquet through the VFC)

## At a glance
| Item | Value |
|---|---|
| Goal | Python downloads a parquet file of the data lake through an `http in` endpoint of the VFC |
| Why | The Insights Hub data lake API did not work directly from Python |
| Status | Spike worked in the VFC (bytes open in polars, key = query parameter). Final flow `flows/vfc-lake-api.json` built, offline tested, not run in the VFC yet |
| Direction | Read only. Write back is a later step |
| Auth | Platform key of the `http in` node (access: key), sent as the query parameter `key`. Generated in the VFC, never in the repo |
| URL | `https://<vfc-host>/public/<tenant>/parquet-data-lake-spike?key=<key>&path=<file>.parquet` (copy the real one from the node) |
| Allowed paths | Any path in the lake, but only `.parquet`, no `..`, no leading `/` |
| Answers | File: raw bytes. Folder list: JSON. Errors: JSON `{error}` with status 400, 404 or 502 |

## Spike flow
Tab `Lake API spike`, script `scripts/build-vfc-lake-spike.js`, function code `scripts/vfc/k*.js`.
- Lane 1: `http in` (GET `/parquet-data-lake-spike`) -> `1.1 Check request` -> `read object` -> `1.2 Shape answer` -> `http response`. Bad requests get 400.
- Lane 2: inject `{"path":"<folder>"}` -> `list objects` -> debug. Shows what the list node returns, for a later "does the file exist" check.
- A missing file makes the request hang (read object sends nothing). Expected in the spike.
- Header `x-parquet-magic: ok` tells that the answer starts with PAR1.

Test: `node scripts/test-vfc-lake-spike.js` (offline, checks the two functions only).

## Python
Use your own URL, and keep the key in an environment variable (`LAKE_KEY`).
```python
import io
import requests
import polars as pl

r = requests.get(
    URL,
    params={
        "key": KEY,
        "path": "reports/fact_kpi/site=Hull/fact_kpi_2026-09-30.parquet",
    },
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
- Output of `list objects` (for the existence check, so Python gets "file does not exist" at once).

## Final flow (`flows/vfc-lake-api.json`)
Generator `scripts/build-vfc-lake-api.js`, function code `scripts/vfc/k4` to `k7`, test `node scripts/test-vfc-lake-api.js`.
Endpoint `/parquet-data-lake` (disable any old http in node with the same endpoint first). Needs the Config tab (root for the log).

| Request | Answer |
|---|---|
| `?path=<file>.parquet` | 200 with the file as bytes. Header `x-parquet-magic: ok` |
| `?path=` file that does not exist | 404 `{"error":"file not found","listed_in_folder":N}` at once |
| `?list=<folder>/` | 200 JSON `{folder, count, objects:[{key, last_modified, size}]}` |
| bad path (not .parquet, `..`, leading `/`, folder without `/`, both parameters) | 400 `{"error": ...}` |
| lake returns something that is not parquet | 502 |

How it works: `list objects` lists the folder of the file, `5` checks that the exact key is in the list, then `read object`. The file check relies on the list not being capped (33 Hull files listed completely). Test a folder with many files before relying on it.

Log: one line per request (path or folder, status, size; never the key) in `<root>/logs/lake-api/log_YYYY-MM.csv`.

Python, list then read:
```python
objs = requests.get(URL, params={"key": KEY, "list": "reports/fact_kpi/site=Hull/"}, timeout=60).json()["objects"]
days = [o["key"] for o in objs]
df = pl.concat([pl.read_parquet(io.BytesIO(requests.get(URL, params={"key": KEY, "path": k}, timeout=60).content)) for k in days])
```

## list objects result (from the user's tenant)
`payload` = array of `{key, lastModified, contentSize, storageClass}`. A folder entry has only `key` and ends with `/`. The node uses `msg.path` as the folder.

## Open
- Does the link out / link in pair keep the HTTP response link of the request (msg.res)? The answer lane uses link nodes. If not, tell me and I wire it directly.
- List size cap of `list objects` for big folders.
