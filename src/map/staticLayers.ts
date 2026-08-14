import L from 'leaflet'
import type { FlowEra, GeoFeature } from '../types'
import { fetchJsonCached } from '../fetchCache'
import { collectMainstemPts, lineMidpoint, sideOfMainstem } from '../sideOfChannel'
import { gageMarkerStyle, gageRoleFromProps, gageRoleLabel } from './gageRoles'

export interface StaticLayers {
  groups: Record<string, L.LayerGroup>
  setFlowEra: (era: FlowEra) => void
  /** Load canals + NWI riparian after first paint (no-op if already loaded). */
  loadHeavy: () => Promise<void>
  /** Canals / pipelines only (Guide transfers / hydro toggle). */
  loadCanals: () => Promise<void>
  /** NWI riparian only (riparian toggle). */
  loadRiparian: () => Promise<void>
}

function flowExtentStyle(era: string): L.PathOptions {
  if (era === 'historical') {
    return { color: '#0ea5e9', weight: 4, opacity: 0.85, dashArray: undefined }
  }
  return { color: '#854d0e', weight: 3, opacity: 0.7, dashArray: '6,4' }
}

/**
 * Real NHD channel styling for the then-vs-now story. The ETL tags each
 * mainstem segment 'above-moore' or 'below-moore' (split at the Moore
 * diversion, USGS 13132100 — where WD34 accounting shows surface flow
 * commonly ends today). Historical era: whole channel vivid blue to the sinks.
 * Recent era: below-Moore reach dashed brown (Arco gage often reads zero too).
 */
function mainstemStyle(reach: string, era: FlowEra): L.PathOptions {
  if (era === 'recent' && reach === 'below-moore') {
    return { color: '#854d0e', weight: 2.5, opacity: 0.85, dashArray: '6,4' }
  }
  return { color: '#0ea5e9', weight: 3, opacity: 0.9 }
}

function riparianStyle(f: any, era: FlowEra): L.PathOptions {
  const code: string = f?.properties?.ATTRIBUTE || ''
  const forested = code.includes('FO')
  const dim = era === 'recent'
  return {
    color: forested ? '#166534' : '#4d7c0f',
    weight: dim ? 1 : 1.6,
    opacity: dim ? 0.45 : 0.85,
    fillColor: forested ? '#16a34a' : '#84cc16',
    fillOpacity: dim ? 0.2 : 0.5,
  }
}

function sinksStyle(era: FlowEra): L.PathOptions {
  return era === 'historical'
    ? { color: '#0d9488', weight: 1, opacity: 0.8, fillColor: '#14b8a6', fillOpacity: 0.45 }
    : { color: '#a16207', weight: 1, opacity: 0.45, fillColor: '#a8a29e', fillOpacity: 0.12, dashArray: '3,3' }
}

