import { describe, expect, it } from 'vitest'
import { shouldClusterPods } from './clusterPolicy'

describe('shouldClusterPods', () => {
  it('clusters only the unfiltered basin view', () => {
    expect(shouldClusterPods({
      isolateSelection: false,
      ownerHighlight: null,
      highlightMode: 'none',
      visibleCount: 7000,
    })).toBe(true)
  })

  it('draws individual stars for owner search, receipts, and isolation', () => {
    const base = { isolateSelection: false, ownerHighlight: null, highlightMode: 'none' as const, visibleCount: 7000 }
    expect(shouldClusterPods({ ...base, isolateSelection: true })).toBe(false)
    expect(shouldClusterPods({ ...base, ownerHighlight: 'Jane Doe' })).toBe(false)
    expect(shouldClusterPods({ ...base, highlightMode: 'senior-downstream' })).toBe(false)
    expect(shouldClusterPods({ ...base, highlightMode: 'transfers' })).toBe(false)
    expect(shouldClusterPods({ ...base, visibleCount: 200 })).toBe(false)
  })
})
