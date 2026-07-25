import L from 'leaflet'
import { DISTRICT_POU_KM2, type DataStore } from '../data'
import { state } from '../state'
import type { GeoFeature, PouRecord } from '../types'

const SELECTED_STYLE: L.PathOptions = {
  color: '#a855f7', weight: 2.5, fillColor: '#e9d5ff', fillOpacity: 0.12,
}

/** Below this zoom, clickable field outlines stay off (basin overview stays light). */
export const POU_CLICKABLE_MIN_ZOOM = 12

const CLICKABLE_STYLE: L.PathOptions = {
  color: '#15803d',
  weight: 1,
  fillColor: '#4ade80',
  fillOpacity: 0.06,
  opacity: 0.55,
  dashArray: '2,3',
}

/**
 * Place-of-Use polygons:
 * - Dense mode (`placeOfUseMode`): fills for all currently visible rights.
 * - Clickable mode (default): when zoomed in, viewport fields are painted as
 *   light clickable outlines so a field tap can reveal POD ↔ POU links —
 *   without loading every basin polygon at overview zoom.
 * - Selection overlay + dashed POD↔POU lines always work once a right is chosen.
 */
export class PouLayer {
  private base: L.GeoJSON | null = null
  private overlay = L.layerGroup()
  private lines = L.layerGroup()
  private lastKey = ''
  /** While true (timeline playback) polygon rebuilds are skipped entirely. */
  private suspended = false
  private moveTimer: ReturnType<typeof setTimeout> | null = null
  /** Rights from the last filter pass (dense mode). */
  private filterWRs = new Set<string>()

  private map: L.Map
  private store: DataStore
  private onPouClick: (feature: GeoFeature) => void

  constructor(map: L.Map, store: DataStore, onPouClick: (feature: GeoFeature) => void) {
    this.map = map
    this.store = store
    this.onPouClick = onPouClick
    this.overlay.addTo(map)
    this.lines.addTo(map)
    map.on('moveend', () => this.scheduleViewportSync())
    map.on('zoomend', () => this.scheduleViewportSync())
  }

  /** Suspend/resume rebuilds (timeline playback rebuilds layers every tick). */
  setSuspended(on: boolean) {
    this.suspended = on
  }

  /**
   * Dense Place-of-Use fills for the given rights, or (when mode is off)
   * viewport clickable fields at sufficient zoom.
   */
  setVisibleWRs(wrs: Set<string>) {
    this.filterWRs = wrs
    this.syncBase()
  }

  /** Call after POU data finishes loading in the background. */
  onPouDataReady() {
    this.syncBase()
  }

  private scheduleViewportSync() {
    if (state.placeOfUseMode) return
    if (this.moveTimer) clearTimeout(this.moveTimer)
    this.moveTimer = setTimeout(() => {
      this.moveTimer = null
      this.syncBase()
    }, 140)
  }

  private syncBase() {
    if (this.suspended) return
    if (state.placeOfUseMode) {
      this.paintDense(this.filterWRs)
      return
    }
    this.paintClickableViewport()
  }

  private paintDense(wrs: Set<string>) {
    if (wrs.size === 0 || this.store.pous.length === 0) {
      this.clearBase()
      this.refreshSelection()
      return
    }
    const visible: PouRecord[] = []
    let hash = 0
    for (const rec of this.store.pous) {
      if (wrs.has(rec.wr)) {
        visible.push(rec)
        let h = 2166136261
        for (let i = 0; i < rec.wr.length; i++) h = (h ^ rec.wr.charCodeAt(i)) * 16777619 | 0
        hash = (hash + h) | 0
      }
    }
    visible.sort((a, b) => b.areaKm2 - a.areaKm2)
    const key = `dense:${visible.length}:${hash}`
    if (key === this.lastKey && this.base) {
      this.refreshSelection()
      return
    }
    this.paintFeatures(visible.map(v => v.feature), key, false)
  }

  private paintClickableViewport() {
    if (this.store.pous.length === 0) {
      this.clearBase()
      this.refreshSelection()
      return
    }
    const zoom = this.map.getZoom()
    if (zoom < POU_CLICKABLE_MIN_ZOOM) {
      const key = 'click:off'
      if (key === this.lastKey && !this.base) {
        this.refreshSelection()
        return
      }
      this.clearBase()
      this.lastKey = key
      this.refreshSelection()
      return
    }

    const bounds = this.map.getBounds().pad(0.08)
    const visible: PouRecord[] = []
    let hash = 0
    for (const rec of this.store.pous) {
      if (!featureIntersectsBounds(rec.feature, bounds)) continue
      // Huge district/service areas stay out of the clickable field layer —
      // they would blanket the valley and steal clicks from real fields.
      if (rec.areaKm2 >= DISTRICT_POU_KM2) continue
      visible.push(rec)
      let h = 2166136261
      for (let i = 0; i < rec.wr.length; i++) h = (h ^ rec.wr.charCodeAt(i)) * 16777619 | 0
      hash = (hash + h) | 0
    }
    visible.sort((a, b) => b.areaKm2 - a.areaKm2)
    const z = Math.round(zoom * 10)
    const key = `click:${z}:${visible.length}:${hash}`
    if (key === this.lastKey && this.base) {
      this.refreshSelection()
      return
    }
    this.paintFeatures(visible.map(v => v.feature), key, true)
  }

