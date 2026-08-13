import { type DataStore } from './data'
import { toCsv } from './csv'
import { MOORE_LAT } from './dryReach'

export const OWNER_CONCENTRATION_METHODOLOGY =
  'Paper rights only (not actual delivery): one authorized max rate per water right, summed by IDWR owner name. ' +
  'Above/below Moore uses the highest-rate POD for that right. This is a concentration of authorized cfs, not a ' +
  'finding about administration or use.'

export interface OwnerConcentrationRow {
  owner: string
  rights: number
  cfs: number
  surfCfs: number
  gwCfs: number
  belowMooreCfs: number
  aboveMooreCfs: number
}

export function listOwnerConcentration(store: DataStore): OwnerConcentrationRow[] {
  const byOwner = new Map<string, OwnerConcentrationRow>()
  store.podsByWR.forEach((pods, wr) => {
    if (!wr || !pods.length) return
    const primary = pods.reduce((a, b) => (b.rate > a.rate ? b : a))
    const owner = primary.owner || '(no owner listed)'
    let row = byOwner.get(owner)
    if (!row) {
      row = {
        owner, rights: 0, cfs: 0, surfCfs: 0, gwCfs: 0, belowMooreCfs: 0, aboveMooreCfs: 0,
      }
      byOwner.set(owner, row)
    }
    row.rights += 1
    row.cfs += primary.rate
    if (primary.isGW) row.gwCfs += primary.rate
    else row.surfCfs += primary.rate
    if (primary.lat <= MOORE_LAT) row.belowMooreCfs += primary.rate
    else row.aboveMooreCfs += primary.rate
  })
  return [...byOwner.values()].sort((a, b) => b.cfs - a.cfs || b.rights - a.rights || a.owner.localeCompare(b.owner))
}

export function ownerSizeBands(rows: OwnerConcentrationRow[]): { small: number; mid: number; large: number } {
  const bands = { small: 0, mid: 0, large: 0 }
  for (const r of rows) {
    if (r.cfs < 2) bands.small++
    else if (r.cfs <= 20) bands.mid++
    else bands.large++
  }
  return bands
}

export function ownerConcentrationToCsv(rows: OwnerConcentrationRow[]): string {
  return toCsv(
    ['owner', 'rights', 'authorized_cfs', 'surface_cfs', 'groundwater_cfs', 'below_moore_cfs', 'above_moore_cfs'],
    rows.map(r => [
      r.owner, r.rights, r.cfs.toFixed(2), r.surfCfs.toFixed(2), r.gwCfs.toFixed(2),
      r.belowMooreCfs.toFixed(2), r.aboveMooreCfs.toFixed(2),
    ]),
  )
}
