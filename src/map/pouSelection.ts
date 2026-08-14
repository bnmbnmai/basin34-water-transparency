import type { PouRecord } from '../types'

/**
 * One polygon per unique field when several rights share a POU.
 * Stacking identical fills was painting satellite fields opaque white.
 */
export function uniqueSelectedPous(
  selectedWRs: Iterable<string>,
  pousByWR: Map<string, PouRecord[]>,
  districtKm2: number,
): PouRecord[] {
  const seen = new Set<string>()
  const out: PouRecord[] = []
  for (const wr of selectedWRs) {
    for (const pou of pousByWR.get(wr) || []) {
      if (pou.areaKm2 >= districtKm2) continue
      const key = pou.geomKey || `${pou.wr}:${pou.areaKm2}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(pou)
    }
  }
  return out
}
