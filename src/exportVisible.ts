import { type DataStore } from './data'
import { toCsv, downloadText } from './csv'
import { podVisible, wellVisible } from './filters'
import { MOORE_LAT } from './dryReach'
import { state } from './state'
import { formatMilesNumber, kmToMiles } from './units'

export function visiblePodsToCsv(store: DataStore): string {
  const seen = new Set<string>()
  const rows: Array<Array<string | number>> = []
  for (const rec of store.pods) {
    if (!podVisible(rec, state, store)) continue
    const key = `${rec.wr}|${rec.lat}|${rec.lon}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push([
      rec.wr, rec.owner, rec.year ?? '', rec.rate, rec.source, rec.uses, rec.diversionName,
      rec.lat.toFixed(5), rec.lon.toFixed(5),
      isFinite(rec.corridorDistKm) ? formatMilesNumber(rec.corridorDistKm, 2) : '',
      rec.lat <= MOORE_LAT ? 'yes' : 'no',
    ])
  }
  return toCsv(
    [
      'water_right', 'owner', 'priority_year', 'max_diversion_cfs', 'source', 'uses', 'diversion',
      'lat', 'lon', 'corridor_mi', 'below_moore',
    ],
    rows,
  )
}

export function visibleWellsToCsv(store: DataStore): string {
  return toCsv(
    ['well_id', 'owner', 'use', 'year', 'total_depth_ft', 'static_wl_ft', 'production_gpm', 'lat', 'lon'],
    store.wells.filter(w => wellVisible(w, state, store)).map(w => {
      const p = w.feature.properties || {}
      return [
        p.WellID ?? '', p.Owner ?? '', p.WellUse ?? '', w.year ?? '',
        w.depth ?? '', w.swl ?? '', w.rate || '',
        w.lat.toFixed(5), w.lon.toFixed(5),
      ]
    }),
  )
}

export function visiblePodsToGeoJson(store: DataStore): string {
  const features = store.pods
    .filter(rec => podVisible(rec, state, store))
    .map(rec => ({
      type: 'Feature',
      geometry: rec.feature.geometry,
      properties: {
        WaterRightNumber: rec.wr,
        Owner: rec.owner,
        PriorityYear: rec.year,
        MaxDiversionCfs: rec.rate,
        Source: rec.source,
        Uses: rec.uses,
        DiversionName: rec.diversionName,
        corridorMi: isFinite(rec.corridorDistKm) ? Number(kmToMiles(rec.corridorDistKm).toFixed(2)) : null,
        belowMoore: rec.lat <= MOORE_LAT,
      },
    }))
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
}

export function downloadVisiblePodsCsv(store: DataStore) {
  downloadText('basin34-visible-pods.csv', visiblePodsToCsv(store), 'text/csv;charset=utf-8')
}

export function downloadVisibleWellsCsv(store: DataStore) {
  downloadText('basin34-visible-wells.csv', visibleWellsToCsv(store), 'text/csv;charset=utf-8')
}

export function downloadVisiblePodsGeoJson(store: DataStore) {
  downloadText('basin34-visible-pods.geojson', visiblePodsToGeoJson(store), 'application/geo+json')
}
