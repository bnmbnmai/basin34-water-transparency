import { type DataStore } from './data'
import { toCsv } from './csv'
import { MOORE_LAT } from './dryReach'
import type { WellRecord } from './types'

export const WELL_PRESSURE_METHODOLOGY =
  'Drill-time static water level and total depth from IDWR well logs, for wells at or below the Moore diversion latitude. ' +
  'Static water level is the depth reported at construction — not a current monitoring time series. Newer, deeper logs ' +
  'are a first-order signal of a falling water table, not a finding that any named well is dry.'

export interface WellDecadeRow {
  decade: string
  count: number
  medianSwl: number | null
  medianDepth: number | null
  domestic: number
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function lowerValleyWells(store: DataStore): WellRecord[] {
  return store.wells.filter(w => w.lat <= MOORE_LAT)
}

export function wellPressureByDecade(wells: WellRecord[]): WellDecadeRow[] {
  const buckets = new Map<number, WellRecord[]>()
  for (const w of wells) {
    if (w.year == null || w.year < 1800 || w.year > 2100) continue
    const d = Math.floor(w.year / 10) * 10
    const list = buckets.get(d)
    if (list) list.push(w)
    else buckets.set(d, [w])
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, list]) => ({
      decade: `${decade}s`,
      count: list.length,
      medianSwl: median(list.map(w => w.swl).filter((n): n is number => n != null && n > 0)),
      medianDepth: median(list.map(w => w.depth).filter((n): n is number => n != null && n > 0)),
      domestic: list.filter(w => w.use.includes('DOMESTIC') || w.use.includes('HOUSEHOLD') || !w.use).length,
    }))
}

export function wellPressureToCsv(wells: WellRecord[]): string {
  return toCsv(
    ['well_id', 'owner', 'use', 'year', 'total_depth_ft', 'static_wl_ft', 'lat', 'lon'],
    wells.map(w => {
      const p = w.feature.properties || {}
      return [
        p.WellID ?? '',
        p.Owner ?? '',
        p.WellUse ?? '',
        w.year ?? '',
        w.depth ?? '',
        w.swl ?? '',
        w.lat.toFixed(5),
        w.lon.toFixed(5),
      ]
    }),
  )
}
