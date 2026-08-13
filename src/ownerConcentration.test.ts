import { describe, expect, it } from 'vitest'
import { listOwnerConcentration, ownerSizeBands } from './ownerConcentration'
import { emptyStore, pod } from './test/fixtures'

describe('listOwnerConcentration', () => {
  it('sums one authorized rate per water right by owner', () => {
    const a1 = pod({ wr: '34-a', owner: 'Large Co', rate: 10, lat: 43.9 })
    const a2 = pod({ wr: '34-a', owner: 'Large Co', rate: 10, lat: 43.91 })
    const b = pod({ wr: '34-b', owner: 'Small Farm', rate: 1.5, lat: 43.58, isGW: true, isSurf: false, source: 'GROUND WATER' })
    const store = emptyStore({
      pods: [a1, a2, b],
      podsByWR: new Map([
        ['34-a', [a1, a2]],
        ['34-b', [b]],
      ]),
    })
    const rows = listOwnerConcentration(store)
    expect(rows[0].owner).toBe('Large Co')
    expect(rows[0].cfs).toBe(10)
    expect(rows[0].rights).toBe(1)
    expect(rows[0].aboveMooreCfs).toBe(10)
    expect(rows[1].belowMooreCfs).toBe(1.5)
    expect(rows[1].gwCfs).toBe(1.5)
    expect(ownerSizeBands(rows)).toEqual({ small: 1, mid: 1, large: 0 })
  })
})
