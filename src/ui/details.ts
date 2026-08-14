import { DISTRICT_POU_KM2, NEW_GROUND_KM, CONFLICT_CORRIDOR_KM, TRANSFER_DIST_KM, type DataStore } from '../data'
import type { GeoFeature, PodRecord, WellRecord } from '../types'
import { ACCOUNTING_METHODOLOGY, loadAccounting, type AccountingExtract } from '../accounting'
import { gageChartsStory, gageRoleFromProps, gageRoleLabel } from '../map/gageRoles'
import {
  fetchDailyYear, fetchGageFlowHistory, fetchInstantaneousCfs,
  mergedYearSeries, pickOverlayYears, type GageFlowHistory,
} from '../usgs'
import { enhanceCharts, seriesFromPointsWithGaps, svgChart } from './chart'
import {
  DRY_REACH_METHODOLOGY,
  DRY_REACH_SENIOR_YEAR,
  dryReachSeniorsToCsv,
  downloadCsv,
  listDryReachSeniors,
} from '../dryReach'
import {
  MOVED_FARTHER_METHODOLOGY,
  listMovedFarther,
  movedFartherToCsv,
} from '../movedFarther'
import {
  LOWER_VALLEY_METHODOLOGY,
  listLowerValleySurface,
  lowerValleyToCsv,
} from '../lowerValley'
import { haversineKm, shouldIncludePouInFocus } from '../map/focusRight'
import { TRANSFER_SEARCH_URL } from '../wrLinks'

/** Chart width from the open inspector (map-adjacent, not a lightbox). */
function inspectorChartW(): number {
  const panel = document.getElementById('details')
  const w = panel?.clientWidth || 360
  return Math.max(240, Math.min(560, w - 28))
}

export type ReceiptKind = 'dry-reach' | 'moved-farther' | 'river-shrink' | 'appropriation' | 'lower-valley' | 'owners' | 'well-pressure' | 'accounting' | 'watchlist' | null

let activeReceipt: ReceiptKind = null
let receiptReopen: (() => void) | null = null
let detailsPinned = false

export function getActiveReceipt(): ReceiptKind {
  return activeReceipt
}

export function getReceiptReopen(): (() => void) | null {
  return receiptReopen
}

export function isDetailsPinned(): boolean {
  return detailsPinned
}

export function isDetailsOpen(): boolean {
  return !!document.getElementById('details')?.classList.contains('open')
}

export function highlightReceiptZoomRow(wr: string) {
  document.querySelectorAll<HTMLTableRowElement>('#details-content tr').forEach(tr => {
    const btn = tr.querySelector<HTMLElement>('[data-zoom-wr]')
    tr.classList.toggle('is-focused-right', !!btn && btn.dataset.zoomWr === wr)
  })
  document.querySelector('#details-content tr.is-focused-right')?.scrollIntoView({ block: 'nearest' })
}

/** Main-stem gages used in the Mackay → Moore → Arco step-down story (USGS NWIS coords). */
export const FLOW_STEP_GAGES = {
  mackay: { site: '13127000', name: 'Below Mackay Reservoir', lat: 43.93916667, lon: -113.6483333 },
  moore: { site: '13132100', name: 'Below Moore diversion', lat: 43.7843611, lon: -113.3608889 },
  mooreNear: { site: '13132000', name: 'Near Moore', lat: 43.78683056, lon: -113.35945 },
  arco: { site: '13132500', name: 'Near Arco', lat: 43.5822222, lon: -113.2705556 },
  sinks: { site: '13132565', name: 'Above Big Lost River Sinks', lat: 43.7233333, lon: -112.875 },
} as const

const ZERO_CFS = 0.5

export interface OpenInspectorOpts {
  wide?: boolean
  pinned?: boolean
  receipt?: ReceiptKind
  reopen?: () => void
  heading?: string
}

function open(html: string, opts: OpenInspectorOpts = {}) {
  const panel = document.getElementById('details')!
  const content = document.getElementById('details-content')!
  const heading = document.getElementById('details-heading')
  content.innerHTML = html
  panel.classList.add('open')
  panel.classList.toggle('wide', !!opts.wide)
  panel.classList.toggle('receipt', !!opts.receipt || !!opts.wide)
  detailsPinned = opts.pinned === true || !!opts.receipt
  activeReceipt = opts.receipt ?? null
  receiptReopen = opts.reopen ?? (opts.receipt ? () => open(html, opts) : null)
  if (heading) heading.textContent = opts.heading || (opts.receipt ? 'Receipt' : 'Inspector')
  enhanceCharts(content)
}

/** Used by Advanced observer receipts in observerPanels.ts */
export { open as openInspector }

export function closeDetails() {
  document.getElementById('details')?.classList.remove('open', 'wide', 'receipt')
  detailsPinned = false
  activeReceipt = null
  receiptReopen = null
  const heading = document.getElementById('details-heading')
  if (heading) heading.textContent = 'Inspector'
}

const FOOT = `<div style="margin-top:6px;font-size:0.7em;color:var(--text-muted)">`

export function showPodDetails(rec: PodRecord, store: DataStore, opts?: { fromReceipt?: boolean }) {
  const keepReceipt = !!opts?.fromReceipt && !!receiptReopen
  const reopen = receiptReopen
  const receipt = activeReceipt
  const p = rec.feature.properties
  let html = ''
  if (keepReceipt) {
    html += `<button type="button" class="zoom-btn" data-back-receipt style="margin-bottom:8px">← Back to list</button>`
  }
  html += `<h3 style="margin-top:0">Water Right ${rec.wr || p.OBJECTID || ''}</h3>`
  if (rec.year != null) html += priorityBadge(rec.year)
  if (store.transferDistKm.has(rec.wr)) html += transferBadge(store.transferDistKm.get(rec.wr)!)
  if (rec.mainstemDistKm > CONFLICT_CORRIDOR_KM) {
    html += `<span class="badge" title="POD is ${rec.mainstemDistKm.toFixed(1)} km from the NHD Big Lost mainstem — excluded from the dry-reach seniors table">${rec.mainstemDistKm.toFixed(1)} km off Big Lost mainstem</span>`
  }
  html += `<div style="margin-top:6px">`
  if (rec.owner) html += `<div><strong>Owner:</strong> ${rec.owner}</div>`
  if (rec.source) html += `<div><strong>Source:</strong> ${rec.source}</div>`
  if (rec.year != null) html += `<div><strong>Priority year:</strong> ${rec.year}</div>`
  if (p.OverallMaxDiversionRate != null) html += `<div><strong>Max diversion rate:</strong> ${p.OverallMaxDiversionRate} cfs</div>`
  if (p.Uses) html += `<div><strong>Uses:</strong> ${p.Uses}</div>`
  if (p.DiversionName) html += `<div><strong>Diversion:</strong> ${p.DiversionName}</div>`
  if (p.Status) html += `<div><strong>Status:</strong> ${p.Status}</div>`
  html += `</div>`
  const pouCount = (store.pousByWR.get(rec.wr) || []).length
  if (pouCount > 0) {
    html += `<div style="margin-top:4px;font-size:0.85em">${pouCount} Place of Use polygon${pouCount > 1 ? 's' : ''} — cyan outline + dashed line on map.</div>`
    const pouCenter = store.pouCenter.get(rec.wr)
    if (pouCenter && !shouldIncludePouInFocus(rec, pouCenter)) {
      const km = Math.round(haversineKm(rec.lat, rec.lon, pouCenter[0], pouCenter[1]))
      html += `<div style="margin-top:4px;font-size:0.85em">Place of use is ${km} km from this diversion (dashed line).</div>`
    }
    html += `<button class="zoom-btn" data-zoom-wr="${rec.wr}">Zoom to right (POD + place of use)</button>`
  }
  if (p.WRReport) html += `<div style="margin-top:4px"><a href="${p.WRReport}" target="_blank" rel="noopener">Official Water Right Report →</a></div>`
  html += `<div style="margin-top:4px"><a href="${TRANSFER_SEARCH_URL}" target="_blank" rel="noopener">IDWR transfer records search →</a></div>`
  html += `${FOOT}Data: IDWR WaterRightPods (Basin 34 / WD34). PriorityDate is the authoritative seniority field.</div>`
  open(html, {
    heading: rec.wr ? `Right ${rec.wr}` : 'Water right',
    receipt: keepReceipt ? receipt : null,
    reopen: keepReceipt ? reopen ?? undefined : undefined,
    pinned: keepReceipt,
  })
}

