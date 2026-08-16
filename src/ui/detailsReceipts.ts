import { NEW_GROUND_KM, TRANSFER_DIST_KM, type DataStore } from '../data'
import type { GeoFeature } from '../types'
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
import { formatDistanceKm, formatMilesNumber } from '../units'
import { TRANSFER_SEARCH_URL } from '../wrLinks'
import { FOOT, open, priorityBadge, transferBadge } from './details'

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
    `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">POD↔POU mi</th>` +
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
        `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${formatMilesNumber(r.podPouKm)}</td>` +
        `<td style="padding:4px;border-bottom:1px solid var(--border)">${
          r.offCorridor
            ? `<span class="badge badge-newground" title="POU ${r.corridorKm != null ? formatDistanceKm(r.corridorKm, { long: true }) : '?'} from corridor">yes · ${r.corridorKm != null ? formatDistanceKm(r.corridorKm) : '?'}</span>`
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
    `Threshold: &gt;${formatDistanceKm(TRANSFER_DIST_KM)} POD↔POU; off-corridor &gt;${formatDistanceKm(NEW_GROUND_KM)}.</p>`

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
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">Arco mi</th>` +
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
          `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${formatMilesNumber(r.arcoKm)}</td>` +
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
          `<th style="text-align:right;padding:4px;border-bottom:1px solid var(--border)">mi</th>` +
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
          `<td style="padding:4px;border-bottom:1px solid var(--border);text-align:right">${formatMilesNumber(r.mainstemKm)}</td>` +
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
