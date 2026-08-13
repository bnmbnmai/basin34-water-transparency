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
  it('keeps pre-1950 Big Lost rights at or below Moore on the mainstem', () => {
    const senior = pod({ wr: '34-100', year: 1949, rate: 10, lat: MOORE_LAT })
    const rows = listDryReachSeniors(emptyStore({ pods: [senior] }))
    expect(rows).toHaveLength(1)
    expect(rows[0].wr).toBe('34-100')
    expect(rows[0].year).toBeLessThan(DRY_REACH_SENIOR_YEAR)
  })

  it('keeps Ferris Slough (connected lower-valley channel)', () => {
    const slough = pod({
      wr: '34-slough',
      year: 1910,
      source: 'FERRIS SLOUGH',
      lat: 43.60,
      mainstemDistKm: 1.1,
    })
    expect(listDryReachSeniors(emptyStore({ pods: [slough] })).map(r => r.wr)).toEqual(['34-slough'])
  })

  it('drops Antelope Creek even when NWI corridor distance is tiny', () => {
    const antelope = pod({
      wr: '34-ant',
      year: 1910,
      rate: 40,
      source: 'ANTELOPE CREEK',
      lat: 43.72,
      lon: -113.55,
      corridorDistKm: 0.4,
      mainstemDistKm: 9.6,
    })
    expect(listDryReachSeniors(emptyStore({ pods: [antelope] }))).toEqual([])
  })

  it('drops other named tributaries and springs', () => {
    const pods = [
      pod({ wr: '34-df', year: 1920, source: 'DRY FORK CREEK', corridorDistKm: 0.2, mainstemDistKm: 18 }),
      pod({ wr: '34-sp', year: 1885, source: 'SPRING', isSurf: true, corridorDistKm: 1, mainstemDistKm: 16 }),
      pod({ wr: '34-ch', year: 1910, source: 'CHAMPAGNE CREEK', corridorDistKm: 0.5, mainstemDistKm: 20 }),
    ]
    expect(listDryReachSeniors(emptyStore({ pods }))).toEqual([])
  })

  it('drops groundwater, juniors, upstream of Moore, and off-mainstem PODs', () => {
    const pods = [
      pod({ wr: '34-gw', isGW: true, isSurf: false, source: 'GROUND WATER', year: 1920 }),
      pod({ wr: '34-jr', year: 1950, rate: 50 }),
      pod({ wr: '34-up', year: 1920, lat: MOORE_LAT + 0.02 }),
      pod({ wr: '34-far', year: 1920, mainstemDistKm: CONFLICT_CORRIDOR_KM + 0.1 }),
    ]
    expect(listDryReachSeniors(emptyStore({ pods }))).toEqual([])
  })

  it('drops a Big Lost-named right that is only near NWI, not the mainstem', () => {
    const rec = pod({
      wr: '34-nwi',
      year: 1910,
      source: 'BIG LOST RIVER',
      corridorDistKm: 0.3,
      mainstemDistKm: CONFLICT_CORRIDOR_KM + 1,
    })
    expect(listDryReachSeniors(emptyStore({ pods: [rec] }))).toEqual([])
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
        uses: 'IRRIGATION',
        lat: 43.7,
        lon: -113.3,
        mainstemKm: 0.4,
      },
    ])
    expect(csv).toContain('"Smith, ""Ranch"""')
    expect(csv.split('\n')[0]).toContain('water_right')
    expect(csv.split('\n')[0]).toContain('mainstem_km')
  })
})
