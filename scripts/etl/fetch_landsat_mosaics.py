#!/usr/bin/env python3
"""
Download summer Landsat Collection 2 mosaics for the Big Lost valley.

Microsoft Planetary Computer does not expose a bbox JPEG export for mosaics,
so this script registers a STAC mosaic per year, downloads WebMercator tiles
that cover the basin, and stitches them into public/data/landsat/{year}.jpg.

Coverage:
  1984–2011  Landsat 5 TM
  2013–2015  Landsat 8 OLI
  Skip Landsat 7 (SLC-off stripes) and 2012 (L5 ended, L8 not yet).

Only years that actually fill are written to index.json. The in-app Year
slider reads that list; missing years are not ticks.

Requires Pillow (PIL). Run from repo root:
  python3 scripts/etl/fetch_landsat_mosaics.py
  python3 scripts/etl/fetch_landsat_mosaics.py --years 1990,2000
"""

from __future__ import annotations

import argparse
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("This script needs Pillow. Install with:\n  python3 -m pip install pillow\n")
    sys.exit(1)

PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
PC_MOSAIC = "https://planetarycomputer.microsoft.com/api/data/v1/mosaic/register"
PC_TILES = "https://planetarycomputer.microsoft.com/api/data/v1/mosaic"

# Mackay–Howe valley envelope (same overlay bounds the map uses).
BBOX = [-113.85, 43.50, -113.10, 44.10]
BOUNDS = {"west": BBOX[0], "south": BBOX[1], "east": BBOX[2], "north": BBOX[3]}
CLOUD_COVER = 40
CLOUD_COVER_RELAXED = 70
TILE_ZOOM = 11
# Raw Collection 2 surface reflectance stretch that keeps the valley readable.
TILE_QUERY = [
    ("collection", "landsat-c2-l2"),
    ("assets", "red"),
    ("assets", "green"),
    ("assets", "blue"),
    ("rescale", "7000,18000"),
    ("color_formula", "Gamma RGB 1.7 Saturation 1.2"),
]
MIN_ITEMS = 1
# Skip a year if the stitched mosaic is mostly nodata black.
MIN_FILL_FRAC = 0.35
JPEG_QUALITY = 82
USER_AGENT = "Basin34-ETL (Landsat C2 summer mosaic)"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "public", "data", "landsat"))


def platform_for_year(year: int) -> str | None:
    if 1984 <= year <= 2011:
        return "landsat-5"
    if 2013 <= year <= 2015:
        return "landsat-8"
    return None


def sensor_for_platform(platform: str) -> str:
    return "OLI" if platform == "landsat-8" else "TM"


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile_nw(z: int, x: int, y: int) -> tuple[float, float]:
    n = 2**z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def basin_tile_range(z: int = TILE_ZOOM) -> tuple[int, int, int, int]:
    west, south, east, north = BBOX
    x0, y_north = lonlat_to_tile(west, north, z)
    x1, y_south = lonlat_to_tile(east, south, z)
    return min(x0, x1), max(x0, x1), min(y_north, y_south), max(y_north, y_south)


def overlay_bounds(z: int, x0: int, x1: int, y0: int, y1: int) -> dict:
    north, west = tile_nw(z, x0, y0)
    south, east = tile_nw(z, x1 + 1, y1 + 1)
    return {"south": south, "west": west, "north": north, "east": east}


def http_json(url: str, body: dict | None = None, timeout: int = 60) -> dict:
    data = None if body is None else json.dumps(body).encode()
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def http_bytes(url: str, timeout: int = 90, retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last  # type: ignore[misc]


def summer_search_body(year: int, platform: str, cloud: int) -> dict:
    return {
        "collections": ["landsat-c2-l2"],
        "bbox": BBOX,
        "datetime": f"{year}-06-01T00:00:00Z/{year}-09-30T23:59:59Z",
        "limit": 40,
        "filter-lang": "cql2-json",
        "filter": {
            "op": "and",
            "args": [
                {"op": "=", "args": [{"property": "platform"}, platform]},
                {"op": "<", "args": [{"property": "eo:cloud_cover"}, cloud]},
            ],
        },
        "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}],
    }


def stac_count(year: int, platform: str, cloud: int) -> int:
    body = summer_search_body(year, platform, cloud)
    body["limit"] = 1
    data = http_json(PC_STAC, body, timeout=45)
    # numberMatched is present on PC; fall back to returned features.
    n = data.get("numberMatched")
    if isinstance(n, int):
        return n
    return len(data.get("features") or [])


def register_mosaic(year: int, platform: str, cloud: int) -> str:
    body = summer_search_body(year, platform, cloud)
    data = http_json(PC_MOSAIC, body, timeout=60)
    sid = data.get("searchid") or data.get("id")
    if not sid:
        raise RuntimeError(f"mosaic register returned no searchid: {data}")
    return str(sid)


def fetch_tile(searchid: str, z: int, x: int, y: int) -> Image.Image | None:
    q = urllib.parse.urlencode(TILE_QUERY)
    url = f"{PC_TILES}/{searchid}/tiles/WebMercatorQuad/{z}/{x}/{y}.jpeg?{q}"
    data = http_bytes(url)
    if len(data) < 800 or not data.startswith(b"\xff\xd8"):
        return None
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return img


def stitch_tiles(searchid: str, z: int, x0: int, x1: int, y0: int, y1: int) -> Image.Image:
    cols = x1 - x0 + 1
    rows = y1 - y0 + 1
    canvas = Image.new("RGB", (cols * 256, rows * 256), (0, 0, 0))
    coords = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    filled = 0

    def one(xy: tuple[int, int]) -> tuple[int, int, Image.Image | None]:
        x, y = xy
        try:
            return x, y, fetch_tile(searchid, z, x, y)
        except Exception as exc:
            print(f"    tile {z}/{x}/{y} failed: {exc}")
            return x, y, None

    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(one, xy) for xy in coords]
        for fut in as_completed(futs):
            x, y, tile = fut.result()
            if tile is None:
                continue
            canvas.paste(tile, ((x - x0) * 256, (y - y0) * 256))
            filled += 1
    print(f"    tiles {filled}/{len(coords)}")
    return canvas


