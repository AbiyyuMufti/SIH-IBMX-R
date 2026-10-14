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
- Replacing an existing object by uploading the same path again (the upload script refuses unless `--overwrite`, so the flows' "same name replaces the day" is not confirmed through this route).
- Deleting objects (`DELETE /objects`, `/deleteObjectsJobs`), more than one path per upload request, objects in COLD storage (the API refuses them with `objectNotAccessible`), subtenants, the `legacy` platform.
- Which of the three roles is the minimum. All three were in the token.
- Whether a header is needed for storage other than AWS (the sample pages name `x-ms-blob-type: BlockBlob` for Azure only; the script retries once with it if an Azure host refuses).
- A test object `mufti_test/fact_loss/_upload_test_2026-10-14.txt` was left in the data lake. Delete it in the Data Explorer.
