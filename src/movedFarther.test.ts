import { describe, expect, it } from 'vitest'
import { listMovedFarther, movedFartherToCsv } from './movedFarther'
import { emptyStore, pod } from './test/fixtures'

describe('listMovedFarther', () => {
  it('sorts by POD↔POU distance and flags off-corridor rights', () => {
    const a = pod({ wr: '34-near', owner: 'A', year: 1920, rate: 1 })
    const b = pod({ wr: '34-far', owner: 'B', year: 1985, rate: 4 })
    const store = emptyStore({
      pods: [a, b],
      podsByWR: new Map([
        ['34-near', [a]],
        ['34-far', [b]],
      ]),
      transferDistKm: new Map([
        ['34-near', 9],
        ['34-far', 22],
      ]),
      corridorDistKm: new Map([
        ['34-near', 0.2],
        ['34-far', 4],
      ]),
      newGroundWRs: new Set(['34-far']),
    })
    const rows = listMovedFarther(store)
    expect(rows.map((r) => r.wr)).toEqual(['34-far', '34-near'])
    expect(rows[0].offCorridor).toBe(true)
    expect(rows[1].offCorridor).toBe(false)
  })
})

describe('movedFartherToCsv', () => {
  it('writes yes/no for off_corridor', () => {
    const csv = movedFartherToCsv([
      {
        wr: '34-1',
        owner: 'Owner',
        year: 1910,
        rate: 2,
        source: 'BIG LOST RIVER',
        podPouKm: 10.5,
        corridorKm: 2,
        offCorridor: true,
      },
    ])
    expect(csv).toMatch(/off_corridor/)
    expect(csv).toMatch(/,yes$/)
  })
})
