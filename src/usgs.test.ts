import { describe, expect, it } from 'vitest'
import { cfsToAfPerYear, mergedYearSeries, parseAnnualMeansRdb, parseDailyDischargeRdb, pickOverlayYears, summarizeDailyByYear } from './usgs'

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
          irrigationMeanCfs: 14,
          irrigationDaysWithData: 214,
          irrigationDaysWithFlow: 180,
          partialCoverage: false,
        },
        {
          year: 2021,
          calendarMeanCfs: 0,
          daysWithData: 365,
          daysWithFlow: 0,
          irrigationMeanCfs: 0,
          irrigationDaysWithData: 214,
          irrigationDaysWithFlow: 0,
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

const SAMPLE_DV = `# USGS
agency_cd	site_no	datetime	246362_00060_00003	246362_00060_00003_cd
5s	15s	20d	12s	10s
USGS	13132500	2021-01-15	0.00	A
USGS	13132500	2021-06-15	12.0	A
USGS	13132500	2021-06-16	0.00	A
USGS	13132500	2021-11-02	4.0	A
`

describe('parseDailyDischargeRdb / summarizeDailyByYear', () => {
  it('counts irrigation-season (Apr–Oct) flow days separately from winter', () => {
    const days = parseDailyDischargeRdb(SAMPLE_DV)
    expect(days).toHaveLength(4)
    const [row] = summarizeDailyByYear(days)
    expect(row.year).toBe(2021)
    expect(row.daysWithData).toBe(4)
    expect(row.daysWithFlow).toBe(2)
    expect(row.irrigationDaysWithData).toBe(2)
    expect(row.irrigationDaysWithFlow).toBe(1)
    expect(row.irrigationMeanCfs).toBe(6)
  })
})

describe('pickOverlayYears', () => {
  it('picks the wettest yield year and a recent remnant-zero year', () => {
    const picked = pickOverlayYears(
      [{ year: 1997, cfs: 400 }, { year: 2011, cfs: 250 }, { year: 2021, cfs: 180 }],
      [{ year: 1997, cfs: 40 }, { year: 2017, cfs: 2 }, { year: 2021, cfs: 0 }, { year: 2022, cfs: 0 }],
    )
    expect(picked).toEqual({ wetYear: 1997, recentYear: 2022 })
  })
})

