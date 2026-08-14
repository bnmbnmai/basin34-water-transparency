import { describe, expect, it } from 'vitest'
import { uniqueSelectedPous } from './pouSelection'
import type { PouRecord } from '../types'

function pou(over: Partial<PouRecord> & Pick<PouRecord, 'wr' | 'geomKey'>): PouRecord {
  return {
    feature: { type: 'Feature', geometry: null, properties: {} },
    areaKm2: 0.5,
    ...over,
  }
}

describe('uniqueSelectedPous', () => {
  it('paints a shared field once when many rights share the polygon', () => {
    const shared = 'Polygon:-113.3,43.7'
    const pousByWR = new Map<string, PouRecord[]>([
      ['34-1', [pou({ wr: '34-1', geomKey: shared })]],
      ['34-2', [pou({ wr: '34-2', geomKey: shared })]],
      ['34-3', [pou({ wr: '34-3', geomKey: shared, areaKm2: 0.6 })]],
    ])
    const out = uniqueSelectedPous(['34-1', '34-2', '34-3'], pousByWR, 20)
    expect(out).toHaveLength(1)
    expect(out[0].geomKey).toBe(shared)
  })

  it('keeps distinct fields and skips district-scale service areas', () => {
    const pousByWR = new Map<string, PouRecord[]>([
      ['34-a', [
        pou({ wr: '34-a', geomKey: 'field-a' }),
        pou({ wr: '34-a', geomKey: 'district', areaKm2: 40 }),
      ]],
      ['34-b', [pou({ wr: '34-b', geomKey: 'field-b' })]],
    ])
    const out = uniqueSelectedPous(['34-a', '34-b'], pousByWR, 20)
    expect(out.map(p => p.geomKey).sort()).toEqual(['field-a', 'field-b'])
  })
})
