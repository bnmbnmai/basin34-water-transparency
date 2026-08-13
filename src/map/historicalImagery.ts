import L from 'leaflet'
import {
  availableImageryYears,
  imageryBanner,
  imagerySensorLabel,
  landsatHint,
  resolveLandsatSource,
  type LandsatSource,
  type LocalYearMeta,
} from './landsatYears'

export type ImageryMode = 'current' | 'landsat' | 'wayback'

export interface WaybackRelease {
  releaseNum: number
  date: string
  title: string
}

export interface ImageryState {
  mode: ImageryMode
  landsatYear: number
  waybackReleaseNum: number | null
  waybackDate: string | null
  /** Year actually painted (slider / permalink may snap). */
  landsatShownYear: number
  landsatKind: LandsatSource['kind']
  landsatHint: string
  landsatLabel: string
  landsatBanner: string
}

export interface LandsatIndex {
  bounds: { south: number; west: number; north: number; east: number }
  years: Record<string, LocalYearMeta>
}

type Listener = (state: ImageryState) => void

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const WAYBACK_CONFIG =
  'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json'

/** 1×1 transparent PNG — failed tiles must not paint black. */
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let mapRef: L.Map | null = null
let baseLayer: L.TileLayer | null = null
let landsatOverlay: L.ImageOverlay | null = null
let active = false
let mode: ImageryMode = 'current'
/** Slider / permalink year after snapping to an available tick. */
let landsatYear = 2024
/** Year the user asked for (permalink or drag); banner explains if it snapped. */
let landsatRequestedYear = 2024
let waybackReleases: WaybackRelease[] = []
let waybackReleaseNum: number | null = null
let waybackLoaded = false
let landsatIndex: LandsatIndex | null = null
let landsatIndexLoaded = false
let bannerEl: HTMLDivElement | null = null
const listeners = new Set<Listener>()

function notify(): void {
  const state = getImageryState()
  syncBanner(state)
  for (const fn of listeners) fn(state)
}

function localYears(): number[] {
  if (!landsatIndex) return []
  return Object.keys(landsatIndex.years).map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b)
}

function shownSource(): LandsatSource {
  return resolveLandsatSource(
    landsatRequestedYear,
    localYears(),
    landsatIndex?.years ?? {},
    { indexReady: landsatIndexLoaded },
  )
}

function ensureBanner(): HTMLDivElement | null {
  if (!mapRef) return null
  if (bannerEl) return bannerEl
  const el = document.createElement('div')
  el.id = 'imagery-banner'
  el.className = 'imagery-banner'
  el.hidden = true
  mapRef.getContainer().appendChild(el)
  bannerEl = el
  return el
}

function syncBanner(state: ImageryState): void {
  const el = ensureBanner()
  if (!el) return
  const on = active && state.mode === 'landsat'
  el.hidden = !on
  if (on) el.textContent = state.landsatBanner
  mapRef?.getContainer().classList.toggle('imagery-dark-canvas', on && state.landsatKind !== 's2')
}

function removeLandsatExtras(): void {
  if (!mapRef) return
  if (landsatOverlay) {
    mapRef.removeLayer(landsatOverlay)
    landsatOverlay = null
  }
}

function removeBase(): void {
  if (!mapRef) return
  if (baseLayer) {
    mapRef.removeLayer(baseLayer)
    baseLayer = null
  }
  removeLandsatExtras()
}

function addCurrentImagery(): void {
  if (!mapRef) return
  removeBase()
  baseLayer = L.tileLayer(ESRI_IMAGERY, {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: 'Tiles © Esri — Esri, USDA, USGS et al.',
  }).addTo(mapRef)
}

function waybackTileUrl(releaseNum: number): string {
  return (
    'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/' +
    `default028mm/MapServer/tile/${releaseNum}/{z}/{y}/{x}`
  )
}

function addWaybackImagery(releaseNum: number): void {
  if (!mapRef) return
  removeBase()
  baseLayer = L.tileLayer(waybackTileUrl(releaseNum), {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: 'Esri World Imagery Wayback',
    errorTileUrl: TRANSPARENT_PIXEL,
  }).addTo(mapRef)
}

function s2TileUrl(layer: string): string {
  return `https://tiles.maps.eox.at/wmts/1.0.0/${layer}/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`
}

function addS2Cloudless(layer: string): void {
  if (!mapRef) return
  removeBase()
  baseLayer = L.tileLayer(s2TileUrl(layer), {
    maxZoom: 18,
    maxNativeZoom: 14,
    attribution: 'Sentinel-2 cloudless © EOX / contains modified Copernicus Sentinel data',
    errorTileUrl: TRANSPARENT_PIXEL,
  }).addTo(mapRef)
}

/** Neutral canvas — never current World Imagery under a historical year. */
function addDarkCanvas(): void {
  if (!mapRef) return
  removeBase()
}

function addLocalLandsatOverlay(year: number): void {
  if (!mapRef || !landsatIndex) return
  const rec = landsatIndex.years[String(year)]
  if (!rec) return
  addDarkCanvas()
  const b = landsatIndex.bounds
  const bounds = L.latLngBounds([b.south, b.west], [b.north, b.east])
  landsatOverlay = L.imageOverlay(`/data/landsat/${rec.file}`, bounds, {
    pane: 'landsatPane',
    opacity: 1,
    interactive: false,
    className: 'landsat-overlay',
    errorOverlayUrl: TRANSPARENT_PIXEL,
  }).addTo(mapRef)
}

