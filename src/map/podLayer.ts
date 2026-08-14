import L from 'leaflet'
import 'leaflet.markercluster'
import type { DataStore } from '../data'
import { resolvePodEmphasis } from '../emphasis'
import { podVisible } from '../filters'
import { shouldClusterPods } from './clusterPolicy'
import { podKey } from './focusRight'
import { state } from '../state'
import { podBaseColor, podIconSpec, podStarIcon } from '../symbology'
import type { PodRecord } from '../types'

function clusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount()
  const size = count > 100 ? 34 : count > 25 ? 30 : 26
  return L.divIcon({
    html: `<div style="background:#334155;color:#e0e7ff;border:1px solid #1e2937;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${count}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function podPopupHtml(rec: PodRecord): string {
  const p = rec.feature.properties
  let html = `<strong>POD / Water Right ${rec.wr}</strong><br>Source: ${rec.source}`
  if (rec.year != null) html += `<br>Priority year: ${rec.year} (seniority)`
  if (rec.owner) html += `<br>Owner: ${rec.owner}`
  if (p.OverallMaxDiversionRate != null) html += `<br>Max rate: ${p.OverallMaxDiversionRate} cfs`
  if (p.WRReport) html += `<br><a href="${p.WRReport}" target="_blank" rel="noopener">Full report →</a>`
  return html
}

/**
 * Manages the POD layer.
 * Clusters only the unfiltered basin view. Owner search, analysis receipts,
 * and isolation draw individual stars so a selected right is findable.
 */
export class PodLayer {
  private cluster: L.MarkerClusterGroup
  private plain: L.LayerGroup
  private clustered = true
  private markersByWR = new Map<string, L.Marker[]>()
  private recordByMarker = new Map<L.Marker, PodRecord>()
  private lastVisibleWRs = new Set<string>()
  private lite: boolean
  enabled = true

  private map: L.Map
  private store: DataStore
  private onPodClick: (rec: PodRecord) => void

  constructor(
    map: L.Map,
    store: DataStore,
    onPodClick: (rec: PodRecord) => void,
    opts: { lite?: boolean } = {},
  ) {
    this.map = map
    this.store = store
    this.onPodClick = onPodClick
    this.lite = !!opts.lite
    this.plain = L.layerGroup()
    this.cluster = L.markerClusterGroup({
      disableClusteringAtZoom: this.lite ? 12 : 10,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: this.lite ? 70 : 40,
      chunkedLoading: true,
      chunkInterval: this.lite ? 100 : 200,
      chunkDelay: 20,
      removeOutsideVisibleBounds: true,
      iconCreateFunction: clusterIcon,
    })
  }

  /** Guide highlight steps already drop clustering; rebuild is enough. */
  setGuideMode(_on: boolean) {
    if (this.enabled) this.rebuild()
  }

  /** Rights visible after the last rebuild (drives which POU polygons show). */
  visibleWRs(): Set<string> {
    return this.lastVisibleWRs
  }

  visibleCount(): number {
    return this.recordByMarker.size
  }

  rebuild() {
    this.cluster.clearLayers()
    this.plain.clearLayers()
    this.markersByWR.clear()
    this.recordByMarker.clear()
    this.lastVisibleWRs = new Set()
    if (!this.enabled) {
      this.detachHosts()
      return
    }

    const markers: L.Marker[] = []
    for (const rec of this.store.pods) {
      if (!podVisible(rec, state, this.store)) continue
      const marker = L.marker([rec.lat, rec.lon], {
        icon: this.iconFor(rec),
        riseOnHover: true,
      })
      marker.bindPopup(podPopupHtml(rec))
      if (state.focusPodKey && podKey(rec) === state.focusPodKey) {
        const bits = [rec.wr]
        if (rec.year != null) bits.push(String(rec.year))
        if (rec.rate) bits.push(`${rec.rate} cfs`)
        marker.bindTooltip(bits.join(' · '), {
          permanent: true,
          direction: 'top',
          offset: [0, -14],
          className: 'pod-focus-label',
          opacity: 1,
        })
      }
      marker.on('click', (e: any) => {
        L.DomEvent.stop(e) // keep the map background-click from clearing the new selection
        this.onPodClick(rec)
      })
      if (rec.wr && state.selectedWRs.has(rec.wr)) marker.setZIndexOffset(2000)
      markers.push(marker)
      this.recordByMarker.set(marker, rec)
      if (rec.wr) {
        const list = this.markersByWR.get(rec.wr)
        if (list) list.push(marker)
        else this.markersByWR.set(rec.wr, [marker])
        this.lastVisibleWRs.add(rec.wr)
      }
    }

    this.clustered = shouldClusterPods({
      isolateSelection: state.isolateSelection,
      ownerHighlight: state.ownerHighlight,
      highlightMode: state.highlightMode,
      visibleCount: markers.length,
    })
    if (this.clustered) {
      this.cluster.addLayers(markers)
      this.attach(this.cluster, this.plain)
    } else {
      for (const m of markers) this.plain.addLayer(m)
      this.attach(this.plain, this.cluster)
    }
  }

  /** Raise the selected star; do not zoom-to-cluster (that pulls the map out). */
  reveal(wr: string) {
    const markers = this.markersByWR.get(wr)
    if (!markers?.length) return
    for (const m of markers) m.setZIndexOffset(2000)
  }

  /** Restyle only the markers for the given rights (cheap selection updates). */
  restyle(wrs: Iterable<string>) {
    for (const wr of wrs) {
      const markers = this.markersByWR.get(wr)
      if (!markers) continue
      for (const m of markers) {
        const rec = this.recordByMarker.get(m)
        if (rec) {
          m.setIcon(this.iconFor(rec))
          m.setZIndexOffset(state.selectedWRs.has(wr) ? 2000 : 0)
        }
      }
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.rebuild()
  }

  private attach(on: L.Layer, off: L.Layer) {
    if (this.map.hasLayer(off)) this.map.removeLayer(off)
    if (!this.map.hasLayer(on)) this.map.addLayer(on)
  }

  private detachHosts() {
    if (this.map.hasLayer(this.cluster)) this.map.removeLayer(this.cluster)
    if (this.map.hasLayer(this.plain)) this.map.removeLayer(this.plain)
  }

  private iconFor(rec: PodRecord): L.DivIcon {
    const emphasis = resolvePodEmphasis(rec, state, this.store)
    return podStarIcon(podIconSpec(rec, podBaseColor(rec, state.podColorMode), emphasis))
  }
}
