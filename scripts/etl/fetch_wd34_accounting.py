#!/usr/bin/env python3
"""
ETL: Copy published WD34 storage-results tables into public/data/wd34-accounting.json.

Downloads IDWR's public XLSX (stdlib zipfile + XML). Does not infer curtailment
or unauthorized diversion. Values are as published.

Run from project root:
  python3 scripts/etl/fetch_wd34_accounting.py
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from io import BytesIO

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

PAGE = "https://idwr.idaho.gov/wr-administration/water-rights-accounting/wd34/"
STORAGE_URLS = [
    "https://idwr.idaho.gov/wp-content/uploads/sites/2/water-rights-accounting/blsto/Big-lost-2026-storage-result.xlsx",
    "https://idwr.idaho.gov/wp-content/uploads/sites/2/water-rights-accounting/blsto/Big-lost-2025-storage-result.xlsx",
]
SOURCE_FILES = [
    {
        "title": "2026 Storage Results (XLSX)",
        "url": STORAGE_URLS[0],
        "kind": "xlsx",
    },
    {
        "title": "2025 Storage Results (XLSX)",
        "url": STORAGE_URLS[1],
        "kind": "xlsx",
    },
    {
        "title": "2026 Water Rights Accounting Report (PDF)",
        "url": "https://idwr.idaho.gov/wp-content/uploads/2026/06/2026-biglost-wr-accounting-report.pdf",
        "kind": "pdf",
    },
    {
        "title": "2025 Water Rights Accounting Report (PDF)",
        "url": "https://idwr.idaho.gov/wp-content/uploads/sites/2/water-rights-accounting/blwra/Big-lost-2025-accounting-report.pdf",
        "kind": "pdf",
    },
    {
        "title": "2019 Water Rights Accounting Report (PDF)",
        "url": "https://idwr.idaho.gov/wp-content/uploads/sites/2/water-rights-accounting/blwra/2019-big-lost-wr-accounting-report.pdf",
        "kind": "pdf",
    },
    {
        "title": "WD34 Water Rights Accounting 101 (2015 PDF)",
        "url": "https://idwr.idaho.gov/wp-content/uploads/sites/2/water-rights-accounting/20151208-WD34-accounting-101.pdf",
        "kind": "pdf",
    },
    {
        "title": "WD34 Demand Database (2015 PDF)",
        "url": "https://idwr.idaho.gov/wp-content/uploads/sites/2/water-rights-accounting/20151104-WD34-demand-database.pdf",
        "kind": "pdf",
    },
]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DATA = os.path.join(SCRIPT_DIR, "..", "..", "public", "data")
OUT = os.path.join(PUBLIC_DATA, "wd34-accounting.json")
MANIFEST = os.path.join(PUBLIC_DATA, "manifest.json")

UA = "Basin34-ETL (public data fetch)"


def num(v):
    if v is None or v == "":
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if not (x == x):  # NaN
        return None
    return round(x, 4)


def excel_date(v):
    n = num(v)
    if n is None:
        return None
    return (datetime(1899, 12, 30) + timedelta(days=n)).date().isoformat()


def decree_date(v):
    s = str(v).strip()
    if re.fullmatch(r"\d{8}", s):
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return s or None


def shared_strings(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall("m:si", NS):
        texts = [t.text or "" for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")]
        out.append("".join(texts))
    return out


def cell_val(c, ss: list[str]) -> str:
    t = c.attrib.get("t")
    v = c.find("m:v", NS)
    if v is None or v.text is None:
        return ""
    if t == "s":
        i = int(v.text)
        return ss[i] if i < len(ss) else v.text
    return v.text


def sheet_rows(z: zipfile.ZipFile, path: str, ss: list[str]) -> list[dict[str, str]]:
    root = ET.fromstring(z.read(path))
    rows = []
    for row in root.findall("m:sheetData/m:row", NS):
        cells = {}
        for c in row.findall("m:c", NS):
            ref = c.attrib.get("r", "")
            m = re.match(r"([A-Z]+)", ref)
            if not m:
                continue
            cells[m.group(1)] = cell_val(c, ss)
        if cells:
            rows.append(cells)
    return rows


def parse_storage_xlsx(blob: bytes) -> tuple[list[dict], list[dict], str, str]:
    z = zipfile.ZipFile(BytesIO(blob))
    ss = shared_strings(z)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

    sheets = []
    for sh in wb.findall("m:sheets/m:sheet", NS):
        name = sh.attrib.get("name") or ""
        rid = sh.attrib.get(f"{REL_NS}id")
        target = rid_to_target[rid]
        if not target.startswith("xl/"):
            target = "xl/" + target.lstrip("/")
        sheets.append((name, target))

    daily_rows = []
    canal_rows = []
    for name, path in sheets:
        rows = sheet_rows(z, path, ss)
        if name.lower().startswith("wra") or "data" in name.lower():
            for r in rows[2:]:
                date = excel_date(r.get("A"))
                if not date:
                    continue
                daily_rows.append({
                    "date": date,
                    "decreeDate": decree_date(r.get("B")),
                    "percentFilled": num(r.get("C")),
                    "inflowCfs": num(r.get("D")),
                    "mackayReleaseCfs": num(r.get("E")),
                    "storageCfs": num(r.get("F")),
                    "decreeDelivery": {
                        "sharp": num(r.get("G")),
                        "twoBToLeslie": num(r.get("H")),
                        "leslieToMoore": num(r.get("I")),
                        "belowMoore": num(r.get("J")),
                    },
                    "storageDelivery": {
                        "sharp": num(r.get("K")),
                        "twoBToLeslie": num(r.get("L")),
                        "leslieToMoore": num(r.get("M")),
                        "belowMoore": num(r.get("N")),
                    },
                    "totals": {"decree": num(r.get("O")), "storage": num(r.get("P"))},
                    "losses": {"decree": num(r.get("Q")), "storage": num(r.get("R"))},
                    "deliveryFactor": {"decree": num(r.get("S")), "storage": num(r.get("T"))},
                    "conveyance": {
                        "leslie": num(r.get("U")),
                        "moore": num(r.get("V")),
                        "arco": num(r.get("W")),
                    },
                    "rotationFactor": {
                        "leslie": num(r.get("X")),
                        "moore": num(r.get("Y")),
                        "arco": num(r.get("Z")),
                    },
                    "df": {
                        "reach": num(r.get("AA")),
                        "canal": num(r.get("AB")),
                        "river": num(r.get("AC")),
                    },
                })
        else:
            for r in rows[3:]:
                canal = (r.get("A") or "").strip()
                if not canal or canal.upper() == "TOTAL":
                    continue
                canal_rows.append({
                    "canal": canal,
                    "wraUsedAf": num(r.get("B")),
                    "sbwAllocationIn": num(r.get("C")),
                    "sbwRemainingIn": num(r.get("D")),
                    "sbwUsedAf": num(r.get("E")),
                })
    start = daily_rows[0]["date"] if daily_rows else ""
    end = daily_rows[-1]["date"] if daily_rows else ""
    return daily_rows, canal_rows, start, end


def head_ok(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def main():
    catalog = []
    for f in SOURCE_FILES:
        ok = head_ok(f["url"])
        catalog.append({**f, "available": ok})
        print(f"  {'OK' if ok else 'missing'}  {f['title']}")

    xlsx_url = next((c["url"] for c in catalog if c["kind"] == "xlsx" and c["available"]), None)
    if not xlsx_url:
        raise SystemExit("No WD34 storage XLSX was reachable")

    print("Parsing", xlsx_url)
    daily, canals, start, end = parse_storage_xlsx(fetch_bytes(xlsx_url))
    payload = {
        "asOf": start[:4] if start else datetime.now(timezone.utc).strftime("%Y"),
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "sourcePage": PAGE,
        "workbookUrl": xlsx_url,
        "season": {"start": start, "end": end, "days": len(daily)},
        "notes": (
            "Copied from IDWR Water District 34 storage-results workbook. "
            "Daily losses, delivery factors, and named canals (including Eastside / Westside) "
            "are as published. Authorized max diversion on the POD layer is a different quantity. "
            "This extract does not infer curtailment or unauthorized diversion."
        ),
        "files": catalog,
        "daily": daily,
        "canals": canals,
    }
    os.makedirs(PUBLIC_DATA, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    print(f"Wrote {OUT} ({len(daily)} daily rows, {len(canals)} canals)")

    if os.path.exists(MANIFEST):
        man = json.load(open(MANIFEST, encoding="utf-8"))
        man.setdefault("layers", {})["wd34-accounting"] = {
            "source": PAGE,
            "asOf": payload["asOf"],
            "count": len(daily),
            "description": (
                "Published WD34 storage-results daily accounting (inflow, reach deliveries, "
                "losses, delivery factors) plus named-canal season totals. Values as published."
            ),
        }
        json.dump(man, open(MANIFEST, "w", encoding="utf-8"), indent=2)
        open(MANIFEST, "a", encoding="utf-8").write("\n")
        print("Updated manifest.json")


if __name__ == "__main__":
    main()
