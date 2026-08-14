import type { DataStore } from './data'
import type { AppState, PodRecord, WellRecord } from './types'
import { podMatchesMode, podOwnerMatch } from './filters'

/**
 * Visual emphasis classes for PODs, resolved by a strict precedence:
 *   selected > owner match > analysis-view match > normal/subdued.
 * Because analysis views are exclusive, there is no combinatorial styling.
 */
export type PodEmphasis =
  | 'selected'
  | 'owner'
  | 'senior'
  | 'transfer'
  | 'normal'
  | 'subdued'

export function resolvePodEmphasis(rec: PodRecord, state: AppState, store: DataStore): PodEmphasis {
  if (state.selectedWRs.has(rec.wr)) return 'selected'
  if (podOwnerMatch(rec, state)) return 'owner'

  if (state.highlightMode !== 'none' && podMatchesMode(rec, state, store)) {
    if (state.highlightMode === 'senior-downstream') return 'senior'
    if (state.highlightMode === 'transfers') return 'transfer'
  }

  const anyHighlight = !!state.ownerHighlight || state.highlightMode !== 'none'
  return anyHighlight ? 'subdued' : 'normal'
}

export type WellEmphasis = 'normal' | 'subdued'

export function resolveWellEmphasis(rec: WellRecord, state: AppState, _store: DataStore): WellEmphasis {
  const anyHighlight = !!state.ownerHighlight || state.highlightMode !== 'none'
  if (!anyHighlight) return 'normal'
  if (state.ownerHighlight && rec.ownerLc.includes(state.ownerHighlight.toLowerCase())) return 'normal'
  return 'subdued'
}
