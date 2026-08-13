/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./map/historicalImagery', () => ({
  getImageryState: () => ({
    mode: 'current',
    landsatYear: 2024,
    waybackReleaseNum: null,
    waybackDate: null,
    landsatShownYear: 2024,
    landsatKind: 's2',
    landsatHint: '',
    landsatLabel: '2024 Sentinel-2 · 10 m',
    landsatBanner: '',
  }),
  setImageryMode: async () => undefined,
  setLandsatYear: () => undefined,
  setWaybackYear: () => undefined,
}))

import { applyHashToState } from './permalink'
import { resetState, state } from './state'

afterEach(() => {
  resetState()
  window.location.hash = ''
})

describe('applyHashToState', () => {
  it('restores analysis mode, years, selection, and map view', () => {
    window.location.hash =
      '#m=senior-downstream&y0=1880&y1=1950&sel=34-1,34-2&v=11/43.7907/-113.3689&fe=recent'
    const restored = applyHashToState()
    expect(state.highlightMode).toBe('senior-downstream')
    expect(state.yearMin).toBe(1880)
    expect(state.yearMax).toBe(1950)
    expect([...state.selectedWRs]).toEqual(['34-1', '34-2'])
    expect(state.flowEra).toBe('recent')
    expect(restored.view).toEqual({ zoom: 11, lat: 43.7907, lng: -113.3689 })
  })

  it('ignores unknown highlight modes instead of writing them into state', () => {
    window.location.hash = '#m=not-a-real-lens'
    applyHashToState()
    expect(state.highlightMode).toBe('none')
  })
})
