import { describe, expect, it } from 'vitest'
import type { WellRecord } from './types'
import { wellPressureByDecade } from './wellPressure'

function well(over: Partial<WellRecord> & { swl?: number | null; depth?: number | null; year?: number | null }): WellRecord {
  return {
    feature: { type: 'Feature', geometry: { type: 'Point', coordinates: [-113.27, 43.58] }, properties: { WellID: 1 } },
    ownerLc: '',
    use: over.use ?? 'DOMESTIC-SINGLE RESIDENCE',
    year: over.year ?? 1990,
    rate: 0,
    lat: 43.58,
    lon: -113.27,
    depth: over.depth ?? 100,
    swl: over.swl ?? 50,
    ...over,
  }
}

describe('wellPressureByDecade', () => {
  it('reports median SWL by construction decade', () => {
    const rows = wellPressureByDecade([
      well({ year: 1985, swl: 60, depth: 80 }),
      well({ year: 1989, swl: 70, depth: 90 }),
      well({ year: 2025, swl: 240, depth: 400, use: 'DOMESTIC-SINGLE RESIDENCE' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].decade).toBe('1980s')
    expect(rows[0].medianSwl).toBe(65)
    expect(rows[1].decade).toBe('2020s')
    expect(rows[1].medianSwl).toBe(240)
  })
})
