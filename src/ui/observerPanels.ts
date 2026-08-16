import { ACCOUNTING_METHODOLOGY, loadAccounting } from '../accounting'
import { downloadCsv } from '../csv'
import type { DataStore } from '../data'
import {
  downloadVisiblePodsCsv,
  downloadVisiblePodsGeoJson,
  downloadVisibleWellsCsv,
} from '../exportVisible'
import {
  LOWER_VALLEY_METHODOLOGY,
  listLowerValleySurface,
  lowerValleyToCsv,
} from '../lowerValley'
import {
  OWNER_CONCENTRATION_METHODOLOGY,
  listOwnerConcentration,
  ownerConcentrationToCsv,
  ownerSizeBands,
} from '../ownerConcentration'
import { state } from '../state'
import { formatMilesNumber } from '../units'
import {
  WELL_PRESSURE_METHODOLOGY,
  lowerValleyWells,
  wellPressureByDecade,
  wellPressureToCsv,
} from '../wellPressure'
import { TRANSFER_SEARCH_URL } from '../wrLinks'
import { svgChart } from './chart'
import { openInspector } from './details'

function chartW(): number {
  const panel = document.getElementById('details')
  const w = panel?.clientWidth || 360
  return Math.max(240, Math.min(560, w - 28))
}

const FOOT = `<div style="margin-top:6px;font-size:0.7em;color:var(--text-muted)">`

export function showLowerValleyPanel(store: DataStore) {
  const rows = listLowerValleySurface(store)
  const onDry = rows.filter(r => r.onDryChannel)
  const totalCfs = rows.reduce((s, r) => s + r.rate, 0)
  let html =
    `<h2 style="margin-top:0">Surface irrigation below Moore</h2>` +
    `<p style="font-size:0.85em;line-height:1.45;color:var(--text-muted)">${LOWER_VALLEY_METHODOLOGY}</p>` +
    `<p style="font-size:0.9em"><strong>${rows.length}</strong> rights · ` +
    `<strong>${onDry.length}</strong> on the dry-styled channel · ` +
    `<strong>${totalCfs.toFixed(1)}</strong> cfs combined authorized max</p>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0">` +
    `<button type="button" id="lower-valley-csv" class="zoom-btn">Download CSV</button>` +
    `<label style="font-size:0.8em;display:flex;align-items:center;gap:6px;flex:1;min-width:180px">` +
    `Filter owner <input id="lower-valley-owner-filter" type="search" placeholder="Type any owner name…" ` +
    `style="flex:1;min-width:140px;padding:6px 8px;border:1px solid var(--border-strong);border-radius:4px;background:var(--control-bg);color:var(--text)" />` +
    `</label></div>` +
    `<p id="lower-valley-filter-status" style="font-size:0.8em;color:var(--text-muted);min-height:1.2em"></p>`

  const renderRows = (list: typeof rows) => {
    const max = 250
    let body = ''
    for (let i = 0; i < Math.min(list.length, max); i++) {
      const r = list[i]
      body += `<tr>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right;color:var(--text-muted)">${i + 1}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)"><code>${r.wr}</code></td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.owner || '—'}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.year ?? '—'}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.rate.toFixed(2)}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.diversion || '—'}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${formatMilesNumber(r.arcoKm)}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.onDryChannel ? 'yes' : '—'}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)"><button type="button" class="zoom-btn" data-zoom-wr="${r.wr}">Zoom</button></td>` +
        `</tr>`
    }
    if (!list.length) {
      body = `<tr><td colspan="9" style="padding:12px;color:var(--text-muted)">No matching rights.</td></tr>`
    }
    return { body, truncated: list.length > max }
  }

  html += `<div style="overflow:auto;max-height:55vh"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead><tr>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">#</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Right</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Owner</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Year</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">cfs</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Diversion</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">mi to Arco</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Dry-styled</th>` +
    `<th></th></tr></thead><tbody id="lower-valley-tbody">`

  const initial = renderRows(rows)
  html += initial.body + `</tbody></table></div>`
  html += `<p id="lower-valley-truncate-note" style="font-size:0.8em;color:var(--text-muted)">${
    initial.truncated ? `Showing first 250 of ${rows.length}. CSV includes all.` : ''
  }</p>`
  html += `${FOOT}Ranked by priority year (senior first). Pre-1950 rights on the corridor also appear in the Downstream seniors receipt.</div>`

  openInspector(html, {
    wide: true,
    receipt: 'lower-valley',
    heading: 'Below Moore',
    reopen: () => showLowerValleyPanel(store),
  })

  document.getElementById('lower-valley-csv')?.addEventListener('click', () => {
    const q = (document.getElementById('lower-valley-owner-filter') as HTMLInputElement | null)?.value.trim().toLowerCase() || ''
    const exportRows = q ? rows.filter(r => r.owner.toLowerCase().includes(q)) : rows
    downloadCsv('basin34-surface-below-moore.csv', lowerValleyToCsv(exportRows))
  })
  const input = document.getElementById('lower-valley-owner-filter') as HTMLInputElement | null
  const tbody = document.getElementById('lower-valley-tbody')
  const status = document.getElementById('lower-valley-filter-status')
  const note = document.getElementById('lower-valley-truncate-note')
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    const filtered = q ? rows.filter(r => r.owner.toLowerCase().includes(q)) : rows
    const rendered = renderRows(filtered)
    if (tbody) tbody.innerHTML = rendered.body
    if (status) status.textContent = q ? `${filtered.length} matching “${input.value.trim()}”` : ''
    if (note) note.textContent = rendered.truncated ? `Showing first 250 of ${filtered.length}.` : ''
  })
}

