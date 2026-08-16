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
import { formatAcresFromKm2, formatDistanceKm, formatMilesNumber } from '../units'
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
