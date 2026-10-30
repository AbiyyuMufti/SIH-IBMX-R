# Provideam to lake: one-report VFC proof

| At a glance | |
|---|---|
| **Goal** | Prove the VFC can call the Provideam API directly and store the response in the Integrated Data Lake, so SharePoint does not have to be watched later |
| **Scope** | One saved report body, one day, stored as-is (raw JSON text). No schedule, no conversion to CSV or parquet |
| **Provideam call** | `POST https://rb-api.provideam.com/api/v1/Report/ObjectByPeriod`, header `apiKey`, `Content-Type: application/json-patch+json`, period `pdDay` = `[<day>T00:00:00]` |
| **Lake path** | `mufti_test/provideam/<REPORT_NAME>_<day>.json` (rerun overwrites) |
| **Flow** | `flows/vfc-provideam-lake-proof.json` |
| **Build** | `node scripts/build-vfc-provideam-proof.js` |
| **Offline check** | `node scripts/validate-flow.js flows/vfc-provideam-lake-proof.json` and `node scripts/test-vfc-provideam-proof.js` |

## Settings

1. Run the Config tab with `platform` = `xcelerator` (lake credentials and
   tenant come from there).
2. In `1.1 Load proof settings` fill in:
   - `PROVIDEAM_API_KEY`
   - `REPORT_BODY_JSON`: the JSON body of one saved report from
     `docs/provideam-samples/<nn>-*.md`, pasted as one line. Start with
     report 23 (New Plan OPT, one day, about 30 rows). The period in the body is
     replaced by `DAY`.
   - `REPORT_NAME`: used in the file name.
   - `DAY`: `YYYY-MM-DD`, empty = yesterday (UTC date).
3. Do not commit or share a filled-in export: the key is in the function code.

## Run

Import the flow, click `Run Provideam proof`. Success in the debug sidebar:

`UPLOADED <name>_<day>.json (<rows> rows, <bytes> bytes) to mufti_test/provideam/<name>_<day>.json`

Failures show `FAILED <stage>: <reason>` (no key, token or signed URL).

## What this proves and what it does not

- Proves: the VFC `http request` node can reach `rb-api.provideam.com` with the
  API key, and the response can be written to the lake unchanged.
- Not proven offline: whether the VFC allows outbound calls to this host. Only
  the run in the VFC shows it.
- Gotchas:
  - A body with more than 18 `functions` returns HTTP 500 (reports 15-22).
    Split it into two calls; the proof does not do that.
  - Monthly bodies (`pdMonth`) are turned into one day by this proof.
  - Large reports (Nottingham monthly run rates: 19,906 rows) have not been
    tried in the VFC; keep the 2 MB context limit and the about-50 s per
    message limit in mind for the real flow.
