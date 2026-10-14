import os
import re
from io import BytesIO

import polars as pl
import requests

# Direct access to the Insights Hub data lake (xcelerator). No VFC flow.
# Two steps for a file: ask the data lake for a signed URL (POST, answer 201),
# then GET that URL without a token. Details: docs/datalake-files.md.
# Settings come from environment variables, not from this file:
#   XC_TENANT_ID                      tenant of the token address
#   RECKITT_API_TECHUSER_CLIENT_ID    technical user (needs the dl.* roles)
#   RECKITT_API_TECHUSER_CLIENT_SECRET
GATEWAY = "https://api.eu1.siemens.app"
DATALAKE_PATH = "/datalake-1000001700/v3"
# Keys in a list start with this prefix. Download paths must not have it.
KEY_PREFIX = re.compile(r"^data/ten=[^/]+/")


def get_token(
    client_id: str | None = None,
    client_secret: str | None = None,
    tenant_id: str | None = None,
    *,
    timeout: int = 60,
) -> str:
    """Return a client-credentials token (valid about 30 minutes).

    Without arguments it reads the three environment variables above.
    Never print the token.
    """
    client_id = client_id or os.environ["RECKITT_API_TECHUSER_CLIENT_ID"]
    client_secret = client_secret or os.environ["RECKITT_API_TECHUSER_CLIENT_SECRET"]
    tenant_id = tenant_id or os.environ["XC_TENANT_ID"]
    response = requests.post(
        f"https://{tenant_id}.eu1.sws.siemens.com/oauth/token",
        auth=(client_id, client_secret),
        data={"grant_type": "client_credentials"},
        headers={"Accept": "application/json"},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def list_keys(
    path: str,
    token: str,
    *,
    base_url: str = GATEWAY + DATALAKE_PATH,
    timeout: int = 60,
) -> list[str]:
    """List the files directly inside a folder. The path must end with ``/``."""
    keys: list[str] = []
    next_token = None

    while True:
        params = {"path": path}
        if next_token:
            params["nextToken"] = next_token
        response = requests.get(
            f"{base_url}/listObjects",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )
        response.raise_for_status()
        body = response.json()
        keys.extend(item["key"] for item in body["objects"]["files"])
        if not body.get("isTruncated"):
            return keys
        next_token = body["nextToken"]


def download_bytes(
    path: str,
    token: str,
    *,
    base_url: str = GATEWAY + DATALAKE_PATH,
    timeout: int = 60,
) -> bytes:
    """Download one file. The path may be a key from ``list_keys``."""
    path = KEY_PREFIX.sub("", path)
    response = requests.post(
        f"{base_url}/generateDownloadObjectUrls",
        json={"paths": [{"path": path}]},
        headers={"Authorization": f"Bearer {token}"},
        timeout=timeout,
    )
    response.raise_for_status()
    signed_url = response.json()["objectUrls"][0]["signedUrl"]
    # The signed URL carries its own signature: no token, and do not print it.
    file_response = requests.get(signed_url, timeout=timeout)
    file_response.raise_for_status()
    return file_response.content


def request_parquet(
    path: str,
    token: str,
    *,
    base_url: str = GATEWAY + DATALAKE_PATH,
    timeout: int = 60,
) -> pl.DataFrame:
    """Read a parquet file, or all parquet files directly inside a folder.

    Directory paths must end with ``/``. Only the files directly in that
    folder are read, not the subfolders. The token is passed per call
    (see ``get_token``).
    """
    if not path.endswith("/"):
        return pl.read_parquet(
            BytesIO(download_bytes(path, token, base_url=base_url, timeout=timeout))
        )

    frames = []
    for key in list_keys(path, token, base_url=base_url, timeout=timeout):
        if not key.endswith(".parquet"):
            continue
        data = download_bytes(key, token, base_url=base_url, timeout=timeout)
        frames.append(pl.read_parquet(BytesIO(data)))

    if not frames:
        raise FileNotFoundError(f"No parquet files found in directory {path!r}")

    return pl.concat(frames, how="vertical_relaxed")


def request_parquet_vfc(
    path: str,
    api_key: str,
    *,
    url: str = "https://reckitt-visualflowcreatorhttp.eu1.mindsphere.io/public/reckitt/parquet-data-lake",
    timeout: int = 60,
) -> pl.DataFrame:
    """Fetch a parquet file or concatenate all parquet files in a directory.

    This is the old version: it calls the ``http in`` endpoint of the VFC
    flow (``flows/vfc-lake-api.json``), not the data lake.
    Directory paths must end with ``/``. The API key is passed per call rather
    than stored in this module.
    """
    if path.endswith("/"):
        response = requests.get(
            url,
            params={"key": api_key, "list": path},
            timeout=timeout,
        )
        response.raise_for_status()
        objects = response.json()["objects"]
        frames = []

        for item in objects:
            file_response = requests.get(
                url,
                params={"key": api_key, "path": item["key"]},
                timeout=timeout,
            )
            file_response.raise_for_status()
            frames.append(pl.read_parquet(BytesIO(file_response.content)))

        if not frames:
            raise FileNotFoundError(f"No parquet files found in directory {path!r}")

        return pl.concat(frames, how="vertical_relaxed")

    response = requests.get(
        url,
        params={"key": api_key, "path": path},
        timeout=timeout,
    )
    response.raise_for_status()
    return pl.read_parquet(BytesIO(response.content))
