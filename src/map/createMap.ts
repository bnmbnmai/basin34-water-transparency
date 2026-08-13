import L from 'leaflet'
import type { Basemap } from '../types'
import {
  disableHistoricalImagery,
  enableHistoricalImagery,
  initHistoricalImagery,
} from './historicalImagery'

const BASIN_CENTER: [number, number] = [43.78, -113.65]
const BASIN_ZOOM = 9

/**
 * Pane layout (z-order is handled here ONCE, via panes — no bringToFront juggling).
 * Everything is SVG, so only the shapes themselves capture clicks: a well/gage
 * dot wins the click on the dot, and a click just beside it falls through to the
 * POU polygon underneath.
 *   tilePane         200  OSM / satellite / S2 / Wayback
 *   landsatPane      250  opaque local Landsat overlay (under vectors)
 *   labelsPane       350  hybrid place names (above the photo, below vectors)
 *   overlayPane      400  (default vector overlays: boundary, canals, reaches…)
 *   pouPane          450  base POU polygons
 *   wellPane         470  wells (clickable above POU)
 *   gagePane         480  stream gages (clickable above wells)
 *   markerPane       600  POD stars, cluster icons, diversion labels
 *   pouSelectedPane  650  selected-POU outline (non-interactive)
 *   pouLinePane      660  POD↔POU connector lines (non-interactive)
 */
export function createMap(): L.Map {
  const map = L.map('map', { zoomControl: true }).setView(BASIN_CENTER, BASIN_ZOOM)
  const landsatPane = map.createPane('landsatPane')
  landsatPane.style.zIndex = '250'
  landsatPane.style.pointerEvents = 'none'
  const labelsPane = map.createPane('labelsPane')
  labelsPane.style.zIndex = '350'
  labelsPane.style.pointerEvents = 'none'
  map.createPane('pouPane').style.zIndex = '450'
  map.createPane('wellPane').style.zIndex = '470'
  map.createPane('gagePane').style.zIndex = '480'
  const sel = map.createPane('pouSelectedPane')
  sel.style.zIndex = '650'
  sel.style.pointerEvents = 'none'
  const line = map.createPane('pouLinePane')
  line.style.zIndex = '660'
  line.style.pointerEvents = 'none'
  return map
}

export class BasemapControl {
  private osmLayer: L.TileLayer | null = null
  private labels: L.TileLayer | null = null
  private map: L.Map
  private type: Basemap = 'satellite'

  constructor(map: L.Map) {
    this.map = map
    initHistoricalImagery(map)
  }

  getType(): Basemap {
    return this.type
  }

  set(type: Basemap) {
    this.type = type
    if (this.osmLayer) {
      this.map.removeLayer(this.osmLayer)
      this.osmLayer = null
    }
    if (this.labels) {
      this.map.removeLayer(this.labels)
      this.labels = null
    }

    const attribution = '© Basin 34 Transparency (IDWR + USGS public data)'
    if (type === 'osm') {
      disableHistoricalImagery()
      this.osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors | ' + attribution,
        maxZoom: 18,
      }).addTo(this.map)
    } else {
      void enableHistoricalImagery()
      if (type === 'hybrid') {
        this.labels = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 18, opacity: 0.9, pane: 'labelsPane' },
        ).addTo(this.map)
      }
    }

    document.querySelectorAll<HTMLButtonElement>('#basemap-switcher .basemap-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.basemap === type)
    })
    const era = document.getElementById('imagery-era')
    if (era) era.hidden = type === 'osm'
  }
}
