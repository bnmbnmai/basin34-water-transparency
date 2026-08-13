#!/usr/bin/env python3
"""
Optional: download GLS-epoch basin JPEGs from Esri Landsat/MS.

The in-app Landsat slider does NOT depend on these files. Recent years use
EOX Sentinel-2 cloudless tiles; older years use transparent Esri tiles over
current satellite. GLS JPEGs still contain swath-edge nodata (black), so they
are a last-resort overlay if you drop them in public/data/landsat/ with an
index.json.

Run from repo root:
  python3 scripts/etl/fetch_landsat_mosaics.py
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

EXPORT = "https://landsat2.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer/exportImage"
# Mackay valley through Arco / Howe — same envelope the map uses for overlays.
BBOX = "-113.85,43.50,-113.10,44.10"
BOUNDS = {"south": 43.50, "west": -113.85, "north": 44.10, "east": -113.10}
SIZE = "1600,1050"
RENDER = '{"rasterFunction":"Natural Color with DRA"}'
MOSAIC = '{"mosaicMethod":"esriMosaicAttribute","sortField":"Best","sortValue":"0"}'

# GLS epoch years — seamless enough to store as JPEG. Landsat 8 scene
# strips (2013–2015) are mostly nodata; the app uses Sentinel-2 cloudless
# tiles from 2016 onward instead.
YEARS = [1990, 2000, 2005, 2010]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "public", "data", "landsat"))
MIN_BYTES = 50_000  # empty Esri PNG is ~3.8 KB; a real JPEG is hundreds of KB


def epoch_ms(y: int, m: int, d: int, end: bool = False) -> int:
    h, mi, s = (23, 59, 59) if end else (0, 0, 0)
    return int(datetime(y, m, d, h, mi, s, tzinfo=timezone.utc).timestamp() * 1000)


def time_window(year: int) -> str:
    # GLS composites are tagged near the epoch year, not a summer scene date.
    if year <= 2010:
        return f"{epoch_ms(year - 1, 1, 1)},{epoch_ms(year + 1, 12, 31, end=True)}"
    return f"{epoch_ms(year, 1, 1)},{epoch_ms(year, 12, 31, end=True)}"


def fetch_year(year: int) -> bytes | None:
    params = {
        "bbox": BBOX,
        "bboxSR": "4326",
        "imageSR": "4326",
        "size": SIZE,
        "format": "jpg",
        "pixelType": "U8",
        "interpolation": "RSP_BilinearInterpolation",
        "time": time_window(year),
        "renderingRule": RENDER,
        "mosaicRule": MOSAIC,
        "f": "image",
    }
    url = EXPORT + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Basin34-ETL (public Landsat mosaic)"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = resp.read()
        ctype = resp.headers.get("Content-Type", "")
    if len(data) < MIN_BYTES or not data.startswith(b"\xff\xd8"):
        print(f"  skip {year}: {len(data)} bytes ({ctype}) — empty or not JPEG")
        return None
    print(f"  {year}: {len(data):,} bytes JPEG")
    return data


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    years: dict[str, dict] = {}
    for i, year in enumerate(YEARS):
        if i:
            time.sleep(0.4)
        print(f"Fetching {year}…")
        try:
            data = fetch_year(year)
        except Exception as exc:
            print(f"  FAIL {year}: {exc}")
            continue
        if not data:
            continue
        path = os.path.join(OUT_DIR, f"{year}.jpg")
        with open(path, "wb") as f:
            f.write(data)
        years[str(year)] = {
            "file": f"{year}.jpg",
            "bytes": len(data),
            "source": "Esri Landsat/MS ImageServer (GLS), Natural Color with DRA",
        }

    index = {
        "bounds": BOUNDS,
        "attribution": "Landsat / GLS via Esri Living Atlas. Gaps are transparent.",
        "years": years,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    with open(os.path.join(OUT_DIR, "index.json"), "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    print(f"Wrote {len(years)} mosaics to {OUT_DIR}")


if __name__ == "__main__":
    main()
