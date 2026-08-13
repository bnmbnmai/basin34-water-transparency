/**
 * Geometric east/west of the NHD Big Lost mainstem.
 * The river generally flows south, so a point west of the nearest mainstem
 * vertex has a more-westerly longitude. Not a named-canal inventory and not
 * a liner finding.
 */

export type ChannelSide = 'east' | 'west' | 'unknown'

export function sideOfMainstem(
  lat: number,
  lon: number,
  mainstemPts: Array<[number, number]>,
): ChannelSide {
  if (!mainstemPts.length) return 'unknown'
  let best = Infinity
  let bestLon = 0
  for (const [mlat, mlon] of mainstemPts) {
    const dLat = Math.abs(lat - mlat) * 111
    if (dLat >= best) continue
    const dLon = Math.abs(lon - mlon) * 111 * Math.cos((lat * Math.PI) / 180)
    const d = Math.sqrt(dLat * dLat + dLon * dLon)
    if (d < best) {
      best = d
      bestLon = mlon
    }
  }
  if (!isFinite(best) || best > 25) return 'unknown'
  const dLonDeg = lon - bestLon
  if (Math.abs(dLonDeg) < 0.0004) return 'unknown'
  return dLonDeg < 0 ? 'west' : 'east'
}

export function lineMidpoint(geom: { type?: string; coordinates?: any } | null | undefined): [number, number] | null {
  if (!geom?.coordinates) return null
  const lines: number[][][] =
    geom.type === 'LineString' ? [geom.coordinates] :
    geom.type === 'MultiLineString' ? geom.coordinates : []
  let best: number[][] | null = null
  let bestLen = -1
  for (const line of lines) {
    if (line?.length > bestLen) {
      best = line
      bestLen = line.length
    }
  }
  if (!best?.length) return null
  const mid = best[Math.floor(best.length / 2)]
  return [mid[1], mid[0]]
}

export function collectMainstemPts(features: Array<{ geometry?: { type?: string; coordinates?: any } }>): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (const f of features) {
    const g = f.geometry
    if (!g?.coordinates) continue
    const lines: number[][][] =
      g.type === 'LineString' ? [g.coordinates] :
      g.type === 'MultiLineString' ? g.coordinates : []
    for (const line of lines) {
      for (const [lon, lat] of line) pts.push([lat, lon])
    }
  }
  return pts
}
