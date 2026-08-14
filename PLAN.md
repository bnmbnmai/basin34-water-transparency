# Basin 34 Water Transparency — Plan

**Repo:** `bnmbnmai/basin34-water-transparency`  
**Live:** https://water.bnm.farm (Caddy basic auth — same login as farm.bnm.farm)  
**Deploy:** rebuild `dist/` only on the media box (`npm run build`). See `tv-remote/homelab/AGENT_COORDINATION.md`.

**Purpose:** Single source of truth. On the media-box agent say: “read PLAN.md and do the next build slice.”

---

## Two layers (do not mix)

1. **Public observer (this repo + the live map).** IDWR + USGS receipts. Owner names from the IDWR GIS stay in search, tables, and CSV. Geometric / priority / gage proxies — not court findings, not injury claims, not a case caption. Guide copy is geography-only. Do not ship a private briefing or a named lawsuit into `src/`, `public/`, or Guide.
2. **Private binder (`private/`, gitignored).** Local notes, PDFs, watchlist pins, anything about a specific case. Production builds never fetch that folder. Copy [`private.example/`](private.example/) to `private/` on a machine that should have it.

---

## North star

A **public accountability / transparency tool** for Water District 34 (Big Lost River) that is:

1. **Fast enough to use** in a meeting (not a 26MB stutter-fest)
2. **Clear enough** that a neighbor can see: lower river goes dry; senior surface rights sit there; later development expanded upstream / off-corridor
3. **Exportable** — ranked tables + CSV, not only a map
4. **Careful** — evidence and methodology, no accusations; **do not feature private families as the default “example”** in Guide captions. Owner names from IDWR stay in the data, search, tables, and CSV.

> Think “receipts + rankings + map,” not “heavy GIS for its own sake.”

**Tone:** Neutral, sourced. Geometric / priority / gage proxies — not court findings.

---

## UX law (do not break)

1. **One workspace:** Explore is always on. No Story | Explore mode toggle.
2. **Thin Guide:** “Walk the receipts” is a dismissible coach that flies the map and opens inspector receipts — not a second control panel (no duplicate basemap / then-now / jump grid).
3. **Map + inspector only:** Feature detail and receipts (tables, charts, gages) open in `#details`. **No full-screen lightbox** for product flows.
4. **Three primary receipts:** Downstream seniors · Water moved farther · River shrink (days-with-flow + this-season WD34 accounting). Advanced: owner concentration, well logs, appropriation vs Mackay.
5. **Zoom completes the sacred path:** CSV/table Zoom selects the right, paints cyan POD↔POU lines at field scale, keeps the map visible, offers **← Back to list**.
6. **Close model:** Esc and ✕ always close the inspector. Map click clears selection but does not dismiss a pinned receipt.

**Product rule:** at most **three primary insight receipts**. Do not add a seventh exclusive `HighlightMode`.

---

## Current state (2026-08-13)

- [x] F0 data refresh (`asOf` 2026-07-22)
- [x] F1–F5 receipts roadmap (moved farther CSV, sidebar nest, story trim → now Guide, live USGS CFS)
- [x] Guide not dual-mode + inspector unification
- [x] Map perf + Landsat/Wayback imagery (phone-usable paint, simplified GeoJSON)
- [x] Receipt unit tests (`npm test`: epoch dates, dry-reach, moved-farther, USGS RDB, permalink, lower-valley, owners, well logs, side-of-channel)
- [x] Condensed product: three receipts; gage roles (yield/terminus/remnant); days-with-flow + wet/recent overlay; WD34 accounting folded into river shrink; dropped conflict/junior/high-rate/conjunctive/timeline
- [ ] Curtailment / “who shut off when” (accounting extract has daily delivery/loss columns as published — not a shutoff roster)

---

## Build order (recent)

```text
F0–F5 …                                          ← DONE
G1. Drop Story mode; thin Guide + inspector UX   ← DONE
```

---

### Guide (replaces Story mode)

- Header: **Walk the receipts** starts the coach  
- Five steps: ★ → then/now → river shrink → dry-reach → moved farther  
- Coach pinned in Explore (sheet peek on mobile when active)  
- Receipts open in the wide/tall inspector — map stays visible  

### Inspector

- Wide desktop rail for tables/charts; taller bottom sheet on mobile for receipts  
- Sticky header with Close  
- Live USGS CFS + days-with-flow for yield/terminus/remnant gages (inspector, not modal)  

### F4 evidence note (unchanged)

No clean public east/west designation polygons — lined-canal claim stays Guide/satellite narrative. Geometric off-corridor ≠ “last 10–15 years.” NHD canals/pipelines now carry a **geometric** east/west-of-mainstem label (longitude vs nearest Big Lost vertex). WD34 storage-results names (Eastside, Westside, Island, …) appear only in the published-accounting receipt, copied from the IDWR workbook.

---

## Working loop

1. Stay in `basin34-water-transparency`; rebuild `dist/` only  
2. Do not checkout other branches in `tv-remote` or recreate Caddy from a stale tree  
3. After each slice: commit, push, `npm run build`

## Success bar

In &lt;5 minutes on a phone: Walk the receipts → Now channel is brown below Moore → river shrink shows Mackay days-with-flow vs Arco collapsing plus this season’s below-Moore delivery → seniors CSV and moved-farther CSV Zoom to one cyan-labeled diversion. Clicking Leslie or the playa does not look like a broken chart.
