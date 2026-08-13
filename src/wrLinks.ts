/** IDWR public record links for a Basin 34 water-right number. */

export function parseWaterRight(wr: string): { basin: string; seq: string; suffix: string } | null {
  const m = wr.trim().match(/^(\d+)\s*-\s*(\d+)([A-Za-z]?)$/)
  if (!m) return null
  return { basin: m[1], seq: m[2], suffix: m[3].toUpperCase() }
}

export function waterRightReportUrl(wr: string): string | null {
  const p = parseWaterRight(wr)
  if (!p) return null
  return `https://research.idwr.idaho.gov/apps/shared/WrExtSearch/Reports/WaterRightReport?basin=${p.basin}&seq=${p.seq}&suffix=${p.suffix}`
}

export const TRANSFER_SEARCH_URL =
  'https://research.idwr.idaho.gov/apps/waterrights/relateddocs/searchtransfers.html'