def fill_fraction(img: Image.Image) -> float:
    # Ignore the outer 12% (mountains / swath edge) and measure valley fill.
    w, h = img.size
    inset_x, inset_y = int(w * 0.12), int(h * 0.12)
    crop = img.crop((inset_x, inset_y, w - inset_x, h - inset_y))
    hist = crop.convert("L").histogram()
    dark = sum(hist[:18])
    total = crop.size[0] * crop.size[1]
    return 1.0 - (dark / total if total else 1.0)


def fetch_year(year: int, x0: int, x1: int, y0: int, y1: int) -> dict | None:
    platform = platform_for_year(year)
    if not platform:
        print(f"  skip {year}: no TM/OLI platform (L7 SLC-off / L5–L8 gap)")
        return None

    cloud = CLOUD_COVER
    n = stac_count(year, platform, cloud)
    if n < MIN_ITEMS:
        cloud = CLOUD_COVER_RELAXED
        n = stac_count(year, platform, cloud)
    print(f"  {year} {platform}: {n} summer scenes (cloud < {cloud})")
    if n < MIN_ITEMS:
        print(f"  skip {year}: no scenes")
        return None

    sid = register_mosaic(year, platform, cloud)
    mosaic = stitch_tiles(sid, TILE_ZOOM, x0, x1, y0, y1)
    fill = fill_fraction(mosaic)
    print(f"    fill {fill:.0%}")
    if fill < MIN_FILL_FRAC:
        print(f"  skip {year}: mosaic too empty")
        return None

    buf = io.BytesIO()
    mosaic.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    data = buf.getvalue()
    path = os.path.join(OUT_DIR, f"{year}.jpg")
    with open(path, "wb") as f:
        f.write(data)
    print(f"    wrote {path} ({len(data):,} bytes)")
    return {
        "file": f"{year}.jpg",
        "bytes": len(data),
        "platform": platform,
        "sensor": sensor_for_platform(platform),
        "resolutionM": 30,
        "scenes": n,
        "fill": round(fill, 3),
        "source": "Microsoft Planetary Computer Landsat Collection 2 Level-2 summer mosaic (June–September)",
    }


def parse_years(raw: str | None) -> list[int]:
    if not raw:
        return [y for y in range(1984, 2016) if platform_for_year(y)]
    out: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        out.append(int(part))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Landsat C2 summer mosaics for Basin 34")
    parser.add_argument("--years", help="Comma-separated years (default: 1984–2015, skipping 2012)")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    x0, x1, y0, y1 = basin_tile_range()
    bounds = overlay_bounds(TILE_ZOOM, x0, x1, y0, y1)
    print(f"Tile grid z{TILE_ZOOM} x {x0}-{x1} y {y0}-{y1} ({(x1 - x0 + 1) * (y1 - y0 + 1)} tiles/year)")

    years_meta: dict[str, dict] = {}
    index_path = os.path.join(OUT_DIR, "index.json")
    if os.path.exists(index_path):
        try:
            prev = json.loads(open(index_path).read())
            years_meta = dict(prev.get("years") or {})
        except Exception:
            years_meta = {}

    for i, year in enumerate(parse_years(args.years)):
        if i:
            time.sleep(0.3)
        print(f"Fetching {year}…")
        try:
            rec = fetch_year(year, x0, x1, y0, y1)
        except Exception as exc:
            print(f"  FAIL {year}: {exc}")
            continue
        if rec:
            years_meta[str(year)] = rec
        elif str(year) in years_meta:
            # Failed this run — drop a stale success so the slider stays honest.
            del years_meta[str(year)]
            stale = os.path.join(OUT_DIR, f"{year}.jpg")
            if os.path.exists(stale):
                os.remove(stale)

    index = {
        "bounds": bounds,
        "searchBbox": BOUNDS,
        "attribution": "Landsat Collection 2 via Microsoft Planetary Computer. USGS / NASA.",
        "zoom": TILE_ZOOM,
        "years": dict(sorted(years_meta.items(), key=lambda kv: int(kv[0]))),
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    print(f"Wrote {len(index['years'])} mosaics to {OUT_DIR}")


if __name__ == "__main__":
    main()
