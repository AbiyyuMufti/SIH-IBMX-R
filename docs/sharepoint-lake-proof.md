# SharePoint to lake: one-file VFC proof

| At a glance | |
|---|---|
| **Goal** | Prove that one small SharePoint file can be downloaded into memory and uploaded to the Integrated Data Lake |
| **Scope** | One configured direct child file; no schedule, recursion, paging, or Graph token renewal |
| **Lake API** | `generateUploadObjectUrls` (Bearer token), then PUT the bytes to the signed URL without a Bearer token |
| **Flow** | `flows/vfc-sharepoint-lake-proof.json` |
| **Build** | `node scripts/build-vfc-sharepoint-proof.js` |
| **Offline check** | `node scripts/validate-flow.js flows/vfc-sharepoint-lake-proof.json` and `node scripts/test-vfc-sharepoint-proof.js` |

## Settings

1. Run the existing Config tab with `platform` set to `xcelerator`, then click
   Apply. The proof uses its Insights Hub client credentials and tenant ID.
2. In `1.1 Load proof settings`, fill in:
   - `GRAPH_DRIVE_ID`
   - `GRAPH_FOLDER` (the folder path inside the drive)
   - `GRAPH_FILE_NAME` (an existing small file directly in that folder)
   - `GRAPH_TOKEN` (a current Graph token)
3. Set `LAKE_FOLDER` to the lake destination folder. The output path keeps the
   SharePoint file name, for example `sharepoint-proof/small.txt`.

The proof uses the pasted Graph token only for this single manual run. Replace
it in the Settings function when it expires. The proof obtains a fresh
Insights Hub token from the existing Config settings each time.

The Settings function contains placeholders so no real secret is committed.
Any real Graph token entered into the function is part of the flow JSON when
that flow is exported; do not share or commit a filled-in export.

## Run the proof

1. Use an existing, read-accessible SharePoint file no larger than 5 MiB.
   The flow does not create, change, or delete anything in SharePoint.
2. Import `flows/vfc-sharepoint-lake-proof.json` and click its `Run one-file
   proof` inject button.
3. On success, the debug sidebar shows:

   `UPLOADED <file> (<bytes> bytes) to <lake-folder>/<file>`

   If Graph's folder response has another page, the message adds
   `[first page only]`; this proof selects only the configured file from the
   first page.
4. Confirm the object is present in the lake at that exact path and that its
   size matches the SharePoint listing. A rerun overwrites the same lake key.

Failures appear as `FAILED <stage> <file>: <reason>`. Tokens and signed URLs
are removed before debug output.

The offline test checks request construction and that the downloaded Buffer is
put in the signed-URL request body. Only a run in the VFC can prove the runtime
HTTP nodes preserve the binary payload end-to-end.
