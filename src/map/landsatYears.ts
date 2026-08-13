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

export type LandsatKind = 's2' | 'local' | 'none'

export interface LandsatSource {
  /** Year actually shown (may snap from the slider / permalink). */
  year: number
  kind: LandsatKind
  layer?: string
  /** Landsat-5 TM / Landsat-8 OLI when known from index.json. */
  platform?: string
}

export interface LocalYearMeta {
  file: string
  platform?: string
  sensor?: string
  resolutionM?: number
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

export function s2Years(): number[] {
  return Object.keys(S2_CLOUDLESS_LAYERS).map(Number).sort((a, b) => a - b)
}

/** Slider ticks: local mosaics that actually filled ∪ published S2 years. */
export function availableImageryYears(localYears: number[]): number[] {
  return [...new Set([...localYears, ...s2Years()])].sort((a, b) => a - b)
}

export function resolveLandsatSource(
  year: number,
  localYears: number[],
  localMeta: Record<string, LocalYearMeta> = {},
  opts: { indexReady?: boolean } = {},
): LandsatSource {
  if (S2_CLOUDLESS_LAYERS[year]) {
    return { year, kind: 's2', layer: S2_CLOUDLESS_LAYERS[year] }
  }
  if (localYears.includes(year)) {
    return { year, kind: 'local', platform: localMeta[String(year)]?.platform }
  }
  // Do not snap 1990 → 2016 S2 before index.json has loaded.
  if (year < 2016 && !localYears.length && opts.indexReady === false) {
    return { year, kind: 'none' }
  }
  const available = availableImageryYears(localYears)
  if (available.length) {
    const y = nearestYear(year, available)
    return resolveLandsatSource(y, localYears, localMeta, opts)
  }
  return { year, kind: 'none' }
}

export function imagerySensorLabel(shown: LandsatSource): string {
  if (shown.kind === 's2') return `${shown.year} Sentinel-2 · 10 m`
  if (shown.kind === 'local') {
    const n = shown.platform === 'landsat-8' ? '8' : shown.platform === 'landsat-5' ? '5' : ''
    const sat = n ? `Landsat ${n}` : 'Landsat'
    return `${shown.year} ${sat} · 30 m`
  }
  return `${shown.year} — no mosaic`
}

export function imageryBanner(requested: number, shown: LandsatSource): string {
  const snap = requested !== shown.year ? `No mosaic for ${requested} — showing ${shown.year}. ` : ''
  if (shown.kind === 's2') {
    return `${snap}Showing ${shown.year} Sentinel-2 (10 m) — today’s satellite is off`
  }
  if (shown.kind === 'local') {
    return `${snap}Showing ${shown.year} Landsat (30 m) — today’s satellite is off`
  }
  return `No mosaic for ${requested}`
}

export function landsatHint(requested: number, shown: LandsatSource): string {
  const snap = requested !== shown.year ? `No mosaic for ${requested} — showing ${shown.year}. ` : ''
  if (shown.kind === 's2') {
    return `${snap}Sentinel-2 cloudless mosaic (~10 m). Best for crop circles and new ground.`
  }
  if (shown.kind === 'local') {
    return `${snap}Landsat Collection 2 summer mosaic (~30 m). Dark map outside the valley — not today’s satellite.`
  }
  return `No summer mosaic for ${requested}. The Year slider only includes years that actually filled.`
}
