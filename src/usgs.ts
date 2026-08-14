/** Live USGS NWIS annual statistics (CORS-enabled public API). */

export interface AnnualMean {
  year: number
  cfs: number
}

/** Per-calendar-year stats derived from NWIS daily mean values (00060, stat 00003). */
export interface YearFlowStats {
  year: number
  /** Mean of all daily values that year (dry days = 0). Honest calendar-year mean. */
  calendarMeanCfs: number
  daysWithData: number
  daysWithFlow: number
  irrigationMeanCfs: number
  irrigationDaysWithData: number
  irrigationDaysWithFlow: number
  /** USGS published annual mean when the statistics service reports that year. */
  publishedMeanCfs?: number
  /** Fewer than 300 daily values — annual mean may not represent a full water year. */
  partialCoverage: boolean
}

export interface GageFlowHistory {
  published: AnnualMean[]
  dailyByYear: YearFlowStats[]
}

const cache = new Map<string, Promise<AnnualMean[]>>()
const historyCache = new Map<string, Promise<GageFlowHistory>>()

/**
 * Annual mean discharge (cfs) per calendar year for a gage, full period of
 * record. Parses the RDB (tab-separated) format of the NWIS statistics
 * service; columns: agency_cd site_no parameter_cd ts_id loc_web_ds year_nu mean_va.
 */
export function fetchAnnualMeans(siteNo: string): Promise<AnnualMean[]> {
  let p = cache.get(siteNo)
  if (!p) {
    p = doFetch(siteNo)
    cache.set(siteNo, p)
  }
  return p
}

/** Parse NWIS statistics RDB (tab-separated) into year/cfs rows. Exported for tests. */
export function parseAnnualMeansRdb(text: string): AnnualMean[] {
  const out: AnnualMean[] = []
  let header: string[] | null = null
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const cols = line.split('\t')
    if (!header) {
      header = cols
      continue
    }
    if (/^\d+[sn]$/.test(cols[0])) continue // column-width spec row
    const yearIdx = header.indexOf('year_nu')
    const meanIdx = header.indexOf('mean_va')
    if (yearIdx < 0 || meanIdx < 0) continue
    const year = parseInt(cols[yearIdx], 10)
    const cfs = parseFloat(cols[meanIdx])
    if (isFinite(year) && isFinite(cfs)) out.push({ year, cfs })
  }
  out.sort((a, b) => a.year - b.year)
  return out
}