export function showWellDetails(rec: WellRecord) {
  const p = rec.feature.properties
  let html = `<h3 style="margin-top:0">Well ${p.WellID || p.OBJECTID || ''}</h3>`
  if (p.Owner) html += `<div><strong>Owner:</strong> ${p.Owner}</div>`
  if (p.WellUse) html += `<div><strong>Use:</strong> ${p.WellUse}</div>`
  if (p.TotalDepth != null) html += `<div><strong>Total depth:</strong> ${p.TotalDepth} ft</div>`
  if (p.StaticWaterLevel != null) html += `<div><strong>Static water level:</strong> ${p.StaticWaterLevel} ft</div>`
  if (p.ProductionRate != null) html += `<div><strong>Production rate:</strong> ${p.ProductionRate} gpm</div>`
  if (p.CountyName) html += `<div><strong>County:</strong> ${p.CountyName}</div>`
  if (rec.year != null) html += `<div><strong>Constructed:</strong> ~${rec.year}</div>`
  if (p.WellDocs) html += `<div><a href="${p.WellDocs}" target="_blank" rel="noopener">View full Well Docs →</a></div>`
  html += `${FOOT}Data: IDWR Wells (Basin 34 / WD34 filtered). Wells carry construction dates; <strong>priority dates</strong> belong to water rights (PODs layer or <a href="https://research.idwr.idaho.gov/apps/shared/WrExtSearch/WaterRightsSearch" target="_blank" rel="noopener">IDWR Water Rights Search</a>).</div>`
  open(html)
}

/** Details for a clicked POU polygon: every right sharing it, as compact cards. */
export function showPouGroupDetails(wrs: Set<string>, clicked: GeoFeature, store: DataStore) {
  let html = `<h3 style="margin-top:0">Place of Use</h3>`
  const props = clicked.properties || {}
  const areaKm2: number = props.__areaKm2 ?? 0
  if (areaKm2 >= DISTRICT_POU_KM2) {
    html += `<div class="badge">district / service area — ${Math.round(areaKm2 * 247.1).toLocaleString()} acres</div>` +
      `<div style="font-size:0.8em;color:var(--text-muted);margin:4px 0">This right's authorized place of use is an entire service area, not an individual field. It is drawn as an outline so the fields inside stay visible.</div>`
  } else if (props.TotalAcres == null && areaKm2 > 0) {
    html += `<div><strong>Area:</strong> ~${Math.round(areaKm2 * 247.1).toLocaleString()} acres</div>`
  }
  if (props.TotalAcres != null) html += `<div><strong>Total acres:</strong> ${props.TotalAcres}</div>`
  if (props.WaterUse) html += `<div><strong>Water use:</strong> ${props.WaterUse}</div>`
  html += `<div style="margin:6px 0"><strong>${wrs.size} associated water right${wrs.size > 1 ? 's' : ''}:</strong></div>`

  // Sort by priority year so the most senior right leads the list
  const sorted = Array.from(wrs).sort((a, b) => {
    const ya = store.podsByWR.get(a)?.[0]?.year ?? 9999
    const yb = store.podsByWR.get(b)?.[0]?.year ?? 9999
    return ya - yb
  })

  for (const wr of sorted) {
    const pods = store.podsByWR.get(wr) || []
    if (!pods.length) {
      html += `<div class="wr-card">${wr} <span style="opacity:0.7">(no POD in current data)</span></div>`
      continue
    }
    const rec = pods[0]
    const p = rec.feature.properties
    html += `<div class="wr-card">`
    html += `<div class="wr-card-head"><strong>${wr}</strong>${pods.length > 1 ? ` <span style="font-size:0.8em;opacity:0.7">(${pods.length} PODs)</span>` : ''}`
    if (rec.year != null) html += priorityBadge(rec.year)
    html += `</div>`
    if (rec.owner) html += `Owner: ${rec.owner}<br>`
    if (rec.source) html += `Source: ${rec.source}<br>`
    if (p.OverallMaxDiversionRate != null) html += `Max rate: ${p.OverallMaxDiversionRate} cfs<br>`
    const dist = store.transferDistKm.get(wr)
    if (dist != null) html += transferBadge(dist)
    html += `<div style="margin-top:2px">`
    html += `<button class="zoom-btn" data-zoom-wr="${wr}">Zoom to POD</button>`
    if (p.WRReport) html += ` <a href="${p.WRReport}" target="_blank" rel="noopener">Full report →</a>`
    html += `</div></div>`
  }
  html += `${FOOT}Dashed cyan lines connect this field to its point(s) of diversion. Click the map background or press Esc to clear.</div>`
  open(html)
}

