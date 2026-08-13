import { describe, expect, it } from 'vitest'
import {
  availableImageryYears,
  imageryBanner,
  imagerySensorLabel,
  landsatHint,
  resolveLandsatSource,
  S2_CLOUDLESS_LAYERS,
} from './landsatYears'

describe('availableImageryYears', () => {
  it('unions local mosaics with published S2 years and skips gaps', () => {
    const years = availableImageryYears([1990, 2000, 2010])
    expect(years).toContain(1990)
    expect(years).toContain(2016)
    expect(years).toContain(2020)
    expect(years).not.toContain(2017)
    expect(years).not.toContain(1984)
  })
})

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
  })

  it('does not invent pixels for a missing year — snaps to an available tick', () => {
    const src = resolveLandsatSource(1995, [1990, 2000, 2010])
    expect(src).toEqual({ year: 2000, kind: 'local' })
  })

  it('does not snap a pre-2016 year to Sentinel-2 before the local index is ready', () => {
    expect(resolveLandsatSource(1990, [], {}, { indexReady: false })).toEqual({
      year: 1990,
      kind: 'none',
    })
  })

  it('does not fall back to current satellite when no local mosaic exists', () => {
    const src = resolveLandsatSource(1995, [])
    expect(src.kind).toBe('s2')
    expect(src.year).toBe(2016)
  })
})

describe('labels', () => {
  it('names sensor and resolution', () => {
    expect(imagerySensorLabel({ year: 1990, kind: 'local', platform: 'landsat-5' }))
      .toBe('1990 Landsat 5 · 30 m')
    expect(imagerySensorLabel({ year: 2020, kind: 's2', layer: S2_CLOUDLESS_LAYERS[2020] }))
      .toBe('2020 Sentinel-2 · 10 m')
  })

  it('says today’s satellite is off', () => {
    const banner = imageryBanner(1990, { year: 1990, kind: 'local', platform: 'landsat-5' })
    expect(banner).toContain('1990')
    expect(banner).toContain('today’s satellite is off')
  })

  it('explains a snapped year', () => {
    const hint = landsatHint(2017, { year: 2016, kind: 's2', layer: S2_CLOUDLESS_LAYERS[2016] })
    expect(hint).toContain('2017')
    expect(hint).toContain('2016')
    expect(hint).toContain('Sentinel-2')
    expect(imageryBanner(2017, { year: 2016, kind: 's2', layer: S2_CLOUDLESS_LAYERS[2016] }))
      .toContain('No mosaic for 2017')
  })
})
