import { CONFLICT_CORRIDOR_KM, type DataStore } from './data'
import { toCsv } from './csv'
import type { PodRecord } from './types'

/** Moore diversion — surface flow often ends near here in recent years (USGS 13132100). */
export const MOORE_LAT = 43.7843611

/** Senior cutoff for the dry-reach lens (exclusive). */
export const DRY_REACH_SENIOR_YEAR = 1950

/**
 * Downstream seniors on a dry reach — public-data proxy, not a legal finding.
 *
 * - IDWR source is the Big Lost River or Ferris Slough (not tributaries)
 * - Priority year < 1950
 * - POD within CONFLICT_CORRIDOR_KM of the NHD Big Lost mainstem (not NWI)
 * - At or below Moore diversion (POD latitude ≤ Moore gage lat)
 */
export interface DryReachSeniorRow {
  wr: string
  owner: string
  year: number
  rate: number
  source: string
  uses: string
  lat: number
  lon: number
  mainstemKm: number
}

export const DRY_REACH_METHODOLOGY =
  'Proxy only (not a legal determination): rights whose IDWR source is the Big Lost River ' +
  'or Ferris Slough (a connected lower-valley channel), with priority before 1950, ' +
  'a POD within 3 km of the NHD Big Lost mainstem, and at or below the Moore diversion ' +
  '(USGS 13132100). Tributaries such as Antelope Creek are excluded even when they sit ' +
  'near NWI riparian wetlands. Distance is to the NHD mainstem, not to tributary wetlands. ' +
  'Authorized max cfs is not actual delivery. Sources: IDWR PODs + NHD mainstem. Sorted by diversion rate (cfs).'

/** Big Lost mainstem or the named lower-valley slough — not Antelope / Dry Fork / springs. */
export function isDryReachSource(rec: PodRecord): boolean {
  if (rec.isGW) return false
  const s = rec.source.toUpperCase()
  return s.includes('BIG LOST') || s.includes('FERRIS SLOUGH')
}

/** One row per water right (highest rate among matching PODs). */
export function listDryReachSeniors(store: DataStore): DryReachSeniorRow[] {
  const best = new Map<string, DryReachSeniorRow>()
  for (const rec of store.pods) {
    if (rec.year == null || rec.year >= DRY_REACH_SENIOR_YEAR) continue
    if (!isDryReachSource(rec)) continue
    if (rec.mainstemDistKm > CONFLICT_CORRIDOR_KM) continue
    if (rec.lat > MOORE_LAT) continue
    if (!rec.wr) continue

    const prev = best.get(rec.wr)
    if (!prev || rec.rate > prev.rate) {
      best.set(rec.wr, {
        wr: rec.wr,
        owner: rec.owner,
        year: rec.year,
        rate: rec.rate,
        source: rec.source,
        uses: rec.uses,
        lat: rec.lat,
        lon: rec.lon,
        mainstemKm: rec.mainstemDistKm,
      })
    }
  }
  return [...best.values()].sort((a, b) => b.rate - a.rate || a.year - b.year)
}

export function dryReachSeniorsToCsv(rows: DryReachSeniorRow[]): string {
  return toCsv(
    ['water_right', 'owner', 'priority_year', 'max_diversion_cfs', 'source', 'uses', 'lat', 'lon', 'mainstem_km'],
    rows.map(r => [
      r.wr, r.owner, r.year, r.rate, r.source, r.uses,
      r.lat.toFixed(5), r.lon.toFixed(5), r.mainstemKm.toFixed(2),
    ]),
  )
}

export { downloadCsv } from './csv'
