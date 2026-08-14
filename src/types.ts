// Shared domain types for the Basin 34 viewer.

export type Basemap = 'osm' | 'satellite' | 'hybrid'
export type PodColorMode = 'source' | 'priority'
export type WellColorMode = 'use' | 'era' | 'swl'
export type FlowEra = 'historical' | 'recent'

/**
 * Exclusive analysis views. Exactly one is active at a time, which keeps the
 * emphasis/subdue rules simple and the map readable (the old composable
 * checkboxes produced unreadable color soup and a 9-clause subdue condition).
 */
export type HighlightMode =
  | 'none'
  | 'senior-downstream'
  | 'transfers'

export const HIGHLIGHT_MODES: readonly HighlightMode[] = [
  'none',
  'senior-downstream',
  'transfers',
]

export function isHighlightMode(value: string): value is HighlightMode {
  return (HIGHLIGHT_MODES as readonly string[]).includes(value)
}

export interface GeoFeature {
  type: 'Feature'
  geometry: any
  properties: Record<string, any>
}

/** POD feature + derived values precomputed once at load time. */
export interface PodRecord {
  feature: GeoFeature
  /** Trimmed WaterRightNumber (raw IDWR values have trailing spaces). */
  wr: string
  owner: string
  ownerLc: string
  source: string
  isGW: boolean
  isSurf: boolean
  year: number | null
  rate: number
  lat: number
  lon: number
  /** Set after POU load: POD-to-POU distance exceeds the transfer threshold. */
  isTransfer: boolean
  /** Distance (km) from this POD to the nearest NHD mainstem / NWI riparian point. */
  corridorDistKm: number
  /** Distance (km) from this POD to the nearest NHD Big Lost mainstem vertex (never NWI). */
  mainstemDistKm: number
  uses: string
  diversionName: string
}

export interface WellRecord {
  feature: GeoFeature
  ownerLc: string
  /** Uppercased WellUse ('' when unlabeled). */
  use: string
  year: number | null
  rate: number
  lat: number
  lon: number
  depth: number | null
  swl: number | null
}

export interface PouRecord {
  feature: GeoFeature
  wr: string
  /** Approximate geometry key used to group rights sharing one polygon. */
  geomKey: string
  /** Approximate polygon area (km²). District-scale service areas are huge. */
  areaKm2: number
}

export interface AppState {
  podColorMode: PodColorMode
  eras: { pre1950: boolean; mid: boolean; post2000: boolean }
  yearMin: number
  yearMax: number
  showGW: boolean
  showSurface: boolean
  hideDomestic: boolean
  /** Well marker color: use class, construction era, or drill-time static water level. */
  wellColorMode: WellColorMode
  focusIrrigation: boolean
  highlightMode: HighlightMode
  ownerHighlight: string | null
  placeOfUseMode: boolean
  /**
   * When Year or Archive imagery is on, basin-wide POU outlines stay off unless
   * this is true. IDWR geometry is today’s authorized fields, not historical.
   * Selection (cyan POD↔POU) still paints.
   */
  showPouOnImagery: boolean
  /**
   * When an analysis view or owner search is active, hide non-matching PODs
   * instead of drawing thousands of dimmed markers (critical on phones).
   */
  hideNonMatches: boolean
  /**
   * When true, hide every POD except the current selection (receipt Zoom).
   * Cleared with the selection. Not persisted in the URL hash.
   */
  isolateSelection: boolean
  /**
   * When isolating, show only this POD (wr|lat|lon|rate). District rights
   * have many diversions; receipt Zoom should land on one star.
   */
  focusPodKey: string | null
  /** Rights selected by clicking a POD or POU polygon. */
  selectedWRs: Set<string>
  flowEra: FlowEra
}
