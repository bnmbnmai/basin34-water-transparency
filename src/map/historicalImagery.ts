import L from 'leaflet'
import {
  landsatHint,
  resolveLandsatSource,
  type LandsatSource,
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
  /** Year actually painted (slider may snap). */
  landsatShownYear: number
  landsatKind: LandsatSource['kind']
  landsatHint: string
}

export interface LandsatIndex {
  bounds: { south: number; west: number; north: number; east: number }
  years: Record<string, { file: string }>
}

type Listener = (state: ImageryState) => void

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const WAYBACK_CONFIG =
  'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json'

const LANDSAT_EXPORT =
  'https://landsat2.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer/exportImage'

const LANDSAT_RENDERING = JSON.stringify({ rasterFunction: 'Natural Color with DRA' })
const LANDSAT_MOSAIC = JSON.stringify({
  mosaicMethod: 'esriMosaicAttribute',
  sortField: 'Best',
  sortValue: '0',
  mosaicOperation: 'MT_FIRST',
})

/** 1×1 transparent PNG — failed tiles must not paint black. */
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const LANDSAT_MIN_YEAR = 1984

let mapRef: L.Map | null = null
let baseLayer: L.TileLayer | null = null
let landsatOverlay: L.ImageOverlay | null = null
let landsatTiles: L.GridLayer | null = null
let active = false
let mode: ImageryMode = 'current'
let landsatYear = Math.min(new Date().getFullYear() - 1, 2024)
let waybackReleases: WaybackRelease[] = []
let waybackReleaseNum: number | null = null
let waybackLoaded = false
let landsatIndex: LandsatIndex | null = null
let landsatIndexLoaded = false
const listeners = new Set<Listener>()

function notify(): void {
  const state = getImageryState()
  for (const fn of listeners) fn(state)
}

function localYears(): number[] {
  if (!landsatIndex) return []
  return Object.keys(landsatIndex.years).map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b)
}

function shownSource(): LandsatSource {
  return resolveLandsatSource(landsatYear, localYears())
}

function removeLandsatExtras(): void {
  if (!mapRef) return
  if (landsatOverlay) {
    mapRef.removeLayer(landsatOverlay)
    landsatOverlay = null
  }
  if (landsatTiles) {
    mapRef.removeLayer(landsatTiles)
    landsatTiles = null
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
  if (baseLayer) {
    mapRef.removeLayer(baseLayer)
    baseLayer = null
  }
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

function summerEpochRange(year: number): [number, number] {
  // GLS composites sit near the epoch year, not a June scene date.
  if (year <= 2010) {
    return [Date.UTC(year - 1, 0, 1), Date.UTC(year + 1, 11, 31, 23, 59, 59)]
  }
  return [Date.UTC(year, 0, 1), Date.UTC(year, 11, 31, 23, 59, 59)]
}

function esriTileExportUrl(bounds: L.LatLngBounds, year: number): string {
  const [t0, t1] = summerEpochRange(year)
  const params = new URLSearchParams({
    bbox: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
    bboxSR: '4326',
    imageSR: '4326',
    size: '256,256',
    format: 'png32',
    pixelType: 'U8',
    noData: '0',
    noDataInterpretation: 'esriNoDataMatchAny',
    interpolation: 'RSP_BilinearInterpolation',
    time: `${t0},${t1}`,
    renderingRule: LANDSAT_RENDERING,
    mosaicRule: LANDSAT_MOSAIC,
    f: 'image',
  })
  return `${LANDSAT_EXPORT}?${params}`
}

function addEsriLandsatTiles(year: number): void {
  if (!mapRef) return
  addCurrentImagery()
  removeLandsatExtras()
  const Grid = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const img = document.createElement('img')
      img.alt = ''
      img.decoding = 'async'
      const bounds = (this as any)._tileCoordsToBounds(coords) as L.LatLngBounds
      img.onload = () => done(undefined, img)
      img.onerror = () => {
        img.src = TRANSPARENT_PIXEL
        done(undefined, img)
      }
      img.src = esriTileExportUrl(bounds, year)
      return img
    },
  })
  const tiles: L.GridLayer = new (Grid as any)({
    tileSize: 256,
    minZoom: 7,
    maxZoom: 15,
    maxNativeZoom: 13,
    opacity: 1,
    className: 'landsat-tiles',
  })
  tiles.addTo(mapRef)
  landsatTiles = tiles
}

function addLocalLandsatOverlay(year: number): void {
  if (!mapRef || !landsatIndex) return
  const rec = landsatIndex.years[String(year)]
  if (!rec) return
  addCurrentImagery()
  removeLandsatExtras()
  const b = landsatIndex.bounds
  const bounds = L.latLngBounds([b.south, b.west], [b.north, b.east])
  landsatOverlay = L.imageOverlay(`/data/landsat/${rec.file}`, bounds, {
    opacity: 1,
    interactive: false,
    className: 'landsat-overlay',
    zIndex: 200,
    errorOverlayUrl: TRANSPARENT_PIXEL,
  }).addTo(mapRef)
}

function paintLandsat(): void {
  if (!mapRef || !active || mode !== 'landsat') return
  const src = shownSource()
  if (src.kind === 's2' && src.layer) addS2Cloudless(src.layer)
  else if (src.kind === 'local') addLocalLandsatOverlay(src.year)
  else addEsriLandsatTiles(src.year)
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

export function getLandsatYearRange(): { min: number; max: number } {
  const max = Math.min(new Date().getFullYear(), 2026)
  return { min: LANDSAT_MIN_YEAR, max }
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
    landsatHint: landsatHint(landsatYear, shown),
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
  void loadWaybackCatalog().catch(err => console.warn('Wayback catalog failed', err))
  void loadLandsatIndex().then(() => {
    if (active && mode === 'landsat') paintLandsat()
    notify()
  })
}

/** Show imagery plane (Current / Landsat / Wayback). */
export async function enableHistoricalImagery(): Promise<void> {
  active = true
  await setImageryMode(mode)
}

/** Tear down imagery tiles/overlays (e.g. when switching to OSM). */
export function disableHistoricalImagery(): void {
  active = false
  removeBase()
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
    paintLandsat()
  }
  notify()
}

export function setLandsatYear(year: number): void {
  const { min, max } = getLandsatYearRange()
  landsatYear = Math.max(min, Math.min(max, Math.round(year)))
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