async function doFetch(siteNo: string): Promise<AnnualMean[]> {
  // Deliberately NOT passing missingData=on: that would include partial years
  // (e.g. a gage installed/removed mid-season), whose "annual" means are
  // computed from only the wet or only the dry months and would distort the
  // record. Complete years only — so a record that ends early means the gage
  // was discontinued (labeled in the chart), and a 0.0 value is a real
  // measured zero-flow year, not a data gap.
  const url =
    'https://waterservices.usgs.gov/nwis/stat/?format=rdb' +
    `&sites=${encodeURIComponent(siteNo)}&statReportType=annual&statTypeCd=mean&parameterCd=00060`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NWIS stat service: HTTP ${res.status}`)
  return parseAnnualMeansRdb(await res.text())
}

/** Full gage history: published annual means + daily-derived calendar-year stats. */
export function fetchGageFlowHistory(siteNo: string): Promise<GageFlowHistory> {
  let p = historyCache.get(siteNo)
  if (!p) {
    p = Promise.all([fetchAnnualMeans(siteNo), fetchDailyYearSummaries(siteNo)]).then(
      ([published, dailyByYear]) => ({ published, dailyByYear }),
    )
    historyCache.set(siteNo, p)
  }
  return p
}

export interface DailyCfs {
  date: string
  year: number
  month: number
  dayOfYear: number
  cfs: number
}

/** Apr–Oct irrigation season (calendar months). */
export function isIrrigationMonth(month: number): boolean {
  return month >= 4 && month <= 10
}

function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 1)
  const at = Date.UTC(year, month - 1, day)
  return Math.floor((at - start) / 86400000) + 1
}

/** Parse NWIS daily-values RDB (00060) into dated CFS rows. Exported for tests. */
export function parseDailyDischargeRdb(text: string): DailyCfs[] {
  const out: DailyCfs[] = []
  let header: string[] | null = null
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const cols = line.split('\t')
    if (!header) {
      header = cols
      continue
    }
    if (/^\d+[sn]$/.test(cols[0])) continue
    const dtIdx = header.indexOf('datetime')
    if (dtIdx < 0 || cols.length < dtIdx + 2) continue
    const dt = cols[dtIdx]
    const year = parseInt(dt.slice(0, 4), 10)
    const month = parseInt(dt.slice(5, 7), 10)
    const day = parseInt(dt.slice(8, 10), 10)
    if (!isFinite(year) || !isFinite(month) || !isFinite(day)) continue
    let cfs: number | null = null
    for (let i = dtIdx + 1; i < cols.length; i++) {
      if (cols[i].endsWith('_cd')) continue
      const v = parseFloat(cols[i])
      if (isFinite(v)) { cfs = v; break }
    }
    if (cfs == null) continue
    out.push({
      date: dt.slice(0, 10),
      year,
      month,
      dayOfYear: dayOfYear(year, month, day),
      cfs: Math.max(0, cfs),
    })
  }
  return out
}

export function summarizeDailyByYear(
  days: DailyCfs[],
  published: AnnualMean[] = [],
): YearFlowStats[] {
  const byYear = new Map<number, {
    sum: number; days: number; flowDays: number
    irrigSum: number; irrigDays: number; irrigFlowDays: number
  }>()
  for (const d of days) {
    let bucket = byYear.get(d.year)
    if (!bucket) {
      byYear.set(d.year, (bucket = {
        sum: 0, days: 0, flowDays: 0,
        irrigSum: 0, irrigDays: 0, irrigFlowDays: 0,
      }))
    }
    bucket.sum += d.cfs
    bucket.days++
    if (d.cfs > 0.01) bucket.flowDays++
    if (isIrrigationMonth(d.month)) {
      bucket.irrigSum += d.cfs
      bucket.irrigDays++
      if (d.cfs > 0.01) bucket.irrigFlowDays++
    }
  }
  const pubByYear = new Map(published.map(d => [d.year, d.cfs]))
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, b]) => ({
      year,
      calendarMeanCfs: b.days ? b.sum / b.days : 0,
      daysWithData: b.days,
      daysWithFlow: b.flowDays,
      irrigationMeanCfs: b.irrigDays ? b.irrigSum / b.irrigDays : 0,
      irrigationDaysWithData: b.irrigDays,
      irrigationDaysWithFlow: b.irrigFlowDays,
      publishedMeanCfs: pubByYear.get(year),
      partialCoverage: b.days < 300,
    }))
}

async function fetchDailyYearSummaries(siteNo: string): Promise<YearFlowStats[]> {
  const url =
    'https://waterservices.usgs.gov/nwis/dv/?format=rdb' +
    `&sites=${encodeURIComponent(siteNo)}&parameterCd=00060&statCd=00003` +
    '&startDT=1900-01-01&endDT=2026-12-31'
  const res = await fetch(url)
  if (!res.ok) return []
  const published = await fetchAnnualMeans(siteNo)
  return summarizeDailyByYear(parseDailyDischargeRdb(await res.text()), published)
}

const dailyYearCache = new Map<string, Promise<DailyCfs[]>>()

/** Daily mean CFS for one calendar year (NWIS startDT/endDT — not the full POR). */
export function fetchDailyYear(siteNo: string, year: number): Promise<DailyCfs[]> {
  const key = `${siteNo}:${year}`
  let p = dailyYearCache.get(key)
  if (!p) {
    p = (async () => {
      const url =
        'https://waterservices.usgs.gov/nwis/dv/?format=rdb' +
        `&sites=${encodeURIComponent(siteNo)}&parameterCd=00060&statCd=00003` +
        `&startDT=${year}-01-01&endDT=${year}-12-31`
      const res = await fetch(url)
      if (!res.ok) return []
      return parseDailyDischargeRdb(await res.text())
    })()
    dailyYearCache.set(key, p)
  }
  return p
}
export function mergedYearSeries(
  history: GageFlowHistory,
): Array<{
  year: number
  cfs: number
  daysWithFlow?: number
  daysWithData?: number
  irrigationDaysWithFlow?: number
  irrigationMeanCfs?: number
  partial?: boolean
  source: 'published' | 'daily'
}> {
  const byYear = new Map<number, ReturnType<typeof mergedYearSeries>[0]>()
  for (const d of history.dailyByYear) {
    byYear.set(d.year, {
      year: d.year,
      cfs: d.calendarMeanCfs,
      daysWithFlow: d.daysWithFlow,
      daysWithData: d.daysWithData,
      irrigationDaysWithFlow: d.irrigationDaysWithFlow,
      irrigationMeanCfs: d.irrigationMeanCfs,
      partial: d.partialCoverage,
      source: 'daily',
    })
  }
  for (const p of history.published) {
    const prev = byYear.get(p.year)
    byYear.set(p.year, {
      year: p.year,
      cfs: p.cfs,
      daysWithFlow: prev?.daysWithFlow,
      daysWithData: prev?.daysWithData,
      irrigationDaysWithFlow: prev?.irrigationDaysWithFlow,
      irrigationMeanCfs: prev?.irrigationMeanCfs,
      partial: prev?.partial,
      source: 'published',
    })
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year)
}

/** Wet year = max Mackay (or yield) annual mean; recent = latest Arco-zero year since 2015. */
export function pickOverlayYears(
  yieldSeries: Array<{ year: number; cfs: number }>,
  remnantSeries: Array<{ year: number; cfs: number }>,
  zeroCfs = 0.5,
): { wetYear: number; recentYear: number } | null {
  if (!yieldSeries.length) return null
  const wet = yieldSeries.reduce((best, d) => (d.cfs > best.cfs ? d : best), yieldSeries[0])
  const remnantZeros = remnantSeries.filter(d => d.year >= 2015 && d.cfs <= zeroCfs)
  const recent = remnantZeros.length
    ? remnantZeros[remnantZeros.length - 1]
    : remnantSeries.length
      ? remnantSeries[remnantSeries.length - 1]
      : yieldSeries[yieldSeries.length - 1]
  return { wetYear: wet.year, recentYear: recent.year }
}

/** Convert a mean annual flow in cfs to acre-feet per year. */
export function cfsToAfPerYear(cfs: number): number {
  return cfs * 724.46
}

export interface InstantaneousCfs {
  cfs: number
  dateTime: string
  qualifiers: string
}

const ivCache = new Map<string, { at: number; value: InstantaneousCfs | null }>()
const IV_TTL_MS = 5 * 60 * 1000

/**
 * Latest instantaneous discharge (cfs) from USGS NWIS IV JSON.
 * Returns null when the site has no current 00060 value (common for discontinued gages).
 */
export async function fetchInstantaneousCfs(siteNo: string): Promise<InstantaneousCfs | null> {
  const cached = ivCache.get(siteNo)
  if (cached && Date.now() - cached.at < IV_TTL_MS) return cached.value

  const url =
    'https://waterservices.usgs.gov/nwis/iv/?format=json' +
    `&sites=${encodeURIComponent(siteNo)}&parameterCd=00060`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NWIS IV: HTTP ${res.status}`)
  const data = await res.json()
  const series = data?.value?.timeSeries?.[0]
  const v = series?.values?.[0]?.value?.[0]
  let result: InstantaneousCfs | null = null
  if (v && v.value != null && v.value !== '') {
    const cfs = parseFloat(v.value)
    if (isFinite(cfs)) {
      const quals = Array.isArray(v.qualifiers)
        ? v.qualifiers
            .map((q: string | { qualifierCode?: string; qualifierDescription?: string }) =>
              typeof q === 'string' ? q : (q.qualifierCode || q.qualifierDescription || ''),
            )
            .filter(Boolean)
            .join(', ')
        : ''
      result = { cfs, dateTime: v.dateTime || '', qualifiers: quals }
    }
  }
  ivCache.set(siteNo, { at: Date.now(), value: result })
  return result
}

