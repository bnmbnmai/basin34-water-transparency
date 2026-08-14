import type { AppState } from './types'

export function defaultState(): AppState {
  return {
    podColorMode: 'source',
    eras: { pre1950: true, mid: true, post2000: true },
    yearMin: 1800,
    yearMax: 2026,
    showGW: true,
    showSurface: true,
    hideDomestic: true,
    wellColorMode: 'use',
    focusIrrigation: false,
    highlightMode: 'none',
    ownerHighlight: null,
    placeOfUseMode: false,
    showPouOnImagery: false,
    hideNonMatches: false,
    isolateSelection: false,
    focusPodKey: null,
    selectedWRs: new Set<string>(),
    flowEra: 'recent',
  }
}

/** Single mutable app state. UI handlers mutate it, then ask main.ts to re-render. */
export const state: AppState = defaultState()

export function resetState() {
  const d = defaultState()
  Object.assign(state, d, { selectedWRs: new Set<string>() })
}
