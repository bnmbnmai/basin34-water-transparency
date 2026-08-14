# Basin 34 Water Transparency

Interactive public web map for Water District 34 (Big Lost River Basin / Basin 34), Idaho.

**Goal:** Make existing high-quality public IDWR + USGS data more accessible and understandable — water rights points of diversion (PODs), places of use (POU), wells, stream gages, river reaches/hydro, and the historical vs. recent surface flow extent of the Big Lost River.

The tool is strictly neutral and data-driven. All visualizations cite public sources and "as of" dates. It complements (does not replace) official IDWR viewers and WD34 accounting reports.

**Two layers:** this repository is the public observer (IDWR owner names in search/tables/CSV; no case captions, no injury findings). Local notes and pin lists live in `private/` (gitignored) — copy [`private.example/`](private.example/) and [`watchlist.example.json`](watchlist.example.json). Production builds never fetch or ship that folder.

## Quick Start

```bash
npm install
npm run dev      # local dev server
npm run build    # static production build to dist/
npm run preview  # serve the production build locally
```

## Using the tool

### Insight receipts (the headline feature)

Three primary receipts. Opening seniors or moved-farther also emphasizes matching ★ on the map (Reset clears that). There is no six-way analysis dropdown.

- **Downstream seniors + CSV** — pre-1950 Big Lost / Ferris Slough rights on the NHD mainstem at or below Moore (Antelope Creek excluded). Toggle **Include later surface irrigation below Moore** for the post-1950 paper on the same reach. Zoom a row to isolate that right at field scale (cyan diversion↔field lines).
- **Water moved farther + CSV** — POD more than 8 km from current POU (size-adjusted). Off-corridor orange fills are a geometric flag, not a liner inventory. Selecting this receipt turns canals on.
- **River shrink** — Mackay yield → Moore terminus → Arco remnant. Lead series is **days with flow**, plus a wet-year vs recent-year daily overlay and this season’s WD34 below-Moore delivery (as published). Calendar-year mean is secondary so a two-week pulse does not look like year-round water.

Gages are waypoints, not equal charts. Mackay (blue) = yield; Moore (orange) = terminus; Arco (red) = remnant. Archive/context pins (Leslie, playa, discontinued sinks) redirect into river shrink instead of drawing a one-year annual-mean line.

### Flow charts (live USGS + WD34 workbook)

Chart-heavy panels open in the **map-adjacent inspector** (`#details`) — not a full-screen lightbox. Hover for values. Esc / ✕ closes; the map stays visible.

- **Click Mackay / Moore / Arco** → live CFS + days-with-flow (Apr–Oct overlay). Click Leslie or the playa → “not a long discharge record” + Open river shrink.
- **Appropriation vs. supply** (Advanced) → cumulative authorized cfs (surface vs groundwater) against **Mackay yield**. Arco days-with-flow is a separate remnant series — not a paper-to-Arco ratio.
- **Then vs now** is in the primary sidebar (default **Now**). Wells start off.

Advanced: authorized cfs by owner; lower-valley well logs (drill-time static water); export visible PODs/wells. Local watchlist is `npm run dev` only.

Optional local pins: copy [`watchlist.example.json`](watchlist.example.json) to `private/watchlist.json` (gitignored) and run `npm run dev`. See [`private.example/`](private.example/) for what else belongs only on a local machine. Production builds never fetch or ship that file.

### Exploring rights and places of use

- **Click a field (POU polygon)** → details panel lists every water right sharing that polygon (sorted senior-first, with priority badges and transfer distance), the polygon gets a cyan outline, and dashed lines connect it to each POD. A selection banner appears at the top of the map.
- **District / service-area POUs** — a handful of rights (e.g. nine Big Lost River Irrigation District storage rights, ~234 km²; federal NPS rights, ~215 km²) have an authorized place of use covering most of the valley. These render as teal dashed **outlines only** (≥ 20 km², `DISTRICT_POU_KM2`): no fill means no valley-wide tint and no stolen clicks, so the individual fields inside stay visible and clickable. Polygons are painted largest-first, so smaller fields always win the click. Click the outline itself to see the district's rights.
- **Click a POD ★** → see the right's priority year, owner, rate, transfer badge, and its place of use highlighted with connector lines. "Zoom to right" centers on the highest-rate diversion at field scale.
- Clear the selection via the banner's ✕, the Esc key, or clicking the map background.

### Other controls

