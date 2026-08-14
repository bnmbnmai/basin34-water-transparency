import { describe, expect, it } from 'vitest'
import { listOwnerRights } from './ownerRights'
import { emptyStore, pod } from '../test/fixtures'

describe('listOwnerRights', () => {
  it('dedupes PODs onto one row per water right, senior-first', () => {
    const store = emptyStore({
      pods: [
        pod({ wr: '34-2', owner: 'Jane Doe', year: 1980, rate: 1, source: 'WELL' }),
        pod({ wr: '34-1', owner: 'Jane Doe', year: 1905, rate: 2, source: 'BIG LOST RIVER' }),
        pod({ wr: '34-1', owner: 'Jane Doe', year: 1905, rate: 5, source: 'BIG LOST RIVER' }),
        pod({ wr: '34-9', owner: 'Other Co', year: 1910, rate: 9, source: 'WELL' }),
      ],
    })
    const rows = listOwnerRights(store, 'jane doe')
    expect(rows.map(r => r.wr)).toEqual(['34-1', '34-2'])
    expect(rows[0].rate).toBe(5)
    expect(rows[0].podCount).toBe(2)
    expect(rows[0].year).toBe(1905)
  })

  it('matches a partial owner name', () => {
    const store = emptyStore({
      pods: [pod({ wr: '34-3', owner: 'Acme Irrigation District', year: 1920, rate: 1 })],
    })
    expect(listOwnerRights(store, 'acme').map(r => r.wr)).toEqual(['34-3'])
    expect(listOwnerRights(store, 'zzz')).toEqual([])
  })
})
