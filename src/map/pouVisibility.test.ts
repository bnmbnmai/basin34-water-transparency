import { describe, expect, it } from 'vitest'
import { basinPouOutlinesAllowed } from './pouVisibility'

describe('basinPouOutlinesAllowed', () => {
  it('hides today’s POU outlines on Year and Archive unless asked', () => {
    expect(basinPouOutlinesAllowed('landsat', false)).toBe(false)
    expect(basinPouOutlinesAllowed('wayback', false)).toBe(false)
    expect(basinPouOutlinesAllowed('landsat', true)).toBe(true)
    expect(basinPouOutlinesAllowed('wayback', true)).toBe(true)
  })

  it('keeps current-satellite POU behavior', () => {
    expect(basinPouOutlinesAllowed('current', false)).toBe(true)
  })
})
