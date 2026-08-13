import { describe, expect, it } from 'vitest'
import { parseWaterRight, waterRightReportUrl } from './wrLinks'

describe('parseWaterRight', () => {
  it('splits basin, sequence, and suffix', () => {
    expect(parseWaterRight('34-13725')).toEqual({ basin: '34', seq: '13725', suffix: '' })
    expect(parseWaterRight('34-2401E')).toEqual({ basin: '34', seq: '2401', suffix: 'E' })
  })

  it('builds a report URL', () => {
    expect(waterRightReportUrl('34-622A')).toContain('seq=622')
    expect(waterRightReportUrl('34-622A')).toContain('suffix=A')
  })
})
