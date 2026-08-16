import { DISTRICT_POU_KM2, CONFLICT_CORRIDOR_KM, type DataStore } from '../data'
import type { GeoFeature, PodRecord, WellRecord } from '../types'
import { gageChartsStory, gageRoleFromProps, gageRoleLabel } from '../map/gageRoles'
import {
  fetchGageFlowHistory, fetchInstantaneousCfs,
  mergedYearSeries, type GageFlowHistory,
} from '../usgs'
import { enhanceCharts, seriesFromPointsWithGaps, svgChart } from './chart'
import { haversineKm, shouldIncludePouInFocus } from '../map/focusRight'
import { formatAcresFromKm2, formatDistanceKm } from '../units'
import { TRANSFER_SEARCH_URL } from '../wrLinks'

export function inspectorChartW(): number {
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

export const ZERO_CFS = 0.5

export interface OpenInspectorOpts {
  wide?: boolean
  pinned?: boolean
  receipt?: ReceiptKind
  reopen?: () => void
  heading?: string
}

export function open(html: string, opts: OpenInspectorOpts = {}) {
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

export const FOOT = `<div style="margin-top:6px;font-size:0.7em;color:var(--text-muted)">`

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
    html += `<span class="badge" title="POD is ${formatDistanceKm(rec.mainstemDistKm, { long: true })} from the NHD Big Lost mainstem — excluded from the dry-reach seniors table">${formatDistanceKm(rec.mainstemDistKm)} off Big Lost mainstem</span>`
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
      const distKm = haversineKm(rec.lat, rec.lon, pouCenter[0], pouCenter[1])
      html += `<div style="margin-top:4px;font-size:0.85em">Place of use is ${formatDistanceKm(distKm, { long: true })} from this diversion (dashed line).</div>`
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
    html += `<div class="badge">district / service area — ${formatAcresFromKm2(areaKm2)}</div>` +
      `<div style="font-size:0.8em;color:var(--text-muted);margin:4px 0">This right's authorized place of use is an entire service area, not an individual field. It is drawn as an outline so the fields inside stay visible.</div>`
  } else if (props.TotalAcres == null && areaKm2 > 0) {
    html += `<div><strong>Area:</strong> ${formatAcresFromKm2(areaKm2, { approx: true })}</div>`
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

export function priorityBadge(year: number): string {
  const cls = year < 1950 ? 'badge-senior' : year < 2000 ? 'badge-mid' : 'badge-junior'
  const label = year < 1950 ? 'senior' : year < 2000 ? 'mid' : 'junior'
  return ` <span class="badge ${cls}">${year} · ${label}</span>`
}

export function transferBadge(distKm: number): string {
  return ` <span class="badge badge-transfer">POD ${formatDistanceKm(distKm)} from POU — moved farther</span>`
}
