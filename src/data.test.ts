import { describe, expect, it } from 'vitest'
import { epochMsToYear } from './data'

describe('epochMsToYear', () => {
  it('parses post-1970 IDWR epoch milliseconds', () => {
    expect(epochMsToYear(Date.UTC(1990, 6, 1))).toBe(1990)
  })

  it('parses pre-1970 dates (negative epoch) instead of dropping seniors', () => {
    const pd = Date.UTC(1940, 6, 15)
    expect(pd).toBeLessThan(0)
    expect(epochMsToYear(pd)).toBe(1940)
  })

  it('parses 1884-class territorial priorities', () => {
    expect(epochMsToYear(Date.UTC(1884, 6, 1))).toBe(1884)
  })

  it('rejects non-numbers and out-of-range years', () => {
    expect(epochMsToYear('633769200000')).toBeNull()
    expect(epochMsToYear(NaN)).toBeNull()
    expect(epochMsToYear(Date.UTC(1200, 0, 1))).toBeNull()
    expect(epochMsToYear(null)).toBeNull()
  })
})
