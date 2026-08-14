import type { PouRecord } from '../types'

function pouDedupeKey(pou: PouRecord): string {
  return pou.geomKey || `${pou.wr}:${pou.areaKm2}`
}

/**
 * One record per unique field shape. IDWR stores a copy per water right;
 * painting all of them stacks fills so shared pivots look darker than
 * single-right fields.
 */
export function uniquePousByGeom(pous: PouRecord[]): PouRecord[] {
  const seen = new Set<string>()
  const out: PouRecord[] = []
  for (const pou of pous) {
    const key = pouDedupeKey(pou)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pou)
  }
  return out
}

/**
 * One polygon per unique field when several rights share a POU.
 * Stacking identical fills was painting satellite fields opaque white.
 */
export function uniqueSelectedPous(
  selectedWRs: Iterable<string>,
  pousByWR: Map<string, PouRecord[]>,
  districtKm2: number,
  opts: { geomKey?: string | null } = {},
): PouRecord[] {
  const seen = new Set<string>()
  const out: PouRecord[] = []
  for (const wr of selectedWRs) {
    for (const pou of pousByWR.get(wr) || []) {
      if (pou.areaKm2 >= districtKm2) continue
      if (opts.geomKey && pou.geomKey !== opts.geomKey) continue
      const key = pouDedupeKey(pou)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(pou)
    }
  }
  return out
}
