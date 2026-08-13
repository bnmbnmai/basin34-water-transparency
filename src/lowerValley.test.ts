import { describe, expect, it } from 'vitest'
import { MOORE_LAT } from './dryReach'
import { listLowerValleySurface } from './lowerValley'
import { emptyStore, pod } from './test/fixtures'

describe('listLowerValleySurface', () => {
  it('keeps surface irrigation at/below Moore including post-1950 rights', () => {
    const senior = pod({ wr: '34-old', year: 1900, rate: 1.2, lat: 43.58, diversionName: 'ARCO' })
    const mid = pod({ wr: '34-mid', year: 1962, rate: 0.2, lat: 43.58 })
    const gw = pod({ wr: '34-gw', year: 1900, isGW: true, isSurf: false, source: 'GROUND WATER', uses: 'IRRIGATION', lat: 43.58 })
    const up = pod({ wr: '34-up', year: 1885, lat: MOORE_LAT + 0.05 })
    const rows = listLowerValleySurface(emptyStore({ pods: [senior, mid, gw, up] }))
    expect(rows.map(r => r.wr)).toEqual(['34-old', '34-mid'])
    expect(rows[0].diversion).toBe('ARCO')
    expect(rows[0].onDryChannel).toBe(true)
  })

  it('does not flag Antelope Creek irrigation as on the dry-styled channel', () => {
    const antelope = pod({
      wr: '34-ant',
      year: 1910,
      lat: 43.70,
      source: 'ANTELOPE CREEK',
      uses: 'IRRIGATION',
      corridorDistKm: 0.4,
      mainstemDistKm: 9.6,
    })
    const rows = listLowerValleySurface(emptyStore({ pods: [antelope] }))
    expect(rows).toHaveLength(1)
    expect(rows[0].onDryChannel).toBe(false)
  })

  it('ranks by priority year, senior first', () => {
    const a = pod({ wr: '34-a', year: 1975, rate: 8, lat: 43.58 })
    const b = pod({ wr: '34-b', year: 1885, rate: 1, lat: 43.58 })
    const rows = listLowerValleySurface(emptyStore({ pods: [a, b] }))
    expect(rows.map(r => r.wr)).toEqual(['34-b', '34-a'])
  })
})