/** Gage details: live CFS + role-based chart (or redirect to river shrink). */
export function showGageDetails(feature: GeoFeature) {
  const p = feature.properties || {}
  const role = gageRoleFromProps(p.site_no, p)
  let html = `<h3 style="margin-top:0">${p.name || 'Stream gage'}</h3>`
  if (p.site_no) html += `<div class="badge">USGS ${p.site_no}</div> `
  html += `<div class="badge">${gageRoleLabel(role)}</div>`
  if (p.notes) html += `<div style="margin:6px 0;font-size:0.85em">${p.notes}</div>`
  if (p.historical_summary) html += `<div style="margin:6px 0;font-size:0.85em"><em>${p.historical_summary}</em></div>`

  if (gageChartsStory(role)) {
    html += `<div id="gage-live" style="margin:8px 0;padding:8px 10px;border-left:3px solid #0ea5e9;background:rgba(14,165,233,0.08);font-size:0.9em">Loading current flow…</div>`
    html += `<div id="gage-chart" style="margin:8px 0;font-size:0.8em;color:var(--text-muted)">Loading days-with-flow from USGS NWIS…</div>`
  } else {
    html += `<div style="margin:8px 0;padding:8px 10px;border-left:3px solid #d97706;background:rgba(217,119,06,0.08);font-size:0.85em">`
    if (role === 'archive') {
      html += `<strong>Record ends 2018 — gage discontinued.</strong> This site is a historical waypoint (water sometimes reached the sinks limb), not a current hydrograph.`
    } else {
      html += `<strong>No useful annual discharge series here.</strong> NWIS has a one-year statistic, stage-only, or no public 00060 record. This pin is geography — the story chart is river shrink.`
    }
    html += `</div>`
  }
  html += `<button class="zoom-btn" data-show-shrink style="margin:4px 0">Open river shrink: Mackay → Moore → Arco</button><br>`
  if (p.url) html += `<a href="${p.url}" target="_blank" rel="noopener">Open full USGS page →</a>`
  html += `${FOOT}Gages are waypoints. Days-with-flow (not calendar-year mean) is the lead series so a two-week pulse does not look like year-round water. Neutral visualization only.</div>`
  open(html, { wide: true, heading: p.name || 'Stream gage', pinned: false })

  if (!gageChartsStory(role) || !p.site_no) {
    const live = document.getElementById('gage-live')
    if (live && !p.site_no) live.textContent = 'No USGS site number on this gage.'
    return
  }

  fetchInstantaneousCfs(p.site_no)
    .then(iv => {
      const el = document.getElementById('gage-live')
      if (!el) return
      if (!iv) {
        el.innerHTML = `No instantaneous discharge reported right now — check the <a href="${p.url || `https://waterdata.usgs.gov/nwis/uv?site_no=${p.site_no}`}" target="_blank" rel="noopener">USGS page</a> or the chart below.`
        return
      }
      const when = iv.dateTime
        ? new Date(iv.dateTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        : 'time unknown'
      el.innerHTML =
        `<strong style="font-size:1.15em;color:#0369a1">${iv.cfs.toFixed(1)} cfs</strong> ` +
        `<span style="color:var(--text-muted)">current · ${when}</span>` +
        (iv.qualifiers ? `<div style="font-size:0.8em;color:var(--text-muted);margin-top:2px">${iv.qualifiers}</div>` : '')
    })
    .catch(() => {
      const el = document.getElementById('gage-live')
      if (el) {
        el.innerHTML = `Could not load live flow — <a href="${p.url || `https://waterdata.usgs.gov/nwis/uv?site_no=${p.site_no}`}" target="_blank" rel="noopener">view on USGS</a>.`
      }
    })

  fetchGageFlowHistory(p.site_no)
    .then(history => renderGageChart(role, history))
    .catch(() => {
      const el = document.getElementById('gage-chart')
      if (el) el.innerHTML = `Could not load NWIS statistics right now — <a href="${p.url || `https://waterdata.usgs.gov/nwis/uv?site_no=${p.site_no}`}" target="_blank" rel="noopener">view on USGS</a>.`
    })
}

function renderGageChart(
  role: ReturnType<typeof gageRoleFromProps>,
  history: GageFlowHistory,
) {
  const el = document.getElementById('gage-chart')
  if (!el) return
  const series = mergedYearSeries(history)
  const currentYear = new Date().getFullYear()

  if (series.length === 0) {
    el.style.color = 'inherit'
    el.innerHTML =
      `<div style="font-size:0.85rem;padding:6px 10px;border-left:3px solid #d97706;background:rgba(217,119,6,0.08)">` +
      `<strong style="color:#b45309">No daily or annual discharge in USGS NWIS for this site.</strong> ` +
      `Open river shrink for the Mackay → Moore → Arco record.` +
      `</div>`
    return
  }

  const firstY = series[0].year
  const lastY = series[series.length - 1].year
  const discontinued = lastY < currentYear - 2
  const sparse = series.length < 5
  const zeroYears = series.filter(d => d.cfs <= ZERO_CFS)
  const daysSeries = series.filter(d => d.daysWithFlow != null)
  const irrigSeries = series.filter(d => d.irrigationDaysWithFlow != null)

  let html = ''
  if (role === 'remnant') {
    const zeroPct = Math.round((zeroYears.length / series.length) * 100)
    html += `<div style="font-size:0.85rem;margin-bottom:6px;padding:4px 8px;border-left:3px solid #dc2626;background:rgba(220,38,38,0.08)">` +
      `<strong style="color:#dc2626">${zeroYears.length} of ${series.length} years (${zeroPct}%) had a near-zero annual mean</strong> ` +
      `(${firstY}–${lastY}). Days-with-flow below is the honest series — a brief pulse still plots as a few days, not “a little water all year.”` +
      `</div>`
  } else if (role === 'terminus' || sparse) {
    html += `<div style="font-size:0.85rem;margin-bottom:4px;color:var(--text-muted)">` +
      `${sparse ? `Short record — ${series.length} year${series.length === 1 ? '' : 's'} (${firstY}–${lastY}). ` : ''}` +
      `This is the terminus gage: days-with-flow shows when surface water still passed Moore, not a long annual-mean story.` +
      `</div>`
  } else {
    html += `<div style="font-size:0.85rem;margin-bottom:4px;color:var(--text-muted)">` +
      `Mackay is basin yield. Days-with-flow and irrigation-season (Apr–Oct) days sit above calendar-year mean so wet pulses are not mistaken for sustained flow.` +
      `</div>`
  }
  if (discontinued) {
    html += `<div style="font-size:0.85rem;margin:4px 0;padding:4px 8px;border-left:3px solid #d97706;background:rgba(217,119,6,0.08)">` +
      `<strong style="color:#b45309">Record ends ${lastY} — gage discontinued.</strong></div>`
  }

  if (daysSeries.length) {
    html += svgChart({
      width: inspectorChartW(),
      height: role === 'remnant' ? 260 : 220,
      series: [
        ...seriesFromPointsWithGaps(
          daysSeries.map(d => ({ x: d.year, y: d.daysWithFlow! })),
          { color: '#0ea5e9', label: 'days with flow', kind: 'line', width: 2 },
        ),
        ...(irrigSeries.length
          ? seriesFromPointsWithGaps(
            irrigSeries.map(d => ({ x: d.year, y: d.irrigationDaysWithFlow! })),
            { color: '#c2410c', label: 'Apr–Oct days with flow', kind: 'line' },
          )
          : []),
      ],
      yLabel: 'days',
      yMax: 366,
    })
  }

  html += `<p style="font-size:0.75em;color:var(--text-muted);margin:8px 0 4px">Calendar-year mean (secondary — a two-week pulse still averages near zero).</p>`
  html += svgChart({
    width: inspectorChartW(),
    height: 160,
    series: seriesFromPointsWithGaps(
      series.map(d => ({ x: d.year, y: d.cfs })),
      { color: '#64748b', label: `annual mean ${firstY}–${lastY}`, kind: 'area' },
    ),
    markers: zeroYears.map(d => ({
      x: d.year,
      y: d.cfs,
      color: '#dc2626',
      title: `${d.year}: ${d.cfs} cfs${d.daysWithFlow != null ? ` — flow on ${d.daysWithFlow}/${d.daysWithData} days` : ''}`,
    })),
    yLabel: 'cfs (calendar-year mean)',
  })
  el.innerHTML = html
  el.style.color = 'inherit'
  enhanceCharts(el)
}

/** Ranked table + CSV: water moved farther (geometric POD↔POU / off-corridor proxy). */
export function showTransfersOverview(store: DataStore) {
  const rows = listMovedFarther(store)
  const offCount = rows.filter(r => r.offCorridor).length
  const totalCfs = rows.reduce((s, r) => s + r.rate, 0)

  let html =
    `<h2 style="margin-top:0">Water moved farther</h2>` +
    `<p style="font-size:0.85em;line-height:1.45;color:var(--text-muted)">${MOVED_FARTHER_METHODOLOGY}</p>` +
    `<p style="font-size:0.9em"><strong>${rows.length}</strong> rights · ` +
    `<strong>${offCount}</strong> off-corridor · ` +
    `<strong>${totalCfs.toFixed(1)}</strong> cfs combined max diversion</p>` +
    `<div style="font-size:0.85em;margin:8px 0;padding:6px 10px;border-left:3px solid #ea580c;background:rgba(234,88,12,0.08)">` +
    `<strong style="color:#c2410c">On satellite:</strong> look for lined canals carrying water east or west of the river onto newer ground. ` +
    `Orange POU fills are a geometric off-corridor flag — many flagged rights have senior priority dates; ` +
    `this is <em>not</em> a count of canals built in the last 10–15 years, and NHD does not mark liners.</div>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0">` +
    `<button type="button" id="moved-farther-csv" class="zoom-btn">Download CSV</button>` +
    `<label style="font-size:0.8em;display:flex;align-items:center;gap:6px;flex:1;min-width:180px">` +
    `Filter owner ` +
    `<input id="moved-farther-owner-filter" type="search" placeholder="Type any owner name…" ` +
    `style="flex:1;min-width:140px;padding:6px 8px;border:1px solid var(--border-strong);border-radius:4px;background:var(--control-bg);color:var(--text)" />` +
    `</label>` +
    `</div>` +
    `<p id="moved-farther-filter-status" style="font-size:0.8em;color:var(--text-muted);min-height:1.2em"></p>`

  if (!rows.length) {
    html += `<p>No POD↔POU distance flags yet. Wait for Place of Use enrichment to finish, then retry.</p>`
    open(html, { wide: true, receipt: 'moved-farther', heading: 'Water moved farther', reopen: () => showTransfersOverview(store) })
    return
  }

  html += `<div style="overflow:auto;max-height:55vh"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead><tr>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">#</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Right</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Owner</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Year</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">POD↔POU km</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Off corridor</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">POU side</th>` +
    `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)"></th>` +
    `</tr></thead><tbody id="moved-farther-tbody">`

  const renderRows = (list: typeof rows) => {
    const max = 200
    let body = ''
    for (let i = 0; i < Math.min(list.length, max); i++) {
      const r = list[i]
      const rank = rows.indexOf(r) + 1
      body += `<tr>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right;color:var(--text-muted)">${rank}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)"><code>${r.wr}</code></td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.owner || '—'}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.year ?? '—'}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.podPouKm.toFixed(1)}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">${
          r.offCorridor
            ? `<span class="badge badge-newground" title="POU ${r.corridorKm?.toFixed(1) ?? '?'} km from corridor">yes · ${r.corridorKm?.toFixed(1) ?? '?'} km</span>`
            : '—'
        }</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.pouSide === 'unknown' ? '—' : r.pouSide}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">` +
        `<button type="button" class="zoom-btn" data-zoom-wr="${r.wr}">Zoom</button></td>` +
        `</tr>`
    }
    if (!list.length) {
      body = `<tr><td colspan="8" style="padding:12px;color:var(--text-muted)">No rights match that owner filter.</td></tr>`
    }
    return { body, truncated: list.length > max }
  }

  const initial = renderRows(rows)
  html += initial.body
  html += `</tbody></table></div>`
  html += `<p id="moved-farther-truncate-note" style="font-size:0.8em;color:var(--text-muted)">${
    initial.truncated ? `Showing top 200 of ${rows.length}. CSV includes all.` : ''
  }</p>`
  html += `<p style="font-size:0.75em;color:var(--text-muted);margin-top:8px">` +
    `IDWR serves current POU geometry only. Original (pre-change) places of use need IDWR transfer records (linked from each right’s report). ` +
    `Threshold: &gt;${TRANSFER_DIST_KM} km POD↔POU; off-corridor &gt;${NEW_GROUND_KM} km.</p>`

  open(html, { wide: true, receipt: 'moved-farther', heading: 'Water moved farther', reopen: () => showTransfersOverview(store) })

  document.getElementById('moved-farther-csv')?.addEventListener('click', () => {
    const q = (document.getElementById('moved-farther-owner-filter') as HTMLInputElement | null)?.value.trim().toLowerCase() || ''
    const exportRows = q ? rows.filter(r => r.owner.toLowerCase().includes(q)) : rows
    downloadCsv('basin34-water-moved-farther.csv', movedFartherToCsv(exportRows))
  })

  const input = document.getElementById('moved-farther-owner-filter') as HTMLInputElement | null
  const tbody = document.getElementById('moved-farther-tbody')
  const status = document.getElementById('moved-farther-filter-status')
  const note = document.getElementById('moved-farther-truncate-note')
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    const filtered = q ? rows.filter(r => r.owner.toLowerCase().includes(q)) : rows
    const rendered = renderRows(filtered)
    if (tbody) tbody.innerHTML = rendered.body
    if (status) {
      status.textContent = q
        ? `${filtered.length} right${filtered.length === 1 ? '' : 's'} matching “${input.value.trim()}”`
        : ''
    }
    if (note) {
      note.textContent = rendered.truncated ? `Showing top 200 of ${filtered.length}. CSV follows the filter.` : ''
    }
  })
}

