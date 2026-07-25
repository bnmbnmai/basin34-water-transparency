#!/usr/bin/env python3
"""Simplify heavy GeoJSON geometries in public/data/ (stdlib only).

Reduces SVG/DOM cost for POU + NWI (+ canals) without changing feature counts.
Tolerance ~0.0001° (~11 m) for POU/canals; slightly looser for NWI.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"

# Drop bulky / unused props to shrink JSON further
POU_KEEP = {"WaterRightNumber"}
NWI_KEEP = {"ATTRIBUTE", "ACRES", "WETLAND_TYPE"}
CANAL_KEEP = {"gnis_name", "fcode", "lengthkm"}


def _perp_dist(p, a, b):
    """Perpendicular distance from point p to segment ab (equirectangular)."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def douglas_peucker(coords, tol):
    if len(coords) < 3:
        return coords
    stack = [(0, len(coords) - 1)]
    keep = {0, len(coords) - 1}
    while stack:
        i, j = stack.pop()
        a, b = coords[i], coords[j]
        max_d, max_i = 0.0, None
        for k in range(i + 1, j):
            d = _perp_dist(coords[k], a, b)
            if d > max_d:
                max_d, max_i = d, k
        if max_i is not None and max_d > tol:
            keep.add(max_i)
            stack.append((i, max_i))
            stack.append((max_i, j))
    return [coords[i] for i in sorted(keep)]


def simplify_ring(ring, tol):
    if not ring or len(ring) < 4:
        return ring
    closed = ring[0] == ring[-1]
    body = ring[:-1] if closed else ring
    simplified = douglas_peucker(body, tol)
    if len(simplified) < 3:
        return ring
    if closed:
        if simplified[0] != simplified[-1]:
            simplified = simplified + [simplified[0]]
    return simplified


def simplify_geom(geom, tol):
    if not geom or "type" not in geom:
        return geom
    t = geom["type"]
    c = geom.get("coordinates")
    if t == "LineString":
        return {**geom, "coordinates": douglas_peucker(c, tol) if c and len(c) >= 3 else c}
    if t == "MultiLineString":
        return {
            **geom,
            "coordinates": [
                douglas_peucker(line, tol) if line and len(line) >= 3 else line for line in (c or [])
            ],
        }
    if t == "Polygon":
        return {
            **geom,
            "coordinates": [simplify_ring(ring, tol) for ring in (c or [])],
        }
    if t == "MultiPolygon":
        return {
            **geom,
            "coordinates": [
                [simplify_ring(ring, tol) for ring in poly] for poly in (c or [])
            ],
        }
    return geom


def filter_props(props, keep):
    if not isinstance(props, dict):
        return props
    return {k: v for k, v in props.items() if k in keep}


def process(path: Path, tol: float, keep: set[str] | None) -> tuple[int, int, int]:
    raw = path.read_text(encoding="utf-8")
    before = len(raw.encode("utf-8"))
    data = json.loads(raw)
    feats = data.get("features") or []
    verts_before = 0
    verts_after = 0

    def count_coords(g):
        if not g:
            return 0
        t = g.get("type")
        c = g.get("coordinates")
        n = 0
        if t == "Point":
            return 1
        if t in ("LineString", "MultiPoint"):
            return len(c or [])
        if t == "MultiLineString":
            return sum(len(x) for x in (c or []))
        if t == "Polygon":
            return sum(len(r) for r in (c or []))
        if t == "MultiPolygon":
            return sum(len(r) for poly in (c or []) for r in poly)
        return 0

    for f in feats:
        g = f.get("geometry")
        verts_before += count_coords(g)
        f["geometry"] = simplify_geom(g, tol)
        verts_after += count_coords(f.get("geometry"))
        if keep is not None:
            f["properties"] = filter_props(f.get("properties") or {}, keep)

    out = json.dumps(data, separators=(",", ":"))
    path.write_text(out + "\n", encoding="utf-8")
    after = len(out.encode("utf-8"))
    print(
        f"{path.name}: {before/1e6:.2f}MB → {after/1e6:.2f}MB | "
        f"verts {verts_before:,} → {verts_after:,} ({100*verts_after/max(verts_before,1):.0f}%) | "
        f"features {len(feats)}"
    )
    return len(feats), before, after


def update_manifest():
    man_path = DATA / "manifest.json"
    if not man_path.exists():
        return
    man = json.loads(man_path.read_text(encoding="utf-8"))
    note = "Geometries simplified for map performance (Douglas-Peucker)."
    layers = man.get("layers") or man
    for key in ("wd34-pou", "nwi-riparian", "nhd-canals-pipelines"):
        entry = None
        if isinstance(man.get("layers"), dict):
            entry = man["layers"].get(key)
        if entry and isinstance(entry, dict):
            prev = entry.get("notes") or ""
            if "simplified" not in prev.lower():
                entry["notes"] = (prev + " " + note).strip()
    man_path.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    print("Updated manifest.json notes")


def main():
    targets = [
        (DATA / "wd34-pou.geojson", 0.0001, POU_KEEP),
        (DATA / "nwi-riparian.geojson", 0.00015, NWI_KEEP),
        (DATA / "nhd-canals-pipelines.geojson", 0.0001, CANAL_KEEP),
    ]
    for path, tol, keep in targets:
        if not path.exists():
            print(f"skip missing {path}", file=sys.stderr)
            continue
        process(path, tol, keep)
    update_manifest()


if __name__ == "__main__":
    main()
