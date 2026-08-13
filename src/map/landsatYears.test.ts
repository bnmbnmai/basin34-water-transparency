import { describe, expect, it } from 'vitest'
import { landsatHint, resolveLandsatSource, S2_CLOUDLESS_LAYERS } from './landsatYears'

describe('resolveLandsatSource', () => {
  it('uses EOX Sentinel-2 cloudless for published years', () => {
    const src = resolveLandsatSource(2020, [2000, 2010])
    expect(src).toEqual({ year: 2020, kind: 's2', layer: S2_CLOUDLESS_LAYERS[2020] })
  })

  it('snaps 2017 to the nearest published S2 year', () => {
    const src = resolveLandsatSource(2017, [])
    expect(src.kind).toBe('s2')
    expect(src.year).toBe(2018)
  })

  it('uses a local Landsat mosaic for pre-2016 years when present', () => {
    expect(resolveLandsatSource(2000, [1990, 2000, 2010])).toEqual({ year: 2000, kind: 'local' })
    expect(resolveLandsatSource(1995, [1990, 2000, 2010])).toEqual({ year: 2000, kind: 'local' })
  })

  it('falls back to live Esri tiles when no local mosaic exists', () => {
    expect(resolveLandsatSource(1995, [])).toEqual({ year: 1995, kind: 'esri' })
  })
})

describe('landsatHint', () => {
  it('explains a snapped year', () => {
    const hint = landsatHint(2017, { year: 2016, kind: 's2', layer: S2_CLOUDLESS_LAYERS[2016] })
    expect(hint).toContain('2017')
    expect(hint).toContain('2016')
    expect(hint).toContain('Sentinel-2')
  })
})