- **Owner search** — type a partial name, click a match to show that owner's rights (amber). The summary lists each water right; click a row to select it (cyan star + POD↔field lines). "Show all this owner's stars" clears the selection but keeps the owner lens.
- **POD filters** — color by source (GW violet / surface blue) or by priority year; filter by source class, era buckets (<1950 / 1950–2000 / >2000), and a year range. The same time filters apply to well construction years.
- **Wells** — colored by use by default (irrigation teal, domestic gray, stock burnt-orange, …), or by construction era / drill-time static water level from Advanced. Sized by production rate, with "hide domestic & unlabeled" on by default.
- **Riparian areas (FWS NWI)** — 1,128 National Wetlands Inventory riparian polygons (forested dark green, scrub-shrub olive): the river's natural green corridor. Drawn beneath all interactive layers (never steals clicks); hover for type and acreage. Styled to read as a green band at basin zoom, stronger in the "then" era and dimmed in the "now" era. **Coverage note:** NWI riparian was simply not mapped along the lower channel — Arco to the Howe sinks has zero polygons (and decades of dry channel mean little riparian vegetation remains to map, which is itself part of the story); the NHD river-channel layer carries the corridor through that stretch.
- **Canals & pipelines (NHD)** — real USGS National Hydrography Dataset geometry for the basin: 718 canal/ditch segments and pipelines, named on hover (Moore Canal, Burnett Ditch, Telford Pipe, …). Canals east of the NHD mainstem draw dashed cyan; west draw teal; pipelines are dotted slate. East/west is longitude vs the nearest mainstem vertex — not a liner inventory.
- **Named diversions ◆** — orange diamonds aggregating IDWR POD `DiversionName` for surface rights into delivery systems (≥5 cfs total). Labels appear at zoom ≥ 11; click one for every right it serves, total authorized cfs, and earliest priority.
- **River channel & sinks (NHD) — "Then vs now: where the river ends"** — the real Big Lost River channel (348 NHD segments) plus the terminal sinks complex near Howe (50 playa/marsh polygons). Each segment is tagged `above-moore` / `below-moore` at the **Moore diversion** (USGS 13132100) during ETL — because WD34 accounting and field observations show surface flow commonly ends near Moore in recent years, long before Arco or the sinks. In the **"Then"** era the whole channel runs vivid blue to the sinks; in the **"Now"** era (the default) everything below Moore (including the reach to Arco and the eastern sinks limb) renders **dashed brown**. Gages: Mackay blue (yield), Moore orange (terminus), Arco red (remnant); gray archive/context pins are not equal charts.
- **Basemap & layer toggles** — Map / Satellite / Hybrid basemaps; per-layer checkboxes for PODs, wells, basin boundary, canals & pipelines, named diversions, gages, flow extent, and admin reaches.
- **🔗 Share view (permalinks)** — the URL hash mirrors the full app state (analysis view, filters, owner, selection, flow era, basemap, map position; only non-default values, so URLs stay short). The header button copies the link; opening it restores the exact view, including any auto-opened analysis panel.
- **Legend** — always visible, swatch-based, and generated from the same color tables the map uses, so it always matches what is drawn.

## Architecture (src/)

The app is a static Vite + TypeScript + Leaflet build, organized as small modules around one explicit state object:

```
src/
  types.ts          Domain types (PodRecord, AppState, HighlightMode, …)
  state.ts          Single mutable AppState + defaults/reset
  data.ts           GeoJSON loading + derived records & indexes (built once):
                    priority years (incl. negative-epoch pre-1970 dates),
                    podsByWR / pousByWR, shared-polygon grouping, POU centers
                    and areas, size-adjusted transfer distances, "new ground"
                    classification (distance to the NHD/NWI natural corridor)
  filters.ts        Pure visibility predicates (pods / wells)
  emphasis.ts       Pure per-feature emphasis resolution
                    (selected > owner > analysis view > normal/subdued)
  symbology.ts      Color tables, sizes, cached star icon factory
  usgs.ts           Live USGS NWIS annual-statistics fetch + RDB parsing (cached)
  permalink.ts      URL-hash encode/decode of AppState + map view (share links)
  dryReach.ts       Downstream seniors (pre-1950) receipt
  lowerValley.ts    Surface irrigation at/below Moore (all priority years)
  ownerConcentration.ts  Authorized cfs by owner
  wellPressure.ts   Lower-valley well log medians
  accounting.ts     WD34 storage-results extract
  sideOfChannel.ts  Geometric east/west of NHD mainstem
  exportVisible.ts  Filtered POD/well CSV + GeoJSON
  csv.ts            Shared CSV download helpers
  wrLinks.ts        IDWR report / transfer-search URLs
  watchlist.ts      Dev-only local pin list (never in dist/)
  map/
    createMap.ts    Map + pane z-order (defined once; no bringToFront juggling)
    podLayer.ts     Clustered POD stars; full rebuild only on filter changes,
                    in-place restyle for selection changes
    wellLayer.ts    SVG circle markers in a pane above POU (dot wins the click)
    pouLayer.ts     One SVG GeoJSON layer for POU polygons (painted largest-
                    first; district-scale areas outline-only) + selection
                    overlay + non-interactive connector lines on dedicated panes
    diversionLayer.ts Named diversions aggregated from POD DiversionName
    staticLayers.ts Boundary, NWI riparian, NHD canals/pipelines, gages
                    (role-styled), NHD mainstem + sinks (era-styled), reaches
    gageRoles.ts    Mackay yield / Moore terminus / Arco remnant / archive / context
    historicalImagery.ts  Landsat year slider + Esri Wayback archive
  ui/
    shell.ts        Static HTML shell
    sidebar.ts      Control wiring (state mutations + refresh callbacks)
    legend.ts       Swatch legend
    details.ts      Inspector renderers (POD / well / POU group / role-based
                    gage charts / diversion / transfers / appropriation /
                    river shrink / dry-reach)
    observerPanels.ts  Advanced receipts (owners, well logs)
    chart.ts        Dependency-free SVG line/area/step charts + hover
                    crosshair/value readout (enhanceCharts)
    story.ts        Thin Guide (“Walk the receipts”) — not a second Explore mode
    ownerSearch.ts  Debounced owner search + summary
  main.ts           Bootstrap + render orchestration (refreshData / setSelection)
```

