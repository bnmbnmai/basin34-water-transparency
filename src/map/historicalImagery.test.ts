/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { getAvailableLandsatYears, getLandsatYearRange } from './historicalImagery'

describe('bundled Landsat index', () => {
  it('includes local summers from 1972 so Year does not start at Sentinel-2', () => {
    const years = getAvailableLandsatYears()
    expect(years[0]).toBe(1972)
    expect(years).toContain(2015)
    expect(years).toContain(2016)
    expect(getLandsatYearRange()).toEqual({ min: 1972, max: years[years.length - 1] })
  })
})