/** All rights delivered through one named diversion (canal/ditch system). */
export function showDiversionDetails(
  d: { name: string; totalRate: number; rightWRs: string[]; earliestYear: number | null },
  store: DataStore,
) {
  let html = `<h3 style="margin-top:0">${d.name}</h3>`
  html += `<div style="font-size:0.85em;margin-bottom:6px"><strong>${d.rightWRs.length} water rights</strong> · ` +
    `<strong>${d.totalRate.toFixed(1)} cfs</strong> total authorized` +
    (d.earliestYear != null ? ` · earliest priority <strong>${d.earliestYear}</strong>` : '') + `</div>`

  const sorted = [...d.rightWRs].sort((a, b) => {
    const ya = store.podsByWR.get(a)?.[0]?.year ?? 9999
    const yb = store.podsByWR.get(b)?.[0]?.year ?? 9999
    return ya - yb
  })
  for (const wr of sorted.slice(0, 40)) {
    const rec = store.podsByWR.get(wr)?.[0]
    if (!rec) continue
    const p = rec.feature.properties
    html += `<div class="wr-card"><div class="wr-card-head"><strong>${wr}</strong>`
    if (rec.year != null) html += priorityBadge(rec.year)
    html += `</div>`
    if (rec.owner) html += `${rec.owner}<br>`
    if (p.OverallMaxDiversionRate != null) html += `Max rate: ${p.OverallMaxDiversionRate} cfs<br>`
    html += `<button class="zoom-btn" data-zoom-wr="${wr}">Zoom to right</button></div>`
  }
  if (sorted.length > 40) html += `<div style="font-size:0.75em;color:var(--text-muted)">First 40 of ${sorted.length} rights shown (sorted senior → junior).</div>`
  html += `${FOOT}Aggregated from the IDWR POD “DiversionName” field for surface-water rights. Rates are counted once per right.</div>`
  open(html)
}