function paintLandsat(): void {
  if (!mapRef || !active || mode !== 'landsat') return
  const src = shownSource()
  if (src.kind === 's2' && src.layer) addS2Cloudless(src.layer)
  else if (src.kind === 'local') addLocalLandsatOverlay(src.year)
  else addDarkCanvas()
}

async function loadLandsatIndex(): Promise<void> {
  if (landsatIndexLoaded) return
  landsatIndexLoaded = true
  try {
    const res = await fetch('/data/landsat/index.json', { cache: 'force-cache' })
    if (!res.ok) return
    landsatIndex = (await res.json()) as LandsatIndex
  } catch {
    landsatIndex = null
  }
}

export function isYearOrArchiveActive(): boolean {
  return active && (mode === 'landsat' || mode === 'wayback')
}

export function getAvailableLandsatYears(): number[] {
  return availableImageryYears(localYears())
}

export function getLandsatYearRange(): { min: number; max: number } {
  const years = getAvailableLandsatYears()
  if (!years.length) return { min: 2016, max: 2025 }
  return { min: years[0], max: years[years.length - 1] }
}

export function getImageryState(): ImageryState {
  const rel = waybackReleases.find(r => r.releaseNum === waybackReleaseNum)
  const shown = shownSource()
  return {
    mode,
    landsatYear,
    waybackReleaseNum,
    waybackDate: rel?.date ?? null,
    landsatShownYear: shown.year,
    landsatKind: shown.kind,
    landsatHint: landsatHint(landsatRequestedYear, shown),
    landsatLabel: imagerySensorLabel(shown),
    landsatBanner: imageryBanner(landsatRequestedYear, shown),
  }
}

export function onImageryChange(fn: Listener): () => void {
  listeners.add(fn)
  fn(getImageryState())
  return () => {
    listeners.delete(fn)
  }
}

export function getWaybackReleases(): WaybackRelease[] {
  return waybackReleases
}

/** One release per calendar year (latest in that year) for a simpler year slider. */
export function getWaybackYearOptions(): { year: number; release: WaybackRelease }[] {
  const byYear = new Map<number, WaybackRelease>()
  for (const r of waybackReleases) {
    const y = Number(r.date.slice(0, 4))
    const prev = byYear.get(y)
    if (!prev || r.date > prev.date) byYear.set(y, r)
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, release]) => ({ year, release }))
}

export async function loadWaybackCatalog(): Promise<WaybackRelease[]> {
  if (waybackLoaded && waybackReleases.length) return waybackReleases
  const res = await fetch(WAYBACK_CONFIG, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Wayback config HTTP ${res.status}`)
  const raw = (await res.json()) as Record<string, { itemTitle?: string }>
  const list: WaybackRelease[] = []
  for (const [key, val] of Object.entries(raw)) {
    const releaseNum = Number(key)
    if (!Number.isFinite(releaseNum)) continue
    const title = String(val.itemTitle || '')
    const m = title.match(/(\d{4}-\d{2}-\d{2})/)
    if (!m) continue
    list.push({ releaseNum, date: m[1], title })
  }
  list.sort((a, b) => a.date.localeCompare(b.date))
  waybackReleases = list
  waybackLoaded = true
  if (waybackReleaseNum == null && list.length) {
    waybackReleaseNum = list[list.length - 1].releaseNum
  }
  notify()
  return list
}

export function initHistoricalImagery(map: L.Map): void {
  mapRef = map
  ensureBanner()
  void loadWaybackCatalog().catch(err => console.warn('Wayback catalog failed', err))
  void loadLandsatIndex().then(() => {
    snapLandsatYear(landsatRequestedYear, landsatIndexLoaded)
    if (active && mode === 'landsat') paintLandsat()
    notify()
  })
}

/** Show imagery plane (Current / Year / Archive). */
export async function enableHistoricalImagery(): Promise<void> {
  active = true
  await setImageryMode(mode)
}

/** Tear down imagery tiles/overlays (e.g. when switching to OSM). */
export function disableHistoricalImagery(): void {
  active = false
  removeBase()
  syncBanner(getImageryState())
}

export async function setImageryMode(next: ImageryMode): Promise<void> {
  mode = next
  if (!active || !mapRef) {
    notify()
    return
  }
  if (next === 'current') {
    removeLandsatExtras()
    addCurrentImagery()
  } else if (next === 'wayback') {
    if (!waybackLoaded) await loadWaybackCatalog()
    const num =
      waybackReleaseNum ?? waybackReleases[waybackReleases.length - 1]?.releaseNum ?? null
    if (num != null) {
      waybackReleaseNum = num
      addWaybackImagery(num)
    }
  } else {
    await loadLandsatIndex()
    snapLandsatYear(landsatRequestedYear, true)
    paintLandsat()
  }
  notify()
}

function snapLandsatYear(year: number, allowSnap: boolean): void {
  const requested = Math.round(year)
  landsatRequestedYear = requested
  const shown = resolveLandsatSource(
    requested,
    localYears(),
    landsatIndex?.years ?? {},
    { indexReady: allowSnap },
  )
  landsatYear = shown.year
}

export function setLandsatYear(year: number): void {
  snapLandsatYear(year, landsatIndexLoaded)
  notify()
  if (active && mode === 'landsat') paintLandsat()
}

export function setWaybackRelease(releaseNum: number): void {
  waybackReleaseNum = releaseNum
  notify()
  if (active && mode === 'wayback') addWaybackImagery(releaseNum)
}

export function setWaybackYear(year: number): void {
  const opt = getWaybackYearOptions().find(o => o.year === year)
  if (opt) setWaybackRelease(opt.release.releaseNum)
}
