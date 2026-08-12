import { describe, expect, it } from 'vitest'
import { defaultState } from './state'
import { isDownstream, podMatchesMode, podVisible } from './filters'
import { emptyStore, pod } from './test/fixtures'

describe('isDownstream', () => {
  it('uses reach south latitude when the reach is known', () => {
    const store = emptyStore({
      reachSouthLat: new Map([['moore', 43.78]]),
    })
    expect(isDownstream(43.70, 'moore', store)).toBe(true)
    expect(isDownstream(43.90, 'moore', store)).toBe(false)
  })
})

describe('podMatchesMode / podVisible', () => {
  it('matches senior-downstream only for pre-1950 rights at/below the reach', () => {
    const store = emptyStore({
      reachSouthLat: new Map([['moore', 43.78]]),
    })
    const state = defaultState()
    state.highlightMode = 'senior-downstream'
    state.reachFilter = 'moore'
    const senior = pod({ year: 1940, lat: 43.70 })
    const junior = pod({ wr: '34-j', year: 1985, lat: 43.70 })
    const upstream = pod({ wr: '34-u', year: 1940, lat: 43.90 })
    expect(podMatchesMode(senior, state, store)).toBe(true)
    expect(podMatchesMode(junior, state, store)).toBe(false)
    expect(podMatchesMode(upstream, state, store)).toBe(false)
  })

  it('keeps a selected right visible even when hideNonMatches is on', () => {
    const store = emptyStore()
    const state = defaultState()
    state.highlightMode = 'senior-downstream'
    state.hideNonMatches = true
    const rec = pod({ wr: '34-sel', year: 2001, lat: 43.90 })
    expect(podVisible(rec, state, store)).toBe(false)
    state.selectedWRs = new Set(['34-sel'])
    expect(podVisible(rec, state, store)).toBe(true)
  })
})
