import { describe, expect, it } from 'vitest'
import { CONFLICT_CORRIDOR_KM } from './data'
import {
  DRY_REACH_SENIOR_YEAR,
  MOORE_LAT,
  dryReachSeniorsToCsv,
  listDryReachSeniors,
} from './dryReach'
import { emptyStore, pod } from './test/fixtures'

describe('listDryReachSeniors', () => {
  it('keeps pre-1950 surface rights at or below Moore on the corridor', () => {
    const senior = pod({ wr: '34-100', year: 1949, rate: 10, lat: MOORE_LAT })
    const rows = listDryReachSeniors(emptyStore({ pods: [senior] }))
    expect(rows).toHaveLength(1)
    expect(rows[0].wr).toBe('34-100')
    expect(rows[0].year).toBeLessThan(DRY_REACH_SENIOR_YEAR)
  })

  it('drops groundwater, juniors, upstream of Moore, and off-corridor PODs', () => {
    const pods = [
      pod({ wr: '34-gw', isGW: true, isSurf: false, source: 'GROUND WATER', year: 1920 }),
      pod({ wr: '34-jr', year: 1950, rate: 50 }),
      pod({ wr: '34-up', year: 1920, lat: MOORE_LAT + 0.02 }),
      pod({ wr: '34-far', year: 1920, corridorDistKm: CONFLICT_CORRIDOR_KM + 0.1 }),
    ]
    expect(listDryReachSeniors(emptyStore({ pods }))).toEqual([])
  })

  it('keeps the highest-rate POD per water right and sorts by rate', () => {
    const pods = [
      pod({ wr: '34-a', year: 1910, rate: 3, lat: 43.70 }),
      pod({ wr: '34-a', year: 1910, rate: 8, lat: 43.69 }),
      pod({ wr: '34-b', year: 1884, rate: 12, lat: 43.60 }),
    ]
    const rows = listDryReachSeniors(emptyStore({ pods }))
    expect(rows.map((r) => r.wr)).toEqual(['34-b', '34-a'])
    expect(rows[1].rate).toBe(8)
  })
})

describe('dryReachSeniorsToCsv', () => {
  it('escapes commas and quotes in owner names', () => {
    const csv = dryReachSeniorsToCsv([
      {
        wr: '34-1',
        owner: 'Smith, "Ranch"',
        year: 1910,
        rate: 1.5,
        source: 'BIG LOST RIVER',
        lat: 43.7,
        lon: -113.3,
        corridorKm: 0.4,
      },
    ])
    expect(csv).toContain('"Smith, ""Ranch"""')
    expect(csv.split('\n')[0]).toContain('water_right')
  })
})
