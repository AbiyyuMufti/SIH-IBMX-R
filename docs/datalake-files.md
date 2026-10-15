# Data lake files: list, download and upload from a script

| At a glance | |
|---|---|
| **Use it to** | List, download and upload data lake files (for example the parquet files of the flows) from your own computer with the technical user, without the VFC |
| **How** | Two steps. 1: ask the data lake for a **signed URL** (POST, answer 201). 2: GET (download) or PUT (upload) that URL **without a token** |
| **Base address** | xcelerator: `https://api.eu1.siemens.app/datalake-<tenant id>/v3` (no `/api` part). legacy: `https://gateway.eu1.mindsphere.io/api/datalake/v3` (untested since the role change) |
| **Scopes** | List `dl.lst.r`, download `dl.ds.r`, upload `dl.ds.w`, delete `dl.ds.d`. The technical user got them through the data lake roles (`dl.dsRead`, `dl.dsUser`, `dl.dsAdmin` appear in its token) |
| **Python** | `parquet/request_data.py`: see the section Python helper for notebooks |
| **Status** | Tested on the xcelerator tenant on 2026-10-14: list, download and upload all work. Scripts: `scripts/datalake-download.js`, `scripts/datalake-upload.js`, helpers in `scripts/lib-datalake.js`. Offline test: `node scripts/test-datalake-mock.js` |
| **Source** | The data lake OpenAPI file (version 3.14.0, `integrated-data-lake-v3-14-0-eu1-xcelerator.yaml`, from the Siemens developer page) plus the real calls below |

## The calls
| Call | Scope | Body or query | Answer |
|---|---|---|---|
| `GET /listObjects?path=<folder/>` | `dl.lst.r` | `path` (a path ending in `/` is a folder), `maxSize` (up to 1000), `nextToken`, `subtenantId` | 200 `{ storageAccount, storagePath, isTruncated, objects: { files[], folders[] } }`. A file has `key`, `lastModified`, `contentSize`, `storageClass`. Only the direct children of the folder |
| `POST /generateDownloadObjectUrls` | `dl.ds.r` | `{ "paths": [ { "path": "<path>" } ] }`, **exactly 1 path** | **201** `{ objectUrls: [ { path, signedUrl } ] }`. Missing object: **404** `mdsp.core.datalake.ObjectNotFoundError` |
| `GET <signedUrl>` | none | no header needed on AWS storage | The file |
| `POST /generateUploadObjectUrls` | `dl.ds.w` | same body, up to 30 paths | **201** same answer shape |
| `PUT <signedUrl>` | none | the file as body, no extra header needed on AWS storage | 200 |

- The signed URL is valid for 120 minutes and contains a signature: do not print or share it.
- Both generate calls are POSTs but only create a URL. The upload PUT writes a file.
- Maximum path length 1024 characters, allowed characters `a-z A-Z 0-9 . ! * ' ( ) _ - / =` and single spaces.

## Path form (tested)
- **Use the path without `data/ten=<tenant>/`**, for example `mufti_test/fact_loss/fact_loss_2026-10-12.parquet`.
- The list shows the full key with that prefix (`data/ten=reckitt/mufti_test/...`). Giving the prefixed path to the download call returns **404**. The scripts remove the prefix themselves when you pass a key from the list to `get`.

## Tested on 2026-10-14 (xcelerator, `reckitt`)
| Test | Result |
|---|---|
| List `mufti_test/fact_loss/` | 200, 3 files, `isTruncated` false, keys with the `data/ten=reckitt/` prefix |
| Download URL, path without prefix | 201, storage on AWS S3 (`eu-central-1`) |
| Download URL, path with prefix | 404 `ObjectNotFoundError` |
| Download of `fact_loss_2026-10-12.parquet` | 49977 bytes, same as the size in the list, starts and ends with `PAR1` (valid parquet) |
| Download of 5 days where 2 do not exist | 3 saved, the 2 missing days answered 404 |
| Upload of a 58-byte text file | URL 201, PUT 200 with **no extra header**, then listed with 58 bytes, then downloaded again: identical |

## New folders (tested 2026-10-15)
- No bucket or folder can be created by a call: one bucket per tenant, no "create folder" endpoint in the OpenAPI file. Folders are key prefixes.
- Uploading `mufti_test/_mkdir_test/probe.txt` (12 bytes, folder did not exist) gave URL 201, PUT 200, listed, downloaded identical. So a new folder exists as soon as a file is uploaded into it. An empty folder cannot exist.
- The whole `mufti_test/` folder was deleted afterwards (19 files, see Delete below).

