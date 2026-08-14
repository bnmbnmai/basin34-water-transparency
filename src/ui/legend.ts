import { state } from '../state'
import { EMPHASIS_COLORS, POD_COLORS, PRIORITY_COLORS, WELL_USE_COLORS } from '../symbology'

const star = (color: string) => `<span class="lg-star" style="color:${color}">★</span>`
const dot = (color: string) => `<span class="lg-dot" style="background:${color}"></span>`
const swatch = (color: string, dashed = false) =>
  `<span class="lg-poly" style="border-color:${color};${dashed ? 'border-style:dashed;' : ''}"></span>`
const fillSwatch = (stroke: string, fill: string) =>
  `<span class="lg-poly" style="border-color:${stroke};background:${fill}"></span>`

const MODE_LEGEND: Record<string, string> = {
  'senior-downstream': `${star(EMPHASIS_COLORS.senior.stroke)} Pre-1950 Big Lost / Ferris Slough rights on the NHD mainstem at/below Moore (emphasized). Antelope and other tributaries excluded. Others dimmed.`,
  transfers: `${star(EMPHASIS_COLORS.transfer.stroke)} Water moved farther: POD sits far (&gt;8 km) from place of use; dashed lines connect POD ↔ POU. ` +
    `${fillSwatch('#c2410c', 'rgba(249,115,22,0.45)')} solid orange POU = off the natural corridor (geometric — not “built since 2010”). Others dimmed.`,
}

export interface LegendCounts {
  pods: number
  wells: number
}

export function updateLegend(counts: LegendCounts, layersOn: { pods: boolean; wells: boolean; hydro?: boolean }) {
  const el = document.getElementById('main-legend')
  if (!el) return
  const rows: string[] = []

  if (state.highlightMode !== 'none') {
    const modeText = MODE_LEGEND[state.highlightMode] || ''
    rows.push(`<div class="lg-row lg-mode">${
      state.hideNonMatches
        ? modeText.replace(/Others dimmed\./g, 'Only matching rights shown (phone-friendly).')
        : modeText
    }</div>`)
  }
  if (state.ownerHighlight) {
    rows.push(`<div class="lg-row">${star(EMPHASIS_COLORS.owner.stroke)} Rights owned by “${state.ownerHighlight}”. ${
      state.hideNonMatches ? 'Only this owner shown.' : 'Others dimmed.'
    } Click a right in the list to select it (${star(EMPHASIS_COLORS.selected.stroke)} cyan).</div>`)
  }
  if (state.selectedWRs.size > 0) {
    rows.push(`<div class="lg-row">${star(EMPHASIS_COLORS.selected.stroke)} ${
      state.isolateSelection
        ? 'Selected diversion isolated — other stars hidden. Clear selection to see neighbors.'
        : 'Selected right(s) — cyan POU outline + dashed POD lines.'
    }</div>`)
  }

  if (layersOn.pods) {
    if (state.podColorMode === 'priority') {
      rows.push(
        `<div class="lg-row"><strong>★ PODs by priority year</strong> (${counts.pods.toLocaleString()} shown)<br>` +
        PRIORITY_COLORS.map(s => `${star(s.color)} ${s.label}`).join(' &nbsp; ') +
        `</div>`,
      )
    } else {
      rows.push(
        `<div class="lg-row"><strong>★ PODs by source</strong> (${counts.pods.toLocaleString()} shown)<br>` +
        `${star(POD_COLORS.gw)} groundwater &nbsp; ${star(POD_COLORS.surface)} surface &nbsp; ${star(POD_COLORS.other)} other</div>`,
      )
    }
  }
  if (layersOn.wells) {
    if (state.wellColorMode === 'swl') {
      rows.push(
        `<div class="lg-row"><strong>● Wells by static water level</strong> (${counts.wells.toLocaleString()} shown)<br>` +
        `${dot('#38bdf8')} &lt;50 ft &nbsp; ${dot('#0ea5e9')} 50–100 &nbsp; ${dot('#ca8a04')} 100–150 &nbsp; ${dot('#ea580c')} 150–250 &nbsp; ${dot('#b91c1c')} &gt;250 ft (drill-time)</div>`,
      )
    } else if (state.wellColorMode === 'era') {
      rows.push(
        `<div class="lg-row"><strong>● Wells by construction era</strong> (${counts.wells.toLocaleString()} shown)<br>` +
        `${dot('#0ea5e9')} &lt;1980 &nbsp; ${dot('#ca8a04')} 1980–99 &nbsp; ${dot('#ea580c')} 2000–14 &nbsp; ${dot('#b91c1c')} 2015+</div>`,
      )
    } else {
      rows.push(
        `<div class="lg-row"><strong>● Wells by use</strong> (${counts.wells.toLocaleString()} shown)<br>` +
        WELL_USE_COLORS.slice(0, 4).map(c => `${dot(c.color)} ${c.label}`).join(' &nbsp; ') +
        `</div>`,
      )
    }
  }
  if (layersOn.hydro) {
    rows.push(
      `<div class="lg-row"><strong>NHD canals &amp; pipelines</strong><br>` +
      `${swatch('#0369a1', true)} canal east of mainstem &nbsp; ${swatch('#0f766e', true)} canal west of mainstem &nbsp; ` +
      `${swatch('#64748b', true)} pipeline. Geometric side-of-channel (longitude vs nearest NHD vertex); NHD does not mark liners.</div>`,
    )
  }
  if (state.placeOfUseMode) {
    rows.push(
      `<div class="lg-row">${swatch('#15803d', true)} place of use &nbsp; ${swatch('#f97316', true)} POU of moved-farther right &nbsp; ${swatch('#0f766e', true)} district service area (outline only) &nbsp; ${swatch(EMPHASIS_COLORS.selected.stroke)} selected</div>`,
    )
  }
  rows.push(
    `<div class="lg-row">` +
    `${dot('#0ea5e9')} Mackay yield &nbsp; ${dot('#f97316')} Moore terminus &nbsp; ${dot('#dc2626')} Arco remnant<br>` +
    `<span style="color:var(--text-muted)">Gages are waypoints — the chart is river shrink. Gray = archive / context.</span></div>`,
  )
  if (state.yearMin > 1800 || state.yearMax < 2026) {
    rows.push(`<div class="lg-row"><strong>Years:</strong> ${state.yearMin}–${state.yearMax} (POD priority / well construction)</div>`)
  }
  if (!rows.length) {
    rows.push(`<div class="lg-row text-[var(--text-muted)]">Toggle layers or open an insight receipt.</div>`)
  }
  rows.push(`<div class="lg-row" style="font-size:0.85em;color:var(--text-muted)">Marker size = diversion / production rate.</div>`)
  el.innerHTML = rows.join('')
}
