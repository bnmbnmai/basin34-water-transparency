import type { DataStore } from '../data'
import { epochMsToYear } from '../data'

export interface OwnerRightRow {
  wr: string
  owner: string
  year: number | null
  rate: number
  source: string
  podCount: number
}

/** One row per water right (highest-rate POD), senior-first. */
export function listOwnerRights(store: DataStore, ownerTerm: string): OwnerRightRow[] {
  const term = ownerTerm.trim().toLowerCase()
  if (!term) return []
  const best = new Map<string, OwnerRightRow>()
  for (const rec of store.pods) {
    if (!rec.ownerLc.includes(term)) continue
    const year = rec.year ?? epochMsToYear(rec.feature.properties.PriorityDate)
    const prev = best.get(rec.wr)
    if (!prev) {
      best.set(rec.wr, {
        wr: rec.wr,
        owner: rec.owner,
        year,
        rate: rec.rate,
        source: rec.source,
        podCount: 1,
      })
      continue
    }
    prev.podCount++
    if (rec.rate > prev.rate) {
      prev.rate = rec.rate
      prev.source = rec.source
      prev.owner = rec.owner
      if (year != null) prev.year = year
    }
  }
  return [...best.values()].sort((a, b) => {
    const ya = a.year ?? 9999
    const yb = b.year ?? 9999
    if (ya !== yb) return ya - yb
    return b.rate - a.rate || a.wr.localeCompare(b.wr)
  })
}