export function showOwnerConcentrationPanel(store: DataStore) {
  const rows = listOwnerConcentration(store)
  const bands = ownerSizeBands(rows)
  const top = rows.slice(0, 40)
  const topCfs = top.reduce((s, r) => s + r.cfs, 0)
  const allCfs = rows.reduce((s, r) => s + r.cfs, 0)
  let html =
    `<h2 style="margin-top:0">Authorized cfs by owner</h2>` +
    `<p style="font-size:0.85em;line-height:1.45;color:var(--text-muted)">${OWNER_CONCENTRATION_METHODOLOGY}</p>` +
    `<p style="font-size:0.9em"><strong>${rows.length.toLocaleString()}</strong> owners · ` +
    `bands: <strong>${bands.small}</strong> under 2 cfs · <strong>${bands.mid}</strong> 2–20 cfs · ` +
    `<strong>${bands.large}</strong> over 20 cfs</p>` +
    `<p style="font-size:0.85em">Top 40 holders: <strong>${topCfs.toFixed(0)}</strong> of ` +
    `<strong>${allCfs.toFixed(0)}</strong> authorized cfs (${allCfs ? ((100 * topCfs) / allCfs).toFixed(0) : 0}%).</p>` +
    `<button type="button" id="owner-conc-csv" class="zoom-btn" style="margin:8px 0">Download CSV (all owners)</button>` +
    `<div style="overflow:auto;max-height:55vh"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead><tr>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">#</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Owner</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Rights</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">cfs</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Surface</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">GW</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Below Moore</th>` +
    `</tr></thead><tbody>`

  top.forEach((r, i) => {
    html += `<tr>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right;color:var(--text-muted)">${i + 1}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.owner}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.rights}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.cfs.toFixed(1)}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.surfCfs.toFixed(1)}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.gwCfs.toFixed(1)}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.belowMooreCfs.toFixed(1)}</td>` +
      `</tr>`
  })
  html += `</tbody></table></div>`
  html += `${FOOT}Owner names are the IDWR extract. Click Owner search in the sidebar to highlight one name on the map.</div>`

  openInspector(html, {
    wide: true,
    receipt: 'owners',
    heading: 'Owner concentration',
    reopen: () => showOwnerConcentrationPanel(store),
  })
  document.getElementById('owner-conc-csv')?.addEventListener('click', () => {
    downloadCsv('basin34-authorized-cfs-by-owner.csv', ownerConcentrationToCsv(rows))
  })
}

