import { describe, expect, it } from 'vitest'
import {
  formatAcresFromKm2,
  formatDistanceKm,
  formatMilesNumber,
  km2ToAcres,
  kmToMiles,
} from './units'

describe('kmToMiles', () => {
  it('converts the moved-farther threshold (8 km) to about 5 miles', () => {
    expect(kmToMiles(8)).toBeCloseTo(4.97, 2)
  })
})

describe('formatDistanceKm', () => {
  it('uses miles for valley-scale distances', () => {
    expect(formatDistanceKm(8)).toBe('5.0 mi')
    expect(formatDistanceKm(3, { long: true })).toBe('1.9 miles')
    expect(formatDistanceKm(1.5)).toBe('0.9 mi')
  })

  it('uses feet when the distance is short', () => {
    expect(formatDistanceKm(0.1)).toBe('328 ft')
    expect(formatDistanceKm(0.1, { long: true })).toBe('328 feet')
  })

  it('returns an em dash for non-finite values', () => {
    expect(formatDistanceKm(Number.NaN)).toBe('—')
  })
})

describe('formatMilesNumber', () => {
  it('writes one-decimal miles for table cells', () => {
    expect(formatMilesNumber(8)).toBe('5.0')
    expect(formatMilesNumber(3)).toBe('1.9')
  })
})

describe('formatAcresFromKm2', () => {
  it('converts district-scale km² to acres', () => {
    expect(km2ToAcres(20)).toBeCloseTo(4942, 0)
    expect(formatAcresFromKm2(20)).toBe('4,942 acres')
    expect(formatAcresFromKm2(1, { digits: 2, approx: true })).toBe('~247.11 acres')
  })
})
