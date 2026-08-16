import type { DataStore } from '../data'
import { ACCOUNTING_METHODOLOGY, loadAccounting, type AccountingExtract } from '../accounting'
import {
  fetchDailyYear, fetchGageFlowHistory,
  mergedYearSeries, pickOverlayYears,
} from '../usgs'
import { enhanceCharts, seriesFromPointsWithGaps, svgChart } from './chart'
import { FLOW_STEP_GAGES, FOOT, ZERO_CFS, inspectorChartW, open } from './details'

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