export function showWellPressurePanel(store: DataStore, opts?: { revealWells?: () => void }) {
  state.hideDomestic = false
  state.wellColorMode = 'swl'
  opts?.revealWells?.()

  const wells = lowerValleyWells(store)
  const decades = wellPressureByDecade(wells)
  const withSwl = wells.filter(w => w.swl != null && w.swl > 0)
  const pts = decades
    .filter(d => d.medianSwl != null)
    .map(d => ({ x: parseInt(d.decade, 10), y: d.medianSwl as number }))

  let html =
    `<h2 style="margin-top:0">Lower-valley well logs</h2>` +
    `<p style="font-size:0.85em;line-height:1.45;color:var(--text-muted)">${WELL_PRESSURE_METHODOLOGY}</p>` +
    `<p style="font-size:0.9em"><strong>${wells.length.toLocaleString()}</strong> wells at/below Moore · ` +
    `<strong>${withSwl.length.toLocaleString()}</strong> with a static water level</p>` +
    `<p style="font-size:0.8em;color:var(--text-muted)">Map wells are colored by drill-time static water level (opt-in; Hide domestic is off for this view). ` +
    `Change “Well color” under Advanced to go back to use-class.</p>` +
    `<button type="button" id="well-pressure-csv" class="zoom-btn" style="margin:8px 0">Download CSV</button>`

  if (pts.length) {
    html += `<div id="well-swl-chart">` +
      svgChart({
        width: chartW(),
        height: 180,
        series: [{ points: pts, color: '#b45309', label: 'median static WL (ft) by construction decade', kind: 'line', width: 2 }],
        yLabel: 'ft below land surface',
      }) + `</div>`
  }

  html += `<div style="overflow:auto;max-height:40vh;margin-top:8px"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead><tr>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Decade</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Wells</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Median SWL ft</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Median depth ft</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Domestic-ish</th>` +
    `</tr></thead><tbody>`
  for (const d of decades) {
    html += `<tr>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border)">${d.decade}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${d.count}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${d.medianSwl != null ? d.medianSwl.toFixed(0) : '—'}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${d.medianDepth != null ? d.medianDepth.toFixed(0) : '—'}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${d.domestic}</td>` +
      `</tr>`
  }
  html += `</tbody></table></div>`
  html += `${FOOT}IDWR Wells extract. Static water level is at construction, not a current hydrograph.</div>`

  openInspector(html, {
    wide: true,
    receipt: 'well-pressure',
    heading: 'Well logs',
    reopen: () => showWellPressurePanel(store, opts),
  })
  document.getElementById('well-pressure-csv')?.addEventListener('click', () => {
    downloadCsv('basin34-lower-valley-wells.csv', wellPressureToCsv(wells))
  })
}

export async function showAccountingPanel() {
  let html =
    `<h2 style="margin-top:0">WD34 published accounting</h2>` +
    `<p style="font-size:0.85em;line-height:1.45;color:var(--text-muted)">${ACCOUNTING_METHODOLOGY}</p>` +
    `<p style="font-size:0.8em">Loading IDWR storage-results extract…</p>`
  openInspector(html, { wide: true, receipt: 'accounting', heading: 'WD34 accounting' })

  const data = await loadAccounting()
  const panel = document.getElementById('details-content')
  if (!panel) return
  if (!data) {
    panel.innerHTML =
      `<h2 style="margin-top:0">WD34 published accounting</h2>` +
      `<p>Could not load <code>/data/wd34-accounting.json</code>. Re-run ` +
      `<code>python3 scripts/etl/fetch_wd34_accounting.py</code>.</p>` +
      `<p><a href="https://idwr.idaho.gov/wr-administration/water-rights-accounting/wd34/" target="_blank" rel="noopener">IDWR WD34 accounting page →</a></p>`
    return
  }

  const inflow = data.daily
    .map((d, i) => (d.inflowCfs != null ? { x: i + 1, y: d.inflowCfs } : null))
    .filter((p): p is { x: number; y: number } => p != null)
  const below = data.daily
    .map((d, i) => (d.decreeDelivery.belowMoore != null ? { x: i + 1, y: d.decreeDelivery.belowMoore } : null))
    .filter((p): p is { x: number; y: number } => p != null)
  const losses = data.daily
    .map((d, i) => (d.losses.decree != null ? { x: i + 1, y: d.losses.decree } : null))
    .filter((p): p is { x: number; y: number } => p != null)
  const arcoConv = data.daily
    .map((d, i) => (d.conveyance.arco != null ? { x: i + 1, y: (d.conveyance.arco as number) * 100 } : null))
    .filter((p): p is { x: number; y: number } => p != null)

  const sum = (xs: Array<number | null | undefined>) =>
    xs.reduce<number>((s, v) => s + (v || 0), 0)
  const belowSum = sum(data.daily.map(d => d.decreeDelivery.belowMoore))
  const lossSum = sum(data.daily.map(d => d.losses.decree))
  const inflowSum = sum(data.daily.map(d => d.inflowCfs))

  html =
    `<h2 style="margin-top:0">WD34 published accounting (${data.asOf})</h2>` +
    `<p style="font-size:0.85em;line-height:1.45;color:var(--text-muted)">${data.notes}</p>` +
    `<p style="font-size:0.85em">Season ${data.season.start} → ${data.season.end} · ${data.season.days} days. ` +
    `Workbook: <a href="${data.workbookUrl}" target="_blank" rel="noopener">storage results XLSX</a> · ` +
    `<a href="${data.sourcePage}" target="_blank" rel="noopener">IDWR WD34 page</a></p>` +
    `<p style="font-size:0.9em">Season totals (as published, cfs-days): ` +
    `inflow <strong>${inflowSum.toFixed(0)}</strong> · ` +
    `decree losses <strong>${lossSum.toFixed(0)}</strong> · ` +
    `decree delivery below Moore <strong>${belowSum.toFixed(0)}</strong></p>` +
    `<div id="acct-chart">` +
    svgChart({
      width: chartW(),
      height: 220,
      series: [
        { points: inflow, color: '#0ea5e9', label: 'inflow (cfs)', kind: 'line', width: 1.5 },
        { points: losses, color: '#b45309', label: 'decree losses (cfs)', kind: 'line' },
        { points: below, color: '#15803d', label: 'decree delivery below Moore (cfs)', kind: 'line', width: 2 },
      ],
        yLabel: 'cfs',
      }) + `</div>`
  html += `<p style="font-size:0.75em;color:var(--text-muted)">X axis is day of the published irrigation season (${data.season.start} = day 1).</p>`

  if (arcoConv.length) {
    html += `<div style="margin-top:8px">` +
      svgChart({
        width: chartW(),
        height: 150,
        series: [{ points: arcoConv, color: '#7c3aed', label: 'conveyance through Arco reach (×100 as published)', kind: 'line' }],
        yLabel: 'published factor ×100',
      }) + `</div>`
  }

  html += `<h3 style="margin:12px 0 6px">Named canals (season totals)</h3>` +
    `<p style="font-size:0.8em;color:var(--text-muted)">Labels from the IDWR workbook (Eastside, Westside, Island, Arco, Munsey, Moore, …). Not a liner inventory.</p>` +
    `<div style="overflow:auto;max-height:32vh"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead><tr>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Canal</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">WRA used ac-ft</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">SBW used ac-ft</th>` +
    `</tr></thead><tbody>`
  for (const c of data.canals) {
    html += `<tr>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border)">${c.canal}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${c.wraUsedAf != null ? c.wraUsedAf.toFixed(1) : '—'}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${c.sbwUsedAf != null ? c.sbwUsedAf.toFixed(1) : '—'}</td>` +
      `</tr>`
  }
  html += `</tbody></table></div><h3 style="margin:12px 0 6px">Source files</h3><ul style="font-size:0.8em;padding-left:1.1rem">`
  for (const f of data.files) {
    html += `<li>${f.available ? '' : '(not posted) '}<a href="${f.url}" target="_blank" rel="noopener">${f.title}</a></li>`
  }
  html += `</ul>${FOOT}PDFs are linked, not parsed. Daily values are the workbook columns, not USGS gage flow.</div>`

  openInspector(html, {
    wide: true,
    receipt: 'accounting',
    heading: 'WD34 accounting',
    reopen: () => { void showAccountingPanel() },
  })
}

