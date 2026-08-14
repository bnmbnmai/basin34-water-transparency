import { describe, expect, it } from 'vitest'
import { focusViewForRight, primaryPodForRight, shouldIncludePouInFocus } from './focusRight'

describe('primaryPodForRight', () => {
  it('picks the highest-rate POD', () => {
    const primary = primaryPodForRight([
      { wr: '34-1', rate: 1, lat: 43.9, lon: -113.5 },
      { wr: '34-1', rate: 8, lat: 43.7, lon: -113.3 },
      { wr: '34-1', rate: 2, lat: 43.5, lon: -113.1 },
    ])
    expect(primary?.lat).toBe(43.7)
  })
})

describe('focusViewForRight', () => {
  it('centers on the primary POD at field scale, not a basin-wide fit', () => {
    const view = focusViewForRight([
      { wr: '34-1', rate: 8, lat: 43.70, lon: -113.30 },
      { wr: '34-1', rate: 1, lat: 44.20, lon: -113.90 },
    ])
    expect(view).toEqual({ lat: 43.70, lon: -113.30, zoom: 16 })
  })

  it('stays at field scale even when a nearby field exists', () => {
    const view = focusViewForRight(
      [{ wr: '34-1', rate: 4, lat: 43.70, lon: -113.30 }],
      [43.71, -113.31],
    )
    expect(view?.zoom).toBe(16)
  })

  it('ignores a far-away place of use so Zoom does not fly to basin scale', () => {
    expect(shouldIncludePouInFocus(
      { lat: 43.70, lon: -113.30 },
      [43.95, -113.60],
    )).toBe(false)
    const view = focusViewForRight(
      [{ wr: '34-1', rate: 4, lat: 43.70, lon: -113.30 }],
      [43.95, -113.60],
    )
    expect(view?.zoom).toBe(16)
  })
})
