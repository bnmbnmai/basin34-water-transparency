import { describe, expect, it } from 'vitest'
import { cfsToAfPerYear, mergedYearSeries, parseAnnualMeansRdb } from './usgs'

const SAMPLE_RDB = `# USGS NWIS
#
agency_cd	site_no	parameter_cd	ts_id	loc_web_ds	year_nu	mean_va
5s	15s	5s	10s	20s	4s	12s
USGS	13132500	00060	1		2021	0.0
USGS	13132500	00060	1		2022	0.0
USGS	13132500	00060	1		2020	12.5
`

describe('parseAnnualMeansRdb', () => {
  it('skips comments and the column-width spec row, then sorts by year', () => {
    const rows = parseAnnualMeansRdb(SAMPLE_RDB)
    expect(rows).toEqual([
      { year: 2020, cfs: 12.5 },
      { year: 2021, cfs: 0 },
      { year: 2022, cfs: 0 },
    ])
  })

  it('keeps measured zero-flow years', () => {
    expect(parseAnnualMeansRdb(SAMPLE_RDB).filter((r) => r.cfs === 0)).toHaveLength(2)
  })
})

describe('mergedYearSeries', () => {
  it('prefers published annual means over daily calendar means', () => {
    const series = mergedYearSeries({
      published: [{ year: 2020, cfs: 10 }],
      dailyByYear: [
        {
          year: 2020,
          calendarMeanCfs: 8,
          daysWithData: 366,
          daysWithFlow: 200,
          partialCoverage: false,
        },
        {
          year: 2021,
          calendarMeanCfs: 0,
          daysWithData: 365,
          daysWithFlow: 0,
          partialCoverage: false,
        },
      ],
    })
    expect(series.find((r) => r.year === 2020)).toMatchObject({
      cfs: 10,
      source: 'published',
    })
    expect(series.find((r) => r.year === 2021)).toMatchObject({
      cfs: 0,
      source: 'daily',
    })
  })
})

describe('cfsToAfPerYear', () => {
  it('converts cubic feet per second to acre-feet per year', () => {
    expect(cfsToAfPerYear(1)).toBeCloseTo(724.46)
  })
})
