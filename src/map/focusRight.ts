import type { PodRecord } from '../types'

/** Readable field-scale zoom on a single diversion. */
export const FOCUS_ZOOM = 16
export const FOCUS_MIN_ZOOM = 16
/** Skip district-scale POUs and far-away fields when framing a right. */
export const NEARBY_POU_KM = 5

export function podKey(rec: { wr: string; lat: number; lon: number; rate: number }): string {
  return `${rec.wr}|${rec.lat.toFixed(6)}|${rec.lon.toFixed(6)}|${rec.rate}`
}

export function primaryPodForRight<T extends { rate: number; wr: string }>(pods: T[]): T | null {
  if (!pods.length) return null
  return [...pods].sort((a, b) => b.rate - a.rate || a.wr.localeCompare(b.wr))[0]
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Frame the highest-rate POD; include a field only if it sits next to that POD. */
export function shouldIncludePouInFocus(
  primary: { lat: number; lon: number },
  pouCenter: [number, number] | undefined,
): boolean {
  if (!pouCenter) return false
  return haversineKm(primary.lat, primary.lon, pouCenter[0], pouCenter[1]) <= NEARBY_POU_KM
}

export function focusViewForRight(
  pods: Array<Pick<PodRecord, 'lat' | 'lon' | 'rate' | 'wr'>>,
  _pouCenter?: [number, number],
): { lat: number; lon: number; zoom: number } | null {
  const primary = primaryPodForRight(pods)
  if (!primary) return null
  return {
    lat: primary.lat,
    lon: primary.lon,
    zoom: FOCUS_ZOOM,
  }
}