/** Basin-wide cumulative appropriation vs. measured supply. */
export async function showAppropriationPanel(store: DataStore) {
  // One rate per right (multiple PODs share the right's authorized rate)
  const rights: Array<{ year: number; rate: number; isGW: boolean }> = []
  store.podsByWR.forEach(pods => {
    const r = pods[0]
    if (r.year != null) rights.push({ year: r.year, rate: r.rate, isGW: r.isGW })
  })
  rights.sort((a, b) => a.year - b.year)

  const cumAll: { x: number; y: number }[] = []
  const cumGW: { x: number; y: number }[] = []
  const cumSurf: { x: number; y: number }[] = []
  let tot = 0, gw = 0, surf = 0
  for (const r of rights) {
    tot += r.rate
    if (r.isGW) gw += r.rate
    else surf += r.rate
    cumAll.push({ x: r.year, y: tot })
    cumGW.push({ x: r.year, y: gw })
    cumSurf.push({ x: r.year, y: surf })
  }

  let html = `<h3 style="margin-top:0">Appropriation over time</h3>`
  html += `<div style="font-size:0.85em;margin-bottom:4px">Cumulative <strong>authorized</strong> maximum diversion rate of all ${rights.length.toLocaleString()} dated Basin 34 rights, by priority year — currently <strong>${Math.round(tot).toLocaleString()} cfs</strong> (${Math.round(surf).toLocaleString()} surface + ${Math.round(gw).toLocaleString()} groundwater).</div>`
  html += `<div id="appropriation-chart">`
  html += svgChart({
    width: inspectorChartW(),
    height: 240,
    series: [
      { points: cumAll, color: '#64748b', label: 'all rights (cumulative cfs)', kind: 'step', width: 2 },
      { points: cumSurf, color: '#0ea5e9', label: 'surface', kind: 'step' },
      { points: cumGW, color: '#6d28d9', label: 'groundwater', kind: 'step' },
    ],
    yLabel: 'authorized cfs (cumulative)',
  })
  html += `</div>`
  html += `<div id="appropriation-supply" style="font-size:0.8em;color:var(--text-muted);margin-top:6px">Loading measured yield at Mackay (USGS 13127000)…</div>`
  html += `${FOOT}Authorized maximum rates are not the same as actual use (rights are limited by supply, priority administration, and season). Mackay is basin yield; Arco is the remnant that still arrives downstream — not a second copy of the same comparison. Data: IDWR PriorityDate + OverallMaxDiversionRate; USGS NWIS.</div>`
  open(html, { wide: true })

  try {
    const [mackayH, arcoH] = await Promise.all([
      fetchGageFlowHistory(FLOW_STEP_GAGES.mackay.site),
      fetchGageFlowHistory(FLOW_STEP_GAGES.arco.site),
    ])
    const el = document.getElementById('appropriation-supply')
    if (!el) return
    const mackayS = mergedYearSeries(mackayH)
    const arcoS = mergedYearSeries(arcoH)
    if (!mackayS.length) {
      el.textContent = 'Could not load Mackay yield statistics right now.'
      return
    }
    const mackayMean = mackayS.reduce((s, d) => s + d.cfs, 0) / mackayS.length
    el.style.color = 'inherit'
    el.innerHTML =
      `<div style="font-size:0.85rem">Paper rights vs <strong>Mackay yield</strong> (the water that exists), not vs Arco remnant. ` +
      `Long-term Mackay mean ${mackayMean.toFixed(0)} cfs (${mackayS[0].year}–${mackayS[mackayS.length - 1].year}). ` +
      `Authorized max is a different quantity from measured flow.</div>` +
      svgChart({
        width: inspectorChartW(),
        height: 170,
        series: [{
          points: mackayS.map(d => ({ x: d.year, y: d.cfs })),
          color: '#0ea5e9',
          label: 'Mackay annual mean (cfs)',
          kind: 'area',
        }],
        refLines: [{ y: mackayMean, color: '#64748b', label: `Mackay mean ${mackayMean.toFixed(0)}` }],
        yLabel: 'cfs',
      }) +
      (arcoS.length
        ? `<p style="font-size:0.8em;margin:10px 0 4px">What still arrives at Arco (days with flow — remnant, not supply):</p>` +
          svgChart({
            width: inspectorChartW(),
            height: 150,
            series: seriesFromPointsWithGaps(
              arcoS.filter(d => d.daysWithFlow != null).map(d => ({ x: d.year, y: d.daysWithFlow! })),
              { color: '#dc2626', label: 'Arco days with flow', kind: 'line', width: 1.8 },
            ),
            yLabel: 'days',
            yMax: 366,
          })
        : '')
    enhanceCharts(el)
  } catch {
    const el = document.getElementById('appropriation-supply')
    if (el) el.textContent = 'Could not load USGS flow statistics right now.'
  }
}

