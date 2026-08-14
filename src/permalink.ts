import type L from 'leaflet'
import {
  getImageryState,
  setImageryMode,
  setLandsatYear,
  setWaybackYear,
  type ImageryMode,
} from './map/historicalImagery'
import { defaultState, state } from './state'
import { isHighlightMode, type Basemap, type FlowEra, type PodColorMode, type WellColorMode } from './types'

/**
 * Shareable views: the URL hash mirrors AppState + map view + basemap, so any
 * filter/analysis/selection combination can be sent as a plain link.
 * Only values that differ from the defaults are written, keeping URLs short.
 */

export interface RestoredView {
  basemap: Basemap | null
  view: { lat: number; lng: number; zoom: number } | null
  /** Guided story step index (0-based), when present in the hash. */
  storyStep: number | null
  imageryMode: ImageryMode | null
  landsatYear: number | null
  waybackYear: number | null
}

/** Short hash key → boolean state accessor. */
const BOOLS: Record<string, { get: () => boolean; set: (v: boolean) => void; def: boolean }> = (() => {
  const d = defaultState()
  return {
    gw: { get: () => state.showGW, set: v => (state.showGW = v), def: d.showGW },
    sf: { get: () => state.showSurface, set: v => (state.showSurface = v), def: d.showSurface },
    hd: { get: () => state.hideDomestic, set: v => (state.hideDomestic = v), def: d.hideDomestic },
    fi: { get: () => state.focusIrrigation, set: v => (state.focusIrrigation = v), def: d.focusIrrigation },
    pou: { get: () => state.placeOfUseMode, set: v => (state.placeOfUseMode = v), def: d.placeOfUseMode },
    e0: { get: () => state.eras.pre1950, set: v => (state.eras.pre1950 = v), def: d.eras.pre1950 },
    e1: { get: () => state.eras.mid, set: v => (state.eras.mid = v), def: d.eras.mid },
    e2: { get: () => state.eras.post2000, set: v => (state.eras.post2000 = v), def: d.eras.post2000 },
  }
})()

/** Current guided-story step written into share links (set from main/story). */
let storyStepForHash: number | null = null

export function setStoryStepForHash(step: number | null) {
  storyStepForHash = step
}

export function encodeHash(basemap: Basemap, map: L.Map): string {
  const d = defaultState()
  const p = new URLSearchParams()

  if (state.highlightMode !== d.highlightMode) p.set('m', state.highlightMode)
  if (state.yearMin !== d.yearMin) p.set('y0', String(state.yearMin))
  if (state.yearMax !== d.yearMax) p.set('y1', String(state.yearMax))
  if (state.podColorMode !== d.podColorMode) p.set('cm', state.podColorMode)
  if (state.wellColorMode !== d.wellColorMode) p.set('wcm', state.wellColorMode)
  if (state.flowEra !== d.flowEra) p.set('fe', state.flowEra)
  if (state.ownerHighlight) p.set('o', state.ownerHighlight)
  if (state.selectedWRs.size > 0) p.set('sel', [...state.selectedWRs].join(','))
  if (storyStepForHash != null && storyStepForHash > 0) p.set('s', String(storyStepForHash))
  for (const [key, b] of Object.entries(BOOLS)) {
    if (b.get() !== b.def) p.set(key, b.get() ? '1' : '0')
  }
  if (basemap !== 'satellite') p.set('b', basemap)

  const img = getImageryState()
  if (img.mode !== 'current') {
    p.set('im', img.mode)
    if (img.mode === 'landsat') p.set('iy', String(img.landsatYear))
    if (img.mode === 'wayback' && img.waybackDate) p.set('iy', img.waybackDate.slice(0, 4))
  }

  const c = map.getCenter()
  p.set('v', `${map.getZoom()}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`)

  return p.toString()
}

/** Mutates `state` from the current location hash; returns map view/basemap to restore. */
export function applyHashToState(): RestoredView {
  const out: RestoredView = {
    basemap: null,
    view: null,
    storyStep: null,
    imageryMode: null,
    landsatYear: null,
    waybackYear: null,
  }
  const raw = location.hash.replace(/^#/, '')
  if (!raw) return out
  const p = new URLSearchParams(raw)

  const m = p.get('m')
  if (m && isHighlightMode(m)) state.highlightMode = m
  const y0 = parseInt(p.get('y0') || '', 10)
  if (isFinite(y0)) state.yearMin = y0
  const y1 = parseInt(p.get('y1') || '', 10)
  if (isFinite(y1)) state.yearMax = y1
  const cm = p.get('cm')
  if (cm === 'source' || cm === 'priority') state.podColorMode = cm as PodColorMode
  const wcm = p.get('wcm')
  if (wcm === 'use' || wcm === 'era' || wcm === 'swl') state.wellColorMode = wcm as WellColorMode
  const fe = p.get('fe')
  if (fe === 'historical' || fe === 'recent') state.flowEra = fe as FlowEra
  if (p.get('o')) state.ownerHighlight = p.get('o')
  const sel = p.get('sel')
  if (sel) state.selectedWRs = new Set(sel.split(',').filter(Boolean))
  const s = parseInt(p.get('s') || '', 10)
  if (isFinite(s) && s >= 0) {
    out.storyStep = s
    storyStepForHash = s
  }
  for (const [key, b] of Object.entries(BOOLS)) {
    const v = p.get(key)
    if (v === '0' || v === '1') b.set(v === '1')
  }

  const b = p.get('b')
  if (b === 'osm' || b === 'satellite' || b === 'hybrid') out.basemap = b
  const im = p.get('im')
  if (im === 'current' || im === 'landsat' || im === 'wayback') out.imageryMode = im
  const iy = parseInt(p.get('iy') || '', 10)
  if (isFinite(iy)) {
    if (out.imageryMode === 'wayback') out.waybackYear = iy
    else out.landsatYear = iy
  }
  const v = p.get('v')
  if (v) {
    const [zoom, lat, lng] = v.split('/').map(Number)
    if (isFinite(zoom) && isFinite(lat) && isFinite(lng)) out.view = { lat, lng, zoom }
  }
  return out
}

/** Apply restored imagery era after basemap is ready (async Wayback catalog). */
export async function restoreImageryFromHash(restored: RestoredView): Promise<void> {
  if (restored.landsatYear != null) setLandsatYear(restored.landsatYear)
  if (restored.imageryMode) await setImageryMode(restored.imageryMode)
  // Year after mode so Wayback catalog is loaded before matching a release.
  if (restored.waybackYear != null) setWaybackYear(restored.waybackYear)
}

let pending: number | null = null

/** Debounced location.hash update (replaceState: no history spam). */
export function schedulePermalinkUpdate(getBasemap: () => Basemap, map: L.Map) {
  if (pending != null) clearTimeout(pending)
  pending = window.setTimeout(() => {
    pending = null
    const hash = encodeHash(getBasemap(), map)
    history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`)
  }, 300)
}