Key invariants:

- **Filtering, emphasis, and symbology are pure functions** of `(record, state, store)` — easy to test and to extend with new analysis views (add an enum value, a predicate, and a color entry).
- **Selection never rebuilds the world.** Clicking a POD/POU restyles only the affected markers and redraws the small selection overlay; the 7k-marker cluster and 5.8k-polygon POU layer rebuild only when filters change.
- **Z-order lives in panes** (`createMap.ts`), set once: overlays (400) < POU base (450) < wells (470) < gages (480) < markers (600) < selection outline (650) < connector lines (660). Every interactive layer is SVG, so only the drawn shapes capture clicks — a well/gage dot wins over the POU under it, and a click beside the dot falls through to the field.

## Data & ETL

- `public/data/` — committed GeoJSON extracts (WGS84) + `manifest.json` with provenance and counts: `wd34-pods` (7,066), `wd34-wells` (4,323), `wd34-pou` (5,786), `nhd-canals-pipelines` (718), `nwi-riparian` (1,128), `nhd-mainstem` (348), `nhd-sinks` (50), `wd34-admin-reaches` (6), `basin-boundary`, `gages` (5), `flow-extent-indicators` (2, fallback only), `wd34-accounting` (published storage-results tables).
- `scripts/etl/fetch_idwr_pods_wells.py` — reproducible extraction from IDWR public feature services (PODs, wells, POU; Basin 34 / WD34 filtered). Re-run periodically and commit updated extracts + manifest.
- `scripts/etl/fetch_nwi_riparian.py` — FWS National Wetlands Inventory riparian polygons for the basin (bbox query, centroid-clipped to the WBD boundary).
- `scripts/etl/fetch_nhd_mainstem.py` — Big Lost River mainstem flowlines from the NHD HR MapServer, each segment tagged `above-moore` / `below-moore` at the **Moore diversion** (USGS 13132100), plus the terminal sinks playa/marsh polygons (NHD waterbody fcodes 36100/46600) near Howe.
- `scripts/etl/fetch_wd34_accounting.py` — copies IDWR WD34 storage-results XLSX (daily delivery/loss columns and named-canal totals, values as published) into `wd34-accounting.json`. PDFs on the WD34 page are catalogued and linked, not parsed.
- Note on dates: IDWR serves `PriorityDate` / `ConstructionDate` as epoch **milliseconds**, and pre-1970 dates are **negative** — ~86% of Basin 34 rights. The data layer handles this.

Primary public sources (all open, no login):

- IDWR: https://data-idwr.hub.arcgis.com/ + feature services (WaterRightPods, Wells, POU)
- USGS NWIS gages, historical daily values, and the annual statistics service (13132500 is the key lower-basin extent gage); fetched live by the app for flow charts
- NHD High Resolution flowlines (canal/ditch/pipeline fcodes) via https://hydro.nationalmap.gov — `public/data/nhd-canals-pipelines.geojson`; Big Lost River mainstem + sinks waterbodies — `public/data/nhd-mainstem.geojson`, `public/data/nhd-sinks.geojson`
- USFWS National Wetlands Inventory (Riparian MapServer) — `public/data/nwi-riparian.geojson`
- WBD/NHD for HUC 17040218
- WD34 accounting page + USGS SIR reports for context

## Roadmap

- Phase 1 remainder: ditch rider logs / a true curtailment roster ("who got shut off when") if those tables become public. The storage-results extract is daily delivery, losses, and named-canal totals as published — not a shutoff list.

Live USGS instantaneous CFS is already in the gage inspector. Receipt unit tests: `npm test`.

## License & Attribution

Code: MIT. Data: public government sources — always attribute IDWR and USGS prominently (already in UI/footer).

**This is a community / transparency tool only. For water rights, administration, or legal matters, use official IDWR and Water District 34 resources.**
