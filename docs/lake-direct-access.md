# Direct access to the Integrated Data Lake (Power BI without Athena cost)

| At a glance | |
|---|---|
| **Goal** | Let Power BI read the SIH Integrated Data Lake (IDL) as cheaply as possible. Anything that costs money needs Reckitt's consent |
| **Status** | Research only (2026-11-03), from the Siemens documentation pages below. Nothing tested against the `reckitt` tenant |
| **Today** | Signed URLs work and are free: [datalake-files.md](datalake-files.md) |
| **Candidate to test** | Cross Account Access (IDL admin enables Read on one prefix for an AWS account), then AWS CLI, DuckDB, Power BI Python script. No Athena |
| **Dropped** | Athena (pay per TB scanned, no free tier), Azure Service Principal (Azure only) |

## What the Siemens pages say
Pages under `https://documentation.mindsphere.io/MindSphere/apps/integrated-data-lake/`.

| Page | Content |
|---|---|
| `enabling-cross-account-access.html` | In the IDL UI, Cross Account: name, 12-digit AWS account number, optional subtenant, description |
| `managing-cross-account-accesses.html` | Per account, "Add Accesses": prefix paths, permission Read / Write / Delete, description, status toggle. **Limits: 5 prefixes across all cross accounts, 10 disabled accesses** |
| `integrate-AWS-Athena-tool.html` | Athena table "from S3 bucket data", location `s3://<storage account>/<storage path>/`. Only CSV is shown, no word on Parquet, roles or regions |
| `creating-service-principal.html` | Azure only ("Virtual Private Cloud"), max 5 principals, Read / Write |
| `configure-azure-power-BI-tool.html` | Power BI Python script against `<account>.dfs.core.windows.net` with a service principal, CSV. Azure only, does not fit our lake |

Our lake is on AWS S3 (`eu-central-1`), see [datalake-files.md](datalake-files.md). The Azure pages do not apply.
None of the pages mention Power BI on AWS, IAM roles, regions or how the AWS account assumes the access (role, bucket policy or access point).

## Cost (from memory, not checked on the AWS site)
- AWS account: free to create, needs a payment card. An account with no resources costs 0.
- Athena: about 5 USD per TB scanned, no free tier. Small data is cents, but it is a bill, so it needs Reckitt's consent.
- Free readers once the access exists: AWS CLI, `boto3`, DuckDB (reads Parquet from S3), Power BI Python script connector with `boto3` and `pandas`.
- Power BI service refresh with a Python script needs a gateway with Python. Power BI Desktop does not.
- Who pays for the S3 reads: the bucket owner (Siemens), unless Requester Pays is set. Not confirmed for IDL.

## Test plan (not started)
1. AWS account: Reckitt's, or a free one with their agreement (their data is read from it).
2. An IDL admin on the `reckitt` tenant enables ONE prefix with Read only. Needs a person with IDL admin rights, unknown if the user has them.
3. `aws s3 ls`, then DuckDB on one Parquet file, then the Power BI Python script.
4. Record what works: Parquet or only CSV, role needed, region, real cost.

Open: the cross account API sample page (`api-integrated-data-lake-samples-working-with-cross-account-accesses.html`) returned a 404 when fetched. A POST to create the access needs approval first (project rule).
Not read yet: "Integrated Data Lake Direct Connection" under Insights Hub Business Intelligence (named in the navigation, no link found).
