import type { DataStore } from './data'
import { CONFLICT_CORRIDOR_KM } from './data'
import { podKey } from './map/focusRight'
import { isDryReachSource, MOORE_LAT } from './dryReach'
import type { AppState, PodRecord, WellRecord } from './types'

/** Approximate "at or downstream of" test (river flows roughly south in WD34). */
export function isDownstream(lat: number, reachId: string, store: DataStore): boolean {
  if (reachId) {
    const south = store.reachSouthLat.get(reachId)
    if (south != null) return lat <= south + 0.015
  }
  return lat < 43.62 // global lower-basin approximation
}

/** POD sits on/near the NHD Big Lost mainstem (not tributary NWI wetlands). */
export function onRiverCorridor(rec: PodRecord): boolean {
  return rec.mainstemDistKm <= CONFLICT_CORRIDOR_KM
}

function inEraBuckets(year: number | null, state: AppState): boolean {
  if (year == null) return true
  if (year < 1950) return state.eras.pre1950
  if (year < 2000) return state.eras.mid
  return state.eras.post2000
}

function inYearRange(year: number | null, state: AppState): boolean {
  return year == null || (year >= state.yearMin && year <= state.yearMax)
}

/** Does the record match the active analysis view? (used for emphasis AND force-include) */
export function podMatchesMode(rec: PodRecord, state: AppState, _store: DataStore): boolean {
  switch (state.highlightMode) {
    case 'senior-downstream':
      return rec.year != null && rec.year < 1950 &&
        isDryReachSource(rec) &&
        rec.mainstemDistKm <= CONFLICT_CORRIDOR_KM &&
        rec.lat <= MOORE_LAT
    case 'transfers':
      return rec.isTransfer
    default:
      return false
  }
}

export function podOwnerMatch(rec: PodRecord, state: AppState): boolean {
  return !!state.ownerHighlight && rec.ownerLc.includes(state.ownerHighlight.toLowerCase())
}

export function podVisible(rec: PodRecord, state: AppState, store: DataStore): boolean {
  if (state.isolateSelection && state.selectedWRs.size > 0) {
    if (!state.selectedWRs.has(rec.wr)) return false
    if (state.focusPodKey) return podKey(rec) === state.focusPodKey
    return true
  }

  if (state.selectedWRs.has(rec.wr)) return true
  if (podOwnerMatch(rec, state)) return true

  const modeMatch = state.highlightMode !== 'none' && podMatchesMode(rec, state, store)
  if (modeMatch) return true

  if (state.hideNonMatches && (state.highlightMode !== 'none' || state.ownerHighlight)) return false

  const catOk = rec.isGW ? state.showGW
    : rec.isSurf ? state.showSurface
    : (state.showGW || state.showSurface)
  if (!catOk) return false
  if (!inYearRange(rec.year, state) || !inEraBuckets(rec.year, state)) return false
  return true
}

export function wellVisible(rec: WellRecord, state: AppState, _store: DataStore): boolean {
  if (state.hideDomestic && (!rec.use || rec.use.includes('DOMESTIC'))) return false
  if (state.focusIrrigation) {
    if (!rec.use || rec.use.includes('DOMESTIC') || rec.use.includes('MONITOR')) return false
  }

  // Remaining highlight modes are POD-only; hide wells while a lens is on.
  if (state.hideNonMatches && state.highlightMode !== 'none') return false

  if (rec.year != null) {
    if (!inYearRange(rec.year, state) || !inEraBuckets(rec.year, state)) return false
  }
  if (state.ownerHighlight && !rec.ownerLc.includes(state.ownerHighlight.toLowerCase())) {
    return false
  }
  return true
}