export async function loadStaticLayers(
  map: L.Map,
  reaches: GeoFeature[],
  callbacks: {
    onFeatureClick: (feature: GeoFeature, group: string) => void
  },
  opts: { deferHeavy?: boolean } = { deferHeavy: true },
): Promise<StaticLayers> {
  const groups: Record<string, L.LayerGroup> = {}
  const add = (name: string, layer: L.Layer) => {
    if (!groups[name]) groups[name] = L.layerGroup().addTo(map)
    groups[name].addLayer(layer)
  }

  // Critical path: skip canals + riparian until after first interactive paint
  const [boundary, gages, flowExtent, mainstem, sinks] = await Promise.all([
    fetchJsonCached('/data/basin-boundary.geojson'),
    fetchJsonCached('/data/gages.geojson'),
    fetchJsonCached('/data/flow-extent-indicators.geojson'),
    fetchJsonCached('/data/nhd-mainstem.geojson'),
    fetchJsonCached('/data/nhd-sinks.geojson'),
  ])

  if (boundary) {
    add('boundary', L.geoJSON(boundary, {
      style: { color: '#64748b', weight: 1.5, fillOpacity: 0.08 },
    }))
  }

  let riparianLayer: L.GeoJSON | null = null
  let canalsLoaded = false
  let riparianLoaded = false
  let currentEra: FlowEra = 'recent'

  const loadCanals = async () => {
    if (canalsLoaded) return
    canalsLoaded = true
    const canals = await fetchJsonCached('/data/nhd-canals-pipelines.geojson')
    if (!canals) return
    const mainstemPts = collectMainstemPts((mainstem?.features || []) as GeoFeature[])
    const isPipe = (f: any) => (f?.properties?.fcode ?? 0) >= 42800
    const featureSide = (f: any) => {
      const mid = lineMidpoint(f?.geometry)
      return mid ? sideOfMainstem(mid[0], mid[1], mainstemPts) : 'unknown'
    }
    add('hydro', L.geoJSON(canals, {
      style: (f: any) => {
        const pipe = isPipe(f)
        const side = featureSide(f)
        if (pipe) {
          return {
            color: side === 'west' ? '#44403c' : '#64748b',
            weight: 2.2,
            opacity: 0.85,
            dashArray: '2,5',
          }
        }
        if (side === 'west') return { color: '#0f766e', weight: 2.4, opacity: 0.85, dashArray: '6,3' }
        if (side === 'east') return { color: '#0369a1', weight: 2.4, opacity: 0.8, dashArray: '6,3' }
        return { color: '#0ea5e9', weight: 2, opacity: 0.7, dashArray: '6,3' }
      },
      onEachFeature: (feature, lyr) => {
        const p = feature.properties || {}
        const pipe = isPipe(feature)
        const kind = pipe ? 'Pipeline' : 'Canal / ditch'
        const side = featureSide(feature)
        const sideLabel = side === 'unknown' ? 'side of channel unclear' : `${side} of NHD mainstem (geometric)`
        if (p.gnis_name) {
          lyr.bindTooltip(`${p.gnis_name} (${kind.toLowerCase()} · ${sideLabel})`, { sticky: true })
        }
        lyr.bindPopup(
          `<strong>${p.gnis_name || `Unnamed ${kind.toLowerCase()}`}</strong><br>` +
          `${kind} · ${sideLabel}` +
          `${p.lengthkm ? ` · ${Number(p.lengthkm).toFixed(1)} km segment` : ''}<br>` +
          `<small>USGS National Hydrography Dataset (high resolution). East/west is longitude vs the nearest Big Lost mainstem vertex — not a liner inventory. Authorized rates come from the Diversions layer.</small>`,
        )
        lyr.on('click', () => callbacks.onFeatureClick(feature as GeoFeature, 'hydro'))
      },
    }))
  }

  const loadRiparian = async () => {
    if (riparianLoaded) return
    riparianLoaded = true
    const riparian = await fetchJsonCached('/data/nwi-riparian.geojson')
    if (!riparian) return
    add('riparian', riparianLayer = L.geoJSON(riparian, {
      style: f => riparianStyle(f, currentEra),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties || {}
        const kind = (p.ATTRIBUTE || '').includes('FO') ? 'forested' : 'scrub-shrub'
        lyr.bindTooltip(
          `Riparian (${kind})${p.ACRES ? ` · ${Number(p.ACRES).toFixed(1)} ac` : ''} — FWS NWI` +
          `<br><small>NWI riparian was not mapped along the lower channel (Arco → sinks).</small>`,
          { sticky: true },
        )
      },
    }))
  }

  const loadHeavy = async () => {
    await Promise.all([loadCanals(), loadRiparian()])
  }

  if (!opts.deferHeavy) await loadHeavy()

  if (gages) {
    add('gages', L.geoJSON(gages, {
      pointToLayer: (f: any, latlng) => {
        const p = f?.properties || {}
        const role = gageRoleFromProps(p.site_no, p)
        return L.circleMarker(latlng, { pane: 'gagePane', ...gageMarkerStyle(role) })
      },
      onEachFeature: (feature, lyr) => {
        const p = feature.properties || {}
        const role = gageRoleFromProps(p.site_no, p)
        let html = `<strong>${p.name || p.site_no || 'Gage'}</strong><br>`
        if (p.site_no) html += `USGS ${p.site_no}<br>`
        html += `<em>${gageRoleLabel(role)}</em><br>`
        if (p.historical_summary) html += `${p.historical_summary}<br>`
        if (p.url) html += `<a href="${p.url}" target="_blank" rel="noopener">View full record at USGS NWIS</a>`
        lyr.bindPopup(html)
        lyr.on('click', () => callbacks.onFeatureClick(feature as GeoFeature, 'gages'))
      },
    }))
  }

  // River channel "then vs now": prefer the real NHD mainstem geometry; only
  // fall back to the old hand-drawn flow-extent proxy lines if it is absent.
  let mainstemLayer: L.GeoJSON | null = null
  let sinksLayer: L.GeoJSON | null = null
  let flowLayer: L.GeoJSON | null = null
  if (mainstem) {
    if (sinks) {
      sinksLayer = L.geoJSON(sinks, {
        style: () => sinksStyle(currentEra),
        onEachFeature: (feature, lyr) => {
          const p = feature.properties || {}
          const kind = p.FCODE === 46600 ? 'marsh' : 'playa'
          lyr.bindTooltip('Big Lost River sinks — historic terminus', { sticky: true })
          lyr.bindPopup(
            `<strong>Big Lost River sinks (${kind})</strong><br>` +
            `The river historically ended here, in playa/marsh sinks near Howe.<br>` +
            `<small>USGS National Hydrography Dataset waterbody polygon` +
            `${p.AREASQKM ? ` · ${Number(p.AREASQKM).toFixed(2)} km²` : ''}.</small>`,
          )
          lyr.on('click', () => callbacks.onFeatureClick(feature as GeoFeature, 'flowExtent'))
        },
      })
      add('flowExtent', sinksLayer)
    }
    mainstemLayer = L.geoJSON(mainstem, {
      style: (f: any) => mainstemStyle(f?.properties?.reach || 'above-moore', currentEra),
      onEachFeature: (feature, lyr) => {
        const below = feature.properties?.reach === 'below-moore'
        lyr.bindTooltip(
          below
            ? 'Big Lost River below Moore — usually dry now; historically reached the sinks'
            : 'Big Lost River',
          { sticky: true },
        )
        lyr.bindPopup(
          below
            ? `<strong>Big Lost River — below Moore diversion</strong><br>` +
              `WD34 accounting and USGS records show surface flow commonly ends near Moore in recent ` +
              `years — long before Arco (13132500, often <strong>0.0 cfs</strong> annual mean) or the sinks ` +
              `(13132565 near Howe). This reach is dashed brown in the "Now" view.<br>` +
              `<button class="zoom-btn" data-show-shrink style="margin-top:6px">📉 Step-down chart (Mackay → Moore → Arco)</button><br>` +
              `<small>Split at USGS 13132100 (below Moore diversion). Channel: NHD high resolution.</small>`
            : `<strong>Big Lost River — above Moore diversion</strong><br>` +
              `<small>Channel geometry: USGS National Hydrography Dataset (high resolution).</small>`,
        )
        lyr.on('click', () => callbacks.onFeatureClick(feature as GeoFeature, 'flowExtent'))
      },
    })
    add('flowExtent', mainstemLayer)
  } else if (flowExtent) {
    flowLayer = L.geoJSON(flowExtent, {
      style: (f: any) => flowExtentStyle(f?.properties?.era || 'historical'),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties || {}
        let html = `<strong>${p.name || 'Flow extent'}</strong><br>`
        if (p.proxy_description) {
          html += `<div style="margin-top:4px;font-size:0.8em"><strong>Flow extent proxy (${p.era || 'n/a'})</strong>: ${p.proxy_description}</div>`
        }
        if (p.source_urls?.length) {
          html += `<div style="margin-top:4px;font-size:0.75em">Sources: ${p.source_urls.map((u: string) => `<a href="${u}" target="_blank" rel="noopener">link</a>`).join(' ')}</div>`
        }
        lyr.bindPopup(html)
        lyr.on('click', () => callbacks.onFeatureClick(feature as GeoFeature, 'flowExtent'))
      },
    })
    add('flowExtent', flowLayer)
  }

  if (reaches.length) {
    add('reaches', L.geoJSON({ type: 'FeatureCollection', features: reaches } as any, {
      style: { color: '#334155', weight: 2.5, opacity: 0.85, dashArray: '5,3' },
      onEachFeature: (feature, lyr) => {
        const p = feature.properties || {}
        lyr.bindPopup(
          `<strong>${p.name}</strong><br>${p.description || ''}<br>` +
          `<small>Source: ${p.source || ''}</small><br>` +
          `<em>WD34 admin reach (NHD / district description).</em>`,
        )
        lyr.on('click', () => callbacks.onFeatureClick(feature as GeoFeature, 'reaches'))
      },
    }))
  }

  return {
    groups,
    loadHeavy,
    loadCanals,
    loadRiparian,
    setFlowEra: (era: FlowEra) => {
      currentEra = era
      // Real channel: blue everywhere in the historical era; in the recent era
      // the below-Arco reach goes dashed brown and the sinks fade out.
      mainstemLayer?.setStyle((f: any) => mainstemStyle(f?.properties?.reach || 'above-moore', era))
      sinksLayer?.setStyle(() => sinksStyle(era))
      // Riparian corridor reads strong in the historical era, dimmed today.
      riparianLayer?.setStyle((f: any) => riparianStyle(f, era))
      // Fallback proxy lines: emphasize the selected era's lines, fade the other.
      flowLayer?.setStyle((f: any) => {
        const featEra = f?.properties?.era || 'historical'
        const style = flowExtentStyle(featEra)
        return featEra === era ? { ...style, opacity: 0.95 } : { ...style, opacity: 0.25 }
      })
    },
  }
}