/** River shrink: step-down at Mackay, Moore, and Arco on the main stem (full historical record). */
export async function showReachLossPanel() {
  const { mackay, moore, arco } = FLOW_STEP_GAGES

  let html = `<h3 style="margin-top:0">River shrink: Mackay → Moore → Arco</h3>`
  html += `<div style="font-size:0.85em;margin-bottom:6px">Days-with-flow at Arco vs yield at Mackay is the honest shrink story — calendar-year mean hides brief pulses. ` +
    `Moore below diversion has a short daily record (2019+). This-season WD34 accounting (below-Moore delivery) sits at the bottom.` +
    `</div>`
  html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;font-size:0.75em">` +
    `<button class="zoom-btn" data-zoom-gage="${mackay.site}">Zoom: Mackay</button>` +
    `<button class="zoom-btn" data-zoom-gage="${moore.site}">Zoom: Moore div</button>` +
    `<button class="zoom-btn" data-zoom-gage="${arco.site}">Zoom: Arco</button>` +
    `<button class="zoom-btn" data-zoom-gage="${FLOW_STEP_GAGES.sinks.site}">Zoom: Sinks (Howe)</button>` +
    `</div>`
  html += `<div id="shrink-chart" style="font-size:0.8em;color:var(--text-muted)">Loading full gage histories from USGS NWIS (daily + annual)…</div>`
  html += `<div id="shrink-overlay"></div>`
  html += `<div id="shrink-accounting"></div>`
  html += `${FOOT}Days-with-flow and irrigation-season days from USGS NWIS daily values. Calendar-year mean is secondary. WD34 figures are as published in the storage-results workbook — not a shutoff roster. Neutral mass-balance view.</div>`
  open(html, { wide: true })

  try {
    const [mackayH, mooreH, arcoH] = await Promise.all([
      fetchGageFlowHistory(mackay.site),
      fetchGageFlowHistory(moore.site),
      fetchGageFlowHistory(arco.site),
    ])
    const el = document.getElementById('shrink-chart')
    if (!el) return

    const mackayS = mergedYearSeries(mackayH)
    const mooreS = mergedYearSeries(mooreH)
    const arcoS = mergedYearSeries(arcoH)
    const mooreMap = new Map(mooreS.map(d => [d.year, d.cfs]))
    const arcoMap = new Map(arcoS.map(d => [d.year, d.cfs]))

    // Every year Mackay has data; attach Moore/Arco when available (full history, not truncated).
    const joined = mackayS.map(d => ({
      year: d.year,
      mackay: d.cfs,
      moore: mooreMap.get(d.year),
      arco: arcoMap.get(d.year),
    }))
    const mackayArco = joined.filter(d => d.arco != null)
    if (mackayArco.length < 6) {
      el.textContent = 'Not enough overlapping years between Mackay and Arco.'
      return
    }

    const n = Math.max(5, Math.min(15, Math.floor(mackayArco.length / 3)))
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length
    const reachArco = (d: typeof joined[0]) => d.mackay > 0 && d.arco != null ? (d.arco / d.mackay) * 100 : 0
    const earlySlice = mackayArco.slice(0, n)
    const lateSlice = mackayArco.slice(-n)
    const earlyArcoPct = mean(earlySlice.map(reachArco))
    const lateArcoPct = mean(lateSlice.map(reachArco))
    const earlyYears = `${earlySlice[0].year}–${earlySlice[earlySlice.length - 1].year}`
    const lateYears = `${lateSlice[0].year}–${lateSlice[lateSlice.length - 1].year}`
    const lateArcoZeros = lateSlice.filter(d => (d.arco ?? 0) <= ZERO_CFS).length

    const mooreYears = joined.filter(d => d.moore != null)
    let mooreTableHtml = ''
    if (mooreYears.length >= 1) {
      const avgMoorePct = mean(mooreYears.map(d => d.mackay > 0 ? (d.moore! / d.mackay) * 100 : 0))
      mooreTableHtml =
        `<div style="font-size:0.85rem;margin:8px 0;padding:6px 10px;border-left:3px solid #f97316;background:rgba(249,115,22,0.08)">` +
        `<strong style="color:#c2410c">Moore below diversion (${mooreYears[0].year}–${mooreYears[mooreYears.length - 1].year}, ${mooreYears.length} yrs from daily record):</strong> ` +
        `on average <strong>${avgMoorePct.toFixed(0)}%</strong> of Mackay release reaches Moore; ` +
        `${mooreYears.filter(d => (d.arco ?? 0) <= ZERO_CFS).length} of those years had zero flow at Arco.</div>` +
        `<details style="font-size:0.75rem;margin:6px 0"><summary style="cursor:pointer">Year-by-year table (all ${mooreYears.length} Moore years + full Mackay/Arco overlap)</summary>` +
        `<table style="width:100%;font-size:0.75rem;border-collapse:collapse;margin-top:4px">` +
        `<tr style="border-bottom:1px solid var(--border)"><th>Year</th><th>Mackay</th><th>Moore</th><th>Arco</th><th>%→Moore</th><th>%→Arco</th></tr>` +
        mooreYears.map(d => {
          const pctM = d.mackay > 0 ? (d.moore! / d.mackay * 100).toFixed(0) : '—'
          const pctA = d.arco != null && d.mackay > 0 ? (d.arco / d.mackay * 100).toFixed(0) : '—'
          const arcoZero = d.arco != null && d.arco <= ZERO_CFS ? ' style="color:#dc2626;font-weight:600"' : ''
          return `<tr style="border-bottom:1px solid var(--border)"><td>${d.year}</td>` +
            `<td>${d.mackay.toFixed(0)}</td><td>${d.moore!.toFixed(1)}</td>` +
            `<td${arcoZero}>${d.arco != null ? d.arco.toFixed(2) : '—'}</td><td>${pctM}%</td><td${arcoZero}>${pctA}${d.arco != null ? '%' : ''}</td></tr>`
        }).join('') +
        `</table></details>`
    }

    const arcoZeroMarkers = mackayArco
      .filter(d => (d.arco ?? 0) <= ZERO_CFS)
      .map(d => ({ x: d.year, y: d.arco!, color: '#dc2626', title: `${d.year}: Arco ${d.arco} cfs — zero annual mean` }))

    const pctSeries = [
      ...seriesFromPointsWithGaps(
        mackayArco.map(d => ({ x: d.year, y: reachArco(d) })),
        { color: '#16a34a', label: '% of Mackay reaching Arco', kind: 'line', width: 1.8 },
      ),
      ...seriesFromPointsWithGaps(
        mooreYears.map(d => ({ x: d.year, y: d.mackay > 0 ? (d.moore! / d.mackay) * 100 : 0 })),
        { color: '#f97316', label: '% of Mackay reaching Moore', kind: 'line', width: 1.8 },
      ),
    ]

    el.style.color = 'inherit'
    el.innerHTML =
      `<div style="font-size:0.85rem;margin-bottom:6px">` +
      `<strong>Mackay → Arco</strong> (${mackayArco[0].year}–${mackayArco[mackayArco.length - 1].year}, ${mackayArco.length} overlapping years): ` +
      `${earlyYears}: <strong>${earlyArcoPct.toFixed(0)}%</strong> of Mackay flow reached Arco; ` +
      `${lateYears}: <strong style="color:#dc2626">${lateArcoPct.toFixed(0)}%</strong> ` +
      `(${lateArcoZeros} of those ${n} years had zero at Arco).</div>` +
      mooreTableHtml +
      svgChart({
        width: inspectorChartW(),
        height: 300,
        series: [
          ...seriesFromPointsWithGaps(
            joined.map(d => ({ x: d.year, y: d.mackay })),
            { color: '#0ea5e9', label: 'Mackay (cfs)', kind: 'line', width: 2 },
          ),
          ...seriesFromPointsWithGaps(
            mooreYears.map(d => ({ x: d.year, y: d.moore! })),
            { color: '#f97316', label: 'Moore below div (cfs)', kind: 'line', width: 2 },
          ),
          ...seriesFromPointsWithGaps(
            mackayArco.map(d => ({ x: d.year, y: d.arco! })),
            { color: '#16a34a', label: 'Arco (cfs)', kind: 'line', width: 1.8 },
          ),
        ],
        markers: arcoZeroMarkers,
        yLabel: 'calendar-year mean cfs',
      }) +
      svgChart({
        width: inspectorChartW(),
        height: 200,
        series: pctSeries,
        yLabel: '% of Mackay flow',
        yMax: 100,
      }) +
      (mooreYears.length >= 2
        ? svgChart({
            width: inspectorChartW(),
            height: 160,
            series: [
              {
                points: mooreYears.map(d => ({ x: d.year, y: Math.max(0, d.mackay - (d.moore ?? 0)) })),
                color: '#f97316',
                label: 'Mackay − Moore (cfs)',
                kind: 'line',
              },
              {
                points: mooreYears.filter(d => d.arco != null).map(d => ({
                  x: d.year,
                  y: Math.max(0, (d.moore ?? 0) - d.arco!),
                })),
                color: '#dc2626',
                label: 'Moore − Arco (cfs)',
                kind: 'line',
              },
            ],
            yLabel: 'cfs lost between gages',
          })
        : '') +
      svgChart({
        width: inspectorChartW(),
        height: 160,
        series: seriesFromPointsWithGaps(
          mackayArco.map(d => ({ x: d.year, y: Math.max(0, d.mackay - d.arco!) })),
          { color: '#dc2626', label: 'Mackay − Arco (cfs)', kind: 'line', width: 1.8 },
        ),
        yLabel: 'cfs',
      }) +
      svgChart({
        width: inspectorChartW(),
        height: 180,
        series: [
          ...seriesFromPointsWithGaps(
            mackayS.filter(d => d.daysWithFlow != null).map(d => ({ x: d.year, y: d.daysWithFlow! })),
            { color: '#0ea5e9', label: 'Mackay days with flow', kind: 'line', width: 1.8 },
          ),
          ...seriesFromPointsWithGaps(
            arcoS.filter(d => d.daysWithFlow != null).map(d => ({ x: d.year, y: d.daysWithFlow! })),
            { color: '#dc2626', label: 'Arco days with flow', kind: 'line', width: 2 },
          ),
        ],
        yLabel: 'days with flow',
        yMax: 366,
      }) +
      `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">` +
      `Historic terminus: USGS ${FLOW_STEP_GAGES.sinks.site} above the sinks near Howe (discontinued 2018). ` +
      `That gage was dry most years; its final published year (2018) had flow on only ~94 days (Apr–Jul) — see that gage for detail.</div>`
    enhanceCharts(el)
    void fillShrinkOverlay(mackayS, arcoS)
    void fillShrinkAccounting()
  } catch {
    const el = document.getElementById('shrink-chart')
    if (el) el.textContent = 'Could not load USGS flow statistics right now.'
  }
}

