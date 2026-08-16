import { toCsv } from './csv'
import { NEW_GROUND_KM, TRANSFER_DIST_KM, type DataStore } from './data'
import { sideOfMainstem, type ChannelSide } from './sideOfChannel'
import { formatDistanceKm, formatMilesNumber } from './units'

/**
 * Water moved farther — geometric proxy (not a transfer filing or liner inventory).
 *
 * - POD → current POU size-adjusted distance > TRANSFER_DIST_KM
 * - Optional "off-corridor": POU center > NEW_GROUND_KM from NHD mainstem + NWI
 *
 * Priority years on flagged rights are often senior; do NOT treat off-corridor
 * counts as “new ground broken out in the last 10–15 years.”
 */
export interface MovedFartherRow {
  wr: string
  owner: string
  year: number | null
  rate: number
  source: string
  podPouKm: number
  corridorKm: number | null
  offCorridor: boolean
  pouSide: ChannelSide
}

export const MOVED_FARTHER_METHODOLOGY =
  'Proxy only (not a legal determination or transfer filing): rights whose point of diversion ' +
  `is more than ${formatDistanceKm(TRANSFER_DIST_KM, { long: true })} from the current authorized place of use (size-adjusted), ` +
  'from IDWR POD + POU geometry. “Off corridor” means the POU center sits more than ' +
  `${formatDistanceKm(NEW_GROUND_KM, { long: true })} from both the NHD Big Lost mainstem and any NWI riparian polygon — ` +
  'a geometric signal that water is authorized away from the natural river corridor, not proof ' +
  'of a lined canal or of recent breakout. East/west of channel is longitude vs the nearest NHD ' +
  'mainstem vertex (the river generally flows south). Lined canals are visible on satellite; NHD does not mark liners. ' +
  'Sorted by POD↔POU distance.'

export function listMovedFarther(store: DataStore): MovedFartherRow[] {
  const rows: MovedFartherRow[] = []
  for (const [wr, podPouKm] of store.transferDistKm) {
    const rec = store.podsByWR.get(wr)?.[0]
    const corridorKm = store.corridorDistKm.get(wr) ?? null
    const offCorridor = store.newGroundWRs.has(wr)
    const center = store.pouCenter.get(wr)
    const pouSide = center
      ? sideOfMainstem(center[0], center[1], store.mainstemPts)
      : 'unknown'
    rows.push({
      wr,
      owner: rec?.owner || '',
      year: rec?.year ?? null,
      rate: rec?.rate ?? 0,
      source: rec?.source || '',
      podPouKm,
      corridorKm,
      offCorridor,
      pouSide,
    })
  }
  return rows.sort((a, b) => b.podPouKm - a.podPouKm || (a.year ?? 9999) - (b.year ?? 9999))
}

export function movedFartherToCsv(rows: MovedFartherRow[]): string {
  return toCsv(
    [
      'water_right', 'owner', 'priority_year', 'max_diversion_cfs', 'source',
      'pod_pou_mi', 'corridor_mi', 'off_corridor', 'pou_side_of_channel',
    ],
    rows.map(r => [
      r.wr, r.owner, r.year ?? '', r.rate, r.source,
      formatMilesNumber(r.podPouKm, 2),
      r.corridorKm != null ? formatMilesNumber(r.corridorKm, 2) : '',
      r.offCorridor ? 'yes' : 'no',
      r.pouSide,
    ]),
  )
}

export { downloadCsv } from './csv'