export function showWatchlistPanel(store: DataStore, wrs: string[]) {
  let html =
    `<h2 style="margin-top:0">Local watchlist</h2>` +
    `<p style="font-size:0.85em;color:var(--text-muted)">Dev-only pin list from <code>private/watchlist.json</code>. ` +
    `Not included in production builds. Owner names come from the IDWR extract.</p>`
  if (!wrs.length) {
    html += `<p>No rights in the local watchlist. Copy <code>watchlist.example.json</code> to <code>private/watchlist.json</code>.</p>`
    openInspector(html, { wide: true, receipt: 'watchlist', heading: 'Local watchlist' })
    return
  }
  html += `<div style="overflow:auto;max-height:55vh"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead><tr>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Right</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Owner</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Year</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">cfs</th>` +
    `<th></th></tr></thead><tbody>`
  for (const wr of wrs) {
    const rec = store.podsByWR.get(wr)?.[0]
    html += `<tr>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border)"><code>${wr}</code></td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border)">${rec?.owner || '—'}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${rec?.year ?? '—'}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${rec ? rec.rate.toFixed(2) : '—'}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border)">` +
      (rec ? `<button type="button" class="zoom-btn" data-zoom-wr="${wr}">Zoom</button>` : 'not in extract') +
      `</td></tr>`
  }
  html += `</tbody></table></div>`
  html += `<p style="font-size:0.8em;margin-top:8px"><a href="${TRANSFER_SEARCH_URL}" target="_blank" rel="noopener">IDWR transfer search →</a></p>`
  openInspector(html, {
    wide: true,
    receipt: 'watchlist',
    heading: 'Local watchlist',
    reopen: () => showWatchlistPanel(store, wrs),
  })
}

export function wireExportButtons(store: DataStore) {
  document.getElementById('export-pods-csv')?.addEventListener('click', () => downloadVisiblePodsCsv(store))
  document.getElementById('export-wells-csv')?.addEventListener('click', () => downloadVisibleWellsCsv(store))
  document.getElementById('export-pods-geojson')?.addEventListener('click', () => downloadVisiblePodsGeoJson(store))
}
