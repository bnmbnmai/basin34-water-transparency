/**
 * Display units for the public map. Geometry and thresholds stay in km internally;
 * only labels, tables, hover, CSV, and the scale bar convert.
 *
 * Default is US customary (Idaho irrigation): miles, feet when short, acres.
 * cfs and acre-feet are already the source units and are not converted here.
 */

export const MILES_PER_KM = 0.621371192
export const FEET_PER_KM = 3280.839895
export const ACRES_PER_KM2 = 247.10538146717

/** Show feet instead of miles below this (~0.2 mi / ~1,000 ft). */
const SHORT_MILES = 0.2

export function kmToMiles(km: number): number {
  return km * MILES_PER_KM
}

export function kmToFeet(km: number): number {
  return km * FEET_PER_KM
}

export function km2ToAcres(km2: number): number {
  return km2 * ACRES_PER_KM2
}

export function formatDistanceKm(
  km: number,
  opts?: { digits?: number; long?: boolean },
): string {
  if (!Number.isFinite(km)) return '—'
  const miles = kmToMiles(km)
  if (miles < SHORT_MILES) {
    const ft = Math.round(kmToFeet(km))
    return opts?.long ? `${ft.toLocaleString()} feet` : `${ft.toLocaleString()} ft`
  }
  const digits = opts?.digits ?? (miles < 10 ? 1 : 0)
  const n = miles.toFixed(digits)
  if (opts?.long) return `${n} ${n === '1' || n === '1.0' ? 'mile' : 'miles'}`
  return `${n} mi`
}

/** Numeric miles for table cells / CSV (one unit per column). */
export function formatMilesNumber(km: number, digits = 1): string {
  if (!Number.isFinite(km)) return '—'
  return kmToMiles(km).toFixed(digits)
}

export function formatAcresFromKm2(
  km2: number,
  opts?: { digits?: number; approx?: boolean },
): string {
  if (!Number.isFinite(km2) || km2 <= 0) return ''
  const acres = km2ToAcres(km2)
  const n =
    opts?.digits != null
      ? Number(acres.toFixed(opts.digits)).toLocaleString()
      : Math.round(acres).toLocaleString()
  return `${opts?.approx ? '~' : ''}${n} acres`
}