async function fillShrinkOverlay(
  mackayS: ReturnType<typeof mergedYearSeries>,
  arcoS: ReturnType<typeof mergedYearSeries>,
) {
  const el = document.getElementById('shrink-overlay')
  if (!el) return
  const picked = pickOverlayYears(mackayS, arcoS, ZERO_CFS)
  if (!picked) return
  el.innerHTML = `<p style="font-size:0.8em;color:var(--text-muted)">Loading daily overlay (${picked.wetYear} vs ${picked.recentYear})…</p>`
  try {
    const [mackayWet, mackayDry, arcoWet, arcoDry] = await Promise.all([
      fetchDailyYear(FLOW_STEP_GAGES.mackay.site, picked.wetYear),
      fetchDailyYear(FLOW_STEP_GAGES.mackay.site, picked.recentYear),
      fetchDailyYear(FLOW_STEP_GAGES.arco.site, picked.wetYear),
      fetchDailyYear(FLOW_STEP_GAGES.arco.site, picked.recentYear),
    ])
    if (!document.getElementById('shrink-overlay')) return
    const toPts = (days: typeof mackayWet) => days.map(d => ({ x: d.dayOfYear, y: d.cfs }))
    el.innerHTML =
      `<h3 style="margin:12px 0 4px;font-size:0.95rem">Wet year vs recent year (daily)</h3>` +
      `<p style="font-size:0.8em;color:var(--text-muted);margin:0 0 6px">` +
      `Auto-picked: wettest Mackay year <strong>${picked.wetYear}</strong> vs recent Arco-zero year <strong>${picked.recentYear}</strong>. ` +
      `Same calendar axis so a pulse is visible as days, not as a tiny annual mean.</p>` +
      `<p style="font-size:0.8em;margin:4px 0">Mackay yield</p>` +
      svgChart({
        width: inspectorChartW(),
        height: 160,
        series: [
          { points: toPts(mackayWet), color: '#0ea5e9', label: `Mackay ${picked.wetYear}`, kind: 'line', width: 1.6 },
          { points: toPts(mackayDry), color: '#0369a1', label: `Mackay ${picked.recentYear}`, kind: 'line' },
        ],
        xScale: 'doy',
        yLabel: 'cfs',
      }) +
      `<p style="font-size:0.8em;margin:8px 0 4px">Arco remnant</p>` +
      svgChart({
        width: inspectorChartW(),
        height: 160,
        series: [
          { points: toPts(arcoWet), color: '#f97316', label: `Arco ${picked.wetYear}`, kind: 'line', width: 1.6 },
          { points: toPts(arcoDry), color: '#dc2626', label: `Arco ${picked.recentYear}`, kind: 'line', width: 2 },
        ],
        xScale: 'doy',
        yLabel: 'cfs',
      })
    enhanceCharts(el)
  } catch {
    el.textContent = 'Could not load daily overlay from USGS NWIS right now.'
  }
}

function accountingSeasonHtml(data: AccountingExtract, width: number): string {
  const inflow = data.daily
    .map((d, i) => (d.inflowCfs != null ? { x: i + 1, y: d.inflowCfs } : null))
    .filter((p): p is { x: number; y: number } => p != null)
  const below = data.daily
    .map((d, i) => (d.decreeDelivery.belowMoore != null ? { x: i + 1, y: d.decreeDelivery.belowMoore } : null))
    .filter((p): p is { x: number; y: number } => p != null)
  const losses = data.daily
    .map((d, i) => (d.losses.decree != null ? { x: i + 1, y: d.losses.decree } : null))
    .filter((p): p is { x: number; y: number } => p != null)
  const sum = (xs: Array<number | null | undefined>) => xs.reduce<number>((s, v) => s + (v || 0), 0)
  const belowSum = sum(data.daily.map(d => d.decreeDelivery.belowMoore))
  const lossSum = sum(data.daily.map(d => d.losses.decree))
  const inflowSum = sum(data.daily.map(d => d.inflowCfs))
  let html =
    `<h3 style="margin:14px 0 4px;font-size:0.95rem">This irrigation season (WD34 workbook)</h3>` +
    `<p style="font-size:0.8em;color:var(--text-muted)">${ACCOUNTING_METHODOLOGY}</p>` +
    `<p style="font-size:0.85em">Season ${data.season.start} → ${data.season.end} · ${data.season.days} days. ` +
    `Workbook: <a href="${data.workbookUrl}" target="_blank" rel="noopener">storage results XLSX</a>.</p>` +
    `<p style="font-size:0.9em">Season totals (cfs-days, as published): inflow <strong>${inflowSum.toFixed(0)}</strong> · ` +
    `decree losses <strong>${lossSum.toFixed(0)}</strong> · decree delivery below Moore <strong>${belowSum.toFixed(0)}</strong></p>` +
    svgChart({
      width,
      height: 200,
      series: [
        { points: inflow, color: '#0ea5e9', label: 'inflow (cfs)', kind: 'line', width: 1.5 },
        { points: losses, color: '#b45309', label: 'decree losses (cfs)', kind: 'line' },
        { points: below, color: '#15803d', label: 'decree delivery below Moore (cfs)', kind: 'line', width: 2 },
      ],
      yLabel: 'cfs',
    }) +
    `<p style="font-size:0.75em;color:var(--text-muted)">X axis is day of the published irrigation season (${data.season.start} = day 1).</p>` +
    `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:0.85em">Full workbook extract (named canals)</summary>` +
    `<p style="font-size:0.8em;color:var(--text-muted)">Labels from the IDWR workbook. Not a liner inventory.</p>` +
    `<div style="overflow:auto;max-height:28vh"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead><tr><th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Canal</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">WRA used ac-ft</th>` +
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">SBW used ac-ft</th></tr></thead><tbody>`
  for (const c of data.canals) {
    html += `<tr><td style="padding:4px;border-bottom:1px solid var(--border)">${c.canal}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${c.wraUsedAf != null ? c.wraUsedAf.toFixed(1) : '—'}</td>` +
      `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${c.sbwUsedAf != null ? c.sbwUsedAf.toFixed(1) : '—'}</td></tr>`
  }
  html += `</tbody></table></div></details>`
  return html
}

async function fillShrinkAccounting() {
  const el = document.getElementById('shrink-accounting')
  if (!el) return
  el.innerHTML = `<p style="font-size:0.8em;color:var(--text-muted)">Loading WD34 published accounting…</p>`
  const data = await loadAccounting()
  if (!document.getElementById('shrink-accounting')) return
  if (!data) {
    el.innerHTML = `<p style="font-size:0.85em">WD34 accounting extract not loaded. Re-run <code>python3 scripts/etl/fetch_wd34_accounting.py</code>.</p>`
    return
  }
  el.innerHTML = accountingSeasonHtml(data, inspectorChartW())
  enhanceCharts(el)
}

export function showGenericDetails(feature: GeoFeature, group: string) {
  const p = feature.properties || {}
  let html = `<h3 style="margin-top:0">${p.name || p.site_no || group}</h3>`
  if (p.site_no) html += `<div class="badge">USGS ${p.site_no}</div> `
  if (p.era) html += `<div class="badge">${p.era} reference</div>`
  html += `<div style="margin:8px 0;font-size:0.85em">`
  for (const [k, v] of Object.entries(p)) {
    if (['name', 'site_no', 'era', 'source_urls', 'url'].includes(k)) continue
    let val = v
    if (typeof val === 'string' && val.length > 180) val = val.slice(0, 177) + '…'
    html += `<div><strong>${k}:</strong> ${val}</div>`
  }
  html += `</div>`
  if (p.url) html += `<a href="${p.url}" target="_blank" rel="noopener">Open full USGS page →</a><br>`
  if (Array.isArray(p.source_urls)) {
    html += p.source_urls.map((u: string) => `<a href="${u}" target="_blank" rel="noopener">Source data</a>`).join(' ')
  }
  html += `${FOOT}All data from public sources listed in the footer. Neutral visualization only.</div>`
  open(html)
}

function priorityBadge(year: number): string {
  const cls = year < 1950 ? 'badge-senior' : year < 2000 ? 'badge-mid' : 'badge-junior'
  const label = year < 1950 ? 'senior' : year < 2000 ? 'mid' : 'junior'
  return ` <span class="badge ${cls}">${year} · ${label}</span>`
}

