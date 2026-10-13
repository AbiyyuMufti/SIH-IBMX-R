from io import BytesIO

import polars as pl
import requests



def request_parquet(
    path: str,
    api_key: str,
    *,
    url: str = "https://reckitt-visualflowcreatorhttp.eu1.mindsphere.io/public/reckitt/parquet-data-lake",
    timeout: int = 60,
) -> pl.DataFrame:
    """Fetch a parquet file or concatenate all parquet files in a directory.

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
