import { CONFLICT_CORRIDOR_KM, type DataStore } from './data'
import { toCsv } from './csv'
import { MOORE_LAT } from './dryReach'
import type { PodRecord } from './types'
import { formatDistanceKm, formatMilesNumber } from './units'

/** USGS 13132500 near Arco — lower-basin extent gage. */
export const ARCO_LAT = 43.5822222
export const ARCO_LON = -113.2705556

export const LOWER_VALLEY_METHODOLOGY =
  'Proxy only (not a determination): surface irrigation rights with a POD at or below the Moore diversion ' +
  `(USGS 13132100), ranked by priority year. “On dry-styled channel” means the POD is also within ${formatDistanceKm(CONFLICT_CORRIDOR_KM, { long: true })} of the ` +
  'NHD Big Lost mainstem (the reach the map draws dashed brown in the recent-era view) — not tributary ' +
  'wetlands such as Antelope Creek. Distance is to the Arco gage (USGS 13132500). Authorized max cfs is not ' +
  'actual delivery. Sources: IDWR PODs + NHD mainstem.'

export interface LowerValleyRow {
  wr: string
  owner: string
  year: number | null
  rate: number
  source: string
  diversion: string
  lat: number
  lon: number
  arcoKm: number
  mainstemKm: number
  onDryChannel: boolean
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = Math.abs(lat1 - lat2) * 111
  const dLon = Math.abs(lon1 - lon2) * 111 * Math.cos((lat1 * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLon * dLon)
}

function isSurfaceIrrigation(rec: PodRecord): boolean {
  if (rec.isGW || !rec.isSurf) return false
  const uses = rec.uses.toUpperCase()
  if (!uses) return rec.source.toUpperCase().includes('RIVER') || rec.source.toUpperCase().includes('SLOUGH')
  return uses.includes('IRRIG')
}

/** One row per water right (highest-rate matching POD). Ranked senior-first. */
export function listLowerValleySurface(store: DataStore): LowerValleyRow[] {
  const best = new Map<string, LowerValleyRow>()
  for (const rec of store.pods) {
    if (!rec.wr) continue
    if (rec.lat > MOORE_LAT) continue
    if (!isSurfaceIrrigation(rec)) continue
    const arcoKm = distKm(rec.lat, rec.lon, ARCO_LAT, ARCO_LON)
    const row: LowerValleyRow = {
      wr: rec.wr,
      owner: rec.owner,
      year: rec.year,
      rate: rec.rate,
      source: rec.source,
      diversion: rec.diversionName,
      lat: rec.lat,
      lon: rec.lon,
      arcoKm,
      mainstemKm: rec.mainstemDistKm,
      onDryChannel: rec.mainstemDistKm <= CONFLICT_CORRIDOR_KM,
    }
    const prev = best.get(rec.wr)
    if (!prev || rec.rate > prev.rate || (rec.rate === prev.rate && arcoKm < prev.arcoKm)) {
      best.set(rec.wr, row)
    }
  }
  return [...best.values()].sort(
    (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || b.rate - a.rate || a.wr.localeCompare(b.wr),
  )
}

export function lowerValleyToCsv(rows: LowerValleyRow[]): string {
  return toCsv(
    [
      'water_right', 'owner', 'priority_year', 'max_diversion_cfs', 'source', 'diversion',
      'lat', 'lon', 'arco_gage_mi', 'mainstem_mi', 'on_dry_styled_channel',
    ],
    rows.map(r => [
      r.wr, r.owner, r.year ?? '', r.rate, r.source, r.diversion,
      r.lat.toFixed(5), r.lon.toFixed(5), formatMilesNumber(r.arcoKm, 2),
      isFinite(r.mainstemKm) ? formatMilesNumber(r.mainstemKm, 2) : '',
      r.onDryChannel ? 'yes' : 'no',
    ]),
  )
}