function transferBadge(distKm: number): string {
  return ` <span class="badge badge-transfer">POD ${distKm.toFixed(1)} km from POU — moved farther</span>`
}

/** Ranked table + CSV for downstream seniors on a dry-reach proxy. */
export function showDryReachSeniorsPanel(store: DataStore) {
  const seniorRows = listDryReachSeniors(store)
  const laterRows = listLowerValleySurface(store)
  const seniorCfs = seniorRows.reduce((s, r) => s + r.rate, 0)

  let html =
    `<h2 style="margin-top:0">Downstream seniors on a dry reach</h2>` +
    `<p style="font-size:0.85em;line-height:1.45;color:var(--text-muted)">${DRY_REACH_METHODOLOGY}</p>` +
    `<p id="dry-reach-summary" style="font-size:0.9em"><strong>${seniorRows.length}</strong> rights · ` +
    `<strong>${seniorCfs.toFixed(1)}</strong> cfs combined max diversion · priority before ${DRY_REACH_SENIOR_YEAR}</p>` +
    `<p style="font-size:0.8em;color:var(--text-muted);margin:6px 0 0">` +
    `Owner names come straight from the IDWR extract — nothing is scrubbed. ` +
    `The default table is pre-1950 mainstem rights at/below Moore. Toggle below to include later surface irrigation on the same reach.</p>` +
    `<label style="font-size:0.85em;display:flex;align-items:center;gap:8px;margin:10px 0">` +
    `<input type="checkbox" id="dry-reach-include-later" /> Include later surface irrigation below Moore</label>` +
    `<p id="dry-reach-later-note" class="hidden" style="font-size:0.8em;color:var(--text-muted)">${LOWER_VALLEY_METHODOLOGY}</p>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0">` +
    `<button type="button" id="dry-reach-csv" class="zoom-btn">Download CSV</button>` +
    `<label style="font-size:0.8em;display:flex;align-items:center;gap:6px;flex:1;min-width:180px">` +
    `Filter owner ` +
    `<input id="dry-reach-owner-filter" type="search" placeholder="Type any owner name…" ` +
    `style="flex:1;min-width:140px;padding:6px 8px;border:1px solid var(--border-strong);border-radius:4px;background:var(--control-bg);color:var(--text)" />` +
    `</label>` +
    `</div>` +
    `<p id="dry-reach-filter-status" style="font-size:0.8em;color:var(--text-muted);min-height:1.2em"></p>`

  html += `<div style="overflow:auto;max-height:55vh"><table style="width:100%;border-collapse:collapse;font-size:0.8em">` +
    `<thead id="dry-reach-thead"></thead><tbody id="dry-reach-tbody"></tbody></table></div>` +
    `<p id="dry-reach-truncate-note" style="font-size:0.8em;color:var(--text-muted)"></p>`

  open(html, { wide: true, receipt: 'dry-reach', heading: 'Downstream seniors', reopen: () => showDryReachSeniorsPanel(store) })

  const laterToggle = document.getElementById('dry-reach-include-later') as HTMLInputElement | null
  const laterNote = document.getElementById('dry-reach-later-note')
  const summary = document.getElementById('dry-reach-summary')
  const thead = document.getElementById('dry-reach-thead')
  const tbody = document.getElementById('dry-reach-tbody')
  const status = document.getElementById('dry-reach-filter-status')
  const note = document.getElementById('dry-reach-truncate-note')
  const ownerInput = document.getElementById('dry-reach-owner-filter') as HTMLInputElement | null

  const isLater = () => !!laterToggle?.checked

  const paint = () => {
    const q = ownerInput?.value.trim().toLowerCase() || ''
    const later = isLater()
    laterNote?.classList.toggle('hidden', !later)
    if (later) {
      const all = laterRows
      const list = q ? all.filter(r => r.owner.toLowerCase().includes(q)) : all
      const cfs = list.reduce((s, r) => s + r.rate, 0)
      if (summary) {
        summary.innerHTML = `<strong>${list.length}</strong> surface irrigation rights at/below Moore · <strong>${cfs.toFixed(1)}</strong> cfs (includes post-1950 paper)`
      }
      if (thead) {
        thead.innerHTML = `<tr>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">#</th>` +
          `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Right</th>` +
          `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Owner</th>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Year</th>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">cfs</th>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Arco km</th>` +
          `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Dry channel</th>` +
          `<th></th></tr>`
      }
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
          `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.arcoKm.toFixed(1)}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.onDryChannel ? 'yes' : '—'}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border)"><button type="button" class="zoom-btn" data-zoom-wr="${r.wr}">Zoom</button></td></tr>`
      }
      if (!list.length) body = `<tr><td colspan="8" style="padding:12px;color:var(--text-muted)">No matching rights.</td></tr>`
      if (tbody) tbody.innerHTML = body
      if (note) note.textContent = list.length > max ? `Showing top ${max} of ${list.length}. CSV includes all.` : ''
      if (status) status.textContent = q ? `${list.length} matching “${ownerInput?.value.trim()}”` : ''
    } else {
      const all = seniorRows
      const list = q ? all.filter(r => r.owner.toLowerCase().includes(q)) : all
      const cfs = list.reduce((s, r) => s + r.rate, 0)
      if (summary) {
        summary.innerHTML = `<strong>${list.length}</strong> rights · <strong>${cfs.toFixed(1)}</strong> cfs combined max diversion · priority before ${DRY_REACH_SENIOR_YEAR}`
      }
      if (thead) {
        thead.innerHTML = `<tr>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">#</th>` +
          `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Right</th>` +
          `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Owner</th>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Year</th>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">cfs</th>` +
          `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border)">Source</th>` +
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">km</th>` +
          `<th></th></tr>`
      }
      const max = 200
      let body = ''
      for (let i = 0; i < Math.min(list.length, max); i++) {
        const r = list[i]
        const src = r.source.length > 24 ? `${r.source.slice(0, 22)}…` : r.source
        body += `<tr>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right;color:var(--text-muted)">${seniorRows.indexOf(r) + 1}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border)"><code>${r.wr}</code></td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border)">${r.owner || '—'}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.year}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.rate.toFixed(2)}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border)" title="${r.source}">${src || '—'}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${r.mainstemKm.toFixed(1)}</td>` +
          `<td style="padding:4px;border-bottom:1px solid var(--border)"><button type="button" class="zoom-btn" data-zoom-wr="${r.wr}">Zoom</button></td></tr>`
      }
      if (!list.length) body = `<tr><td colspan="8" style="padding:12px;color:var(--text-muted)">No rights match that owner filter under the dry-reach rules.</td></tr>`
      if (tbody) tbody.innerHTML = body
      if (note) note.textContent = list.length > max ? `Showing top ${max} of ${list.length}. CSV includes all.` : ''
      if (status) status.textContent = q ? `${list.length} matching “${ownerInput?.value.trim()}” (${cfs.toFixed(2)} cfs)` : ''
    }
  }

  document.getElementById('dry-reach-csv')?.addEventListener('click', () => {
    const q = ownerInput?.value.trim().toLowerCase() || ''
    if (isLater()) {
      const list = q ? laterRows.filter(r => r.owner.toLowerCase().includes(q)) : laterRows
      downloadCsv('basin34-surface-irrigation-below-moore.csv', lowerValleyToCsv(list))
    } else {
      const list = q ? seniorRows.filter(r => r.owner.toLowerCase().includes(q)) : seniorRows
      downloadCsv('basin34-downstream-seniors-dry-reach.csv', dryReachSeniorsToCsv(list))
    }
  })
  laterToggle?.addEventListener('change', paint)
  ownerInput?.addEventListener('input', paint)
  paint()
}