## Upload and delete of a folder tree (2026-10-15)
- `node scripts/datalake-upload-tree.js [local dir] [lake root]` uploads every file under the local folder to the same relative path under the lake root. Defaults: `sharepoint/reference` to `eu_report/reference`. Existing objects are skipped, never replaced.
- First run (old layout): 51 SharePoint files to `reports/static-reference/`, 51 uploaded, 0 failed. Then deleted again on the user's request with `node scripts/datalake-delete-tree.js reports/static-reference/` (51 deleted, 0 left), to redo it in the new layout.
- `scripts/datalake-delete-tree.js <folder/>` walks the folder (list, subfolders, `nextToken`) and deletes each file with `DELETE /objects/<path>`, then lists again. Also used for `mufti_test/` (19 files, 0 left).
- Layout uploaded 2026-10-15: `eu_report/reference` (14 reference files, from `sharepoint/reference`) and `eu_report/pbi_report/source/<type>/site=<Site>/<type>_<YYYY-MM>.csv` (the normalized month files, from `sharepoint/source`, see [sharepoint-files.md](sharepoint-files.md)). `eu_report/ih_report` is not used yet. The old `reports/` folder stays.
- Options of `scripts/datalake-upload-tree.js`: `--overwrite` (replace existing objects) and `--only <list file>` (only the relative paths in the file, for example `sharepoint/normalize-changed.txt`). Without `--overwrite` existing objects are skipped.
- `node scripts/datalake-verify-tree.js <local dir> <lake root> [sample]` compares a local tree with the lake (every file present with the same size) and downloads a random sample to compare the bytes. Read-only.
- **Replace by upload, tested 2026-10-15:** a probe file `eu_report/_probe/replace.txt` was uploaded (new path, 10 bytes), again without a flag (skipped), again with `--overwrite` (same content, replaced), and with changed content (31 bytes, replaced). The lake then returned the new content, byte for byte. So the same path can be replaced by uploading it again; the probe was deleted afterwards (204).

## What did not work before, and why
- **403 `accessDenied` on every data lake call (2026-10-05)**: the token had no `dl.*` scope (only `mdl.mdladmin`). After the data lake roles were added the same calls worked.
- **502 with the old path** `/api/datalake/v3` on the xcelerator host: the data lake has its own base path (see above).

## Python helper for notebooks (`parquet/request_data.py`, 2026-10-14)
- `get_token()` reads `XC_TENANT_ID`, `RECKITT_API_TECHUSER_CLIENT_ID` and `RECKITT_API_TECHUSER_CLIENT_SECRET` from the environment (the same names as the JS scripts). The token lasts about 30 minutes.
- `request_parquet(path, token)` reads one parquet file, or all `.parquet` files directly inside a folder (path ends with `/`). It lists the folder (`listObjects`, with `nextToken`), asks a signed URL for each file and downloads it. Keys from the list lose the `data/ten=<tenant>/` prefix. Subfolders are not read. Uses the xcelerator base path only.
- `request_parquet_vfc(path, api_key, url=...)` is the old function: it calls the `http in` endpoint of the VFC flow in [lake-api.md](lake-api.md).
- `parquet/extractdata.ipynb` uses the direct version (`token = get_token()`, then `request_parquet("reports/pbi_calendar/", token)`). Status: calendar read worked in the notebook. The other tables follow the same call, not yet checked.
- Not run by me: the file needs the secrets and the network. Syntax checked only.

## Not tested
- Replacing an existing object by uploading the same path: tested, works (see above).
- Delete tested 2026-10-15: `DELETE <base>/objects/<path>` (scope `dl.ds.d`, path without the `data/ten=` prefix) answered **204** and the object was gone from the list (`scripts/datalake-delete.js`, one file per call). Used on `mufti_test/_mkdir_test/probe.txt`, then for whole folders (see above).
- Not tested: `/deleteObjectsJobs` (bulk delete), more than one path per upload request, objects in COLD storage (the API refuses them with `objectNotAccessible`), subtenants, the `legacy` platform.
- Which of the three roles is the minimum. All three were in the token.
- Whether a header is needed for storage other than AWS (the sample pages name `x-ms-blob-type: BlockBlob` for Azure only; the script retries once with it if an Azure host refuses).
- The test objects of 2026-10-14 and 2026-10-15 are gone: `mufti_test/` was deleted on 2026-10-15.

## Object events (subscribe object node, tested by the user 2026-10-15)
- The VFC node `subscribe object` watches a lake folder and sends one message per event: `payload = { eventType, timestamp, path, tenant }`, `msg.path` the same path with a leading slash (for example `/mufti_test/test/sales_part_2.csv`).
- Event types seen: `MODIFY` for a new file, an overwritten file and a new folder (the folder path has no file extension), `DELETE` for a deleted file. Files in subfolders of the watched folder also fire. Several files at once arrive as separate messages one after another.
- A signed-URL upload from `scripts/datalake-upload-tree.js` fires the same `MODIFY` event (tested with `mufti_test/test/script_probe.txt`). Delay from the event timestamp to the node: about 0.3 to 15 seconds in 5 samples, so the order of events is not guaranteed.
- Not tested: 200 or more events from a bulk upload; a script replace with `--overwrite` (the UI replace gave `MODIFY`).
- Use: one subscription on `/eu_report/pbi_report/source/` and one on `/eu_report/reference/`; the flow takes type, site and month from the path, ignores paths that do not end in `.csv` and `DELETE`, and writes only below `eu_report/pbi_report/report/` (outside the watched folders, so no loop).
