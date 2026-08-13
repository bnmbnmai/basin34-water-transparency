/** Sentinel-2 cloudless annual mosaics (EOX / Copernicus). 2017 is unpublished. */
export const S2_CLOUDLESS_LAYERS: Record<number, string> = {
  2016: 's2cloudless_3857',
  2018: 's2cloudless-2018_3857',
  2019: 's2cloudless-2019_3857',
  2020: 's2cloudless-2020_3857',
  2021: 's2cloudless-2021_3857',
  2022: 's2cloudless-2022_3857',
  2023: 's2cloudless-2023_3857',
  2024: 's2cloudless-2024_3857',
  2025: 's2cloudless-2025_3857',
}

export type LandsatKind = 's2' | 'local' | 'esri'

export interface LandsatSource {
  /** Year actually shown (may snap from the slider). */
  year: number
  kind: LandsatKind
  layer?: string
}

function nearestYear(year: number, years: number[]): number {
  return years.reduce((best, y) => {
    const d = Math.abs(y - year)
    const bd = Math.abs(best - year)
    if (d < bd) return y
    if (d === bd && y > best) return y
    return best
  })
}

/**
 * Pick a source that will actually paint the basin.
 * Esri's public Landsat/MS service is a scene catalog (GLS epochs + Landsat 8
 * strips), not a yearly mosaic — requesting 1995 as a JPEG fills the map with
 * nodata black. Prefer seamless S2 cloudless tiles; fall back to a local
 * basin mosaic; only then hit Esri per-tile with transparent nodata.
 */
export function resolveLandsatSource(year: number, localYears: number[]): LandsatSource {
  const s2Years = Object.keys(S2_CLOUDLESS_LAYERS).map(Number).sort((a, b) => a - b)
  if (S2_CLOUDLESS_LAYERS[year]) {
    return { year, kind: 's2', layer: S2_CLOUDLESS_LAYERS[year] }
  }
  if (year >= 2016 && s2Years.length) {
    const y = nearestYear(year, s2Years)
    return { year: y, kind: 's2', layer: S2_CLOUDLESS_LAYERS[y] }
  }
  if (localYears.includes(year)) return { year, kind: 'local' }
  if (localYears.length) return { year: nearestYear(year, localYears), kind: 'local' }
  return { year, kind: 'esri' }
}

export function landsatHint(requested: number, shown: LandsatSource): string {
  const snap = requested !== shown.year ? `No mosaic for ${requested} — showing ${shown.year}. ` : ''
  if (shown.kind === 's2') {
    return `${snap}Sentinel-2 cloudless mosaic (~10 m). Best for crop circles and new ground.`
  }
  if (shown.kind === 'local') {
    return `${snap}Landsat basin mosaic (~30 m), served locally. Gaps show current satellite underneath.`
  }
  return `${snap}Live Landsat tiles (transparent gaps). Prefer Archive for high-res 2014+.`
}