  private paintFeatures(features: GeoFeature[], key: string, clickableLite: boolean) {
    this.lastKey = key
    this.clearBase()
    if (features.length === 0) {
      this.refreshSelection()
      return
    }
    this.base = L.geoJSON({ type: 'FeatureCollection', features } as any, {
      pane: 'pouPane',
      style: (f: any) =>
        clickableLite ? this.styleClickable(f as GeoFeature) : this.styleFor(f as GeoFeature),
      onEachFeature: (feat: any, lyr: L.Layer) => {
        lyr.on('click', (e: any) => {
          L.DomEvent.stop(e)
          this.onPouClick(feat as GeoFeature)
        })
      },
    }).addTo(this.map)
    this.refreshSelection()
  }

  /** Restyle polygons + rebuild the selection outline and connector lines. */
  refreshSelection() {
    const clickableLite = !state.placeOfUseMode
    this.base?.setStyle(f =>
      clickableLite ? this.styleClickable(f as GeoFeature) : this.styleFor(f as GeoFeature),
    )
    this.overlay.clearLayers()
    this.lines.clearLayers()
    if (state.selectedWRs.size === 0 && !(state.highlightMode === 'transfers' && state.placeOfUseMode)) {
      return
    }

    // Purple POD↔field graphics always work when a right is selected — even if
    // dense Place-of-Use fills are off.
    for (const wr of state.selectedWRs) {
      for (const pou of this.store.pousByWR.get(wr) || []) {
        this.overlay.addLayer(L.geoJSON(pou.feature as any, {
          pane: 'pouSelectedPane',
          interactive: false,
          style: () => ({ color: '#a855f7', weight: 3, fillOpacity: 0.08, fillColor: '#e9d5ff', dashArray: undefined }),
        }))
      }
    }

    const lineWRs = new Set<string>(state.selectedWRs)
    if (state.highlightMode === 'transfers' && state.placeOfUseMode) {
      this.store.transferDistKm.forEach((_d, wr) => lineWRs.add(wr))
    }
    for (const wr of lineWRs) {
      const center = this.store.pouCenter.get(wr)
      if (!center) continue
      const isSelected = state.selectedWRs.has(wr)
      for (const pod of this.store.podsByWR.get(wr) || []) {
        this.lines.addLayer(L.polyline([[pod.lat, pod.lon], center], {
          pane: 'pouLinePane',
          interactive: false,
          color: '#a855f7',
          weight: isSelected ? 2.5 : 1.5,
          dashArray: '4,3',
          opacity: isSelected ? 0.9 : 0.55,
        }))
      }
    }
  }

  private clearBase() {
    if (this.base) {
      this.map.removeLayer(this.base)
      this.base = null
    }
  }

  private styleClickable(feature: GeoFeature): L.PathOptions {
    const wr = (feature.properties?.WaterRightNumber || '').trim()
    if (state.selectedWRs.has(wr)) return SELECTED_STYLE
    return CLICKABLE_STYLE
  }

  private styleFor(feature: GeoFeature): L.PathOptions {
    const wr = (feature.properties?.WaterRightNumber || '').trim()
    const selected = state.selectedWRs.has(wr)

    if ((feature.properties?.__areaKm2 ?? 0) >= DISTRICT_POU_KM2) {
      if (selected) return { color: '#a855f7', weight: 2.5, fill: false, dashArray: '8,5' }
      return { color: '#0f766e', weight: 1.5, fill: false, dashArray: '8,5', opacity: 0.7 }
    }
    if (selected) return SELECTED_STYLE

    const hasSelection = state.selectedWRs.size > 0
    const transfersMode = state.highlightMode === 'transfers'
    const isTransfer = this.store.transferDistKm.has(wr)
    if (isTransfer) {
      if (transfersMode && this.store.newGroundWRs.has(wr)) {
        return { color: '#c2410c', weight: 2, fillColor: '#f97316', fillOpacity: 0.45 }
      }
      return {
        color: '#f97316', weight: 1.5, fillColor: '#fed7aa',
        fillOpacity: transfersMode ? 0.2 : hasSelection ? 0.04 : 0.08, dashArray: '3,2',
      }
    }
    if (transfersMode) {
      return { color: '#15803d', weight: 0.5, fillColor: '#4ade80', fillOpacity: 0.01, opacity: 0.3, dashArray: '2,3' }
    }
    return {
      color: '#15803d', weight: 1, fillColor: '#4ade80',
      fillOpacity: hasSelection ? 0.02 : 0.04, dashArray: '2,3',
    }
  }
}

/** Fast bbox test so we do not build Leaflet layers for off-screen POUs. */
function featureIntersectsBounds(feature: GeoFeature, bounds: L.LatLngBounds): boolean {
  const g = feature.geometry
  if (!g?.coordinates) return false
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  const walk = (coords: any) => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const lon = coords[0], lat = coords[1]
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      return
    }
    for (const c of coords) walk(c)
  }
  walk(g.coordinates)
  if (!isFinite(minLat)) return false
  return bounds.intersects(L.latLngBounds([minLat, minLon], [maxLat, maxLon]))
}
