import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './style.css'
import L from 'leaflet'

import { loadDataStoreLight, enrichDataStoreWithPou, pouGeomKey, type DataStore } from './data'
import { podKey, focusViewForRight, primaryPodForRight } from './map/focusRight'
import { applyHashToState, restoreImageryFromHash, schedulePermalinkUpdate, setStoryStepForHash } from './permalink'
import { preferLiteMap } from './perf'
import { state, resetState } from './state'
import type { Basemap, GeoFeature, PodRecord } from './types'
import { BasemapControl, createMap } from './map/createMap'
import { PodLayer } from './map/podLayer'
import { WellLayer } from './map/wellLayer'
import { PouLayer } from './map/pouLayer'
import { DiversionLayer } from './map/diversionLayer'
import { loadStaticLayers, type StaticLayers } from './map/staticLayers'
import { renderShell } from './ui/shell'
import { wireSidebar, syncSidebarToState, loadDataAsOf, syncImageryControls } from './ui/sidebar'
import { updateLegend } from './ui/legend'
import { setupOwnerSearch, clearOwnerSearchUI, syncOwnerRightsSelection } from './ui/ownerSearch'
import {
  closeDetails, FLOW_STEP_GAGES, getReceiptReopen, highlightReceiptZoomRow, isDetailsOpen, isDetailsPinned,
  showAppropriationPanel, showDiversionDetails,
  showDryReachSeniorsPanel, showGageDetails, showGenericDetails, showPodDetails, showPouGroupDetails,
  showReachLossPanel, showTransfersOverview, showWellDetails,
} from './ui/details'
import {
  showOwnerConcentrationPanel,
  showWatchlistPanel, showWellPressurePanel, wireExportButtons,
} from './ui/observerPanels'
import { loadLocalWatchlist } from './watchlist'
import { dismissGuide, goToGuideStep, setGuideStepIndex, startGuide, wireGuide } from './ui/story'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

let map: L.Map
let store: DataStore
let podLayer: PodLayer
let wellLayer: WellLayer
let pouLayer: PouLayer
let diversionLayer: DiversionLayer
let staticLayers: StaticLayers
let basemap: BasemapControl
let currentBasemap: Basemap = 'satellite'
let localWatchlist: string[] = []
let ignoreMapClickUntil = 0

function updatePermalink() {
  if (map) schedulePermalinkUpdate(() => currentBasemap, map)
}

/** Selection forced filtered-out PODs into view → next change needs a rebuild. */
let selectionForcedRebuild = false

function refreshData() {
  podLayer.rebuild()
  wellLayer.rebuild()
  pouLayer.setVisibleWRs(podLayer.visibleWRs())
  selectionForcedRebuild = false
  updateLegendNow()
  updateSelectionBanner()
  updatePermalink()
}

function setSelection(wrs: Set<string>) {
  const affected = new Set([...state.selectedWRs, ...wrs])
  const isolateOff = state.isolateSelection && wrs.size === 0
  if (isolateOff) state.isolateSelection = false
  if (wrs.size === 0) state.focusPodKey = null
  state.selectedWRs = wrs

  const visible = podLayer.visibleWRs()
  // Isolating (or un-isolating) changes which of the 7k stars exist — rebuild.
  const needsRebuild =
    state.isolateSelection ||
    isolateOff ||
    selectionForcedRebuild ||
    [...wrs].some(wr => !visible.has(wr))
  if (needsRebuild) {
    podLayer.rebuild()
    pouLayer.setVisibleWRs(podLayer.visibleWRs())
    selectionForcedRebuild = wrs.size > 0
  } else {
    podLayer.restyle(affected)
    pouLayer.refreshSelection()
  }
  syncOwnerRightsSelection(wrs.size === 1 ? [...wrs][0] : null)
  updateSelectionBanner()
  updateLegendNow()
  updatePermalink()
}

function clearSelection() {
  if (state.selectedWRs.size === 0 && !state.isolateSelection) return
  setSelection(new Set())
  // Pinned receipts (CSV/charts) stay open so Zoom-from-table keeps context
  if (!isDetailsPinned()) closeDetails()
}

function updateLegendNow() {
  updateLegend(
    { pods: podLayer.visibleCount(), wells: wellLayer.visibleCount() },
    {
      pods: podLayer.enabled,
      wells: wellLayer.enabled,
      hydro: !!(staticLayers?.groups.hydro && map.hasLayer(staticLayers.groups.hydro)),
    },
  )
}

function updateSelectionBanner() {
  const banner = document.getElementById('selection-banner')!
  const text = document.getElementById('selection-text')!
  const hint = document.getElementById('map-hint')
  if (state.selectedWRs.size === 0) {
    banner.classList.add('hidden')
    hint?.classList.remove('hidden')
    return
  }
  hint?.classList.add('hidden')
  const wrs = [...state.selectedWRs]
  if (wrs.length === 1) {
    const owner = store.podsByWR.get(wrs[0])?.[0]?.owner
    text.textContent = state.isolateSelection
      ? `Right ${wrs[0]}${owner ? ` — ${owner}` : ''} · this diversion only`
      : `Right ${wrs[0]}${owner ? ` — ${owner}` : ''} · cyan = diversion ↔ fields`
  } else {
    text.textContent = state.isolateSelection
      ? `${wrs.length} rights isolated · cyan links diversions to fields`
      : `${wrs.length} rights share this place of use · cyan links diversions to fields`
  }
  banner.classList.remove('hidden')
}

function onPodClick(rec: PodRecord) {
  setSelection(rec.wr ? new Set([rec.wr]) : new Set())
  showPodDetails(rec, store)
}

function onPouClick(feature: GeoFeature) {
  const wr = (feature.properties?.WaterRightNumber || '').trim()
  if (!wr) return
  const key = pouGeomKey(feature.geometry)
  const group = key && store.geomKeyToWRs.get(key)
  const wrs = group ? new Set(group) : new Set([wr])
  setSelection(wrs)
  showPouGroupDetails(wrs, feature, store)
}

/** Center on the highest-rate POD at field scale — never a basin-wide fit. */
function zoomToWR(wr: string) {
  const view = focusViewForRight(store.podsByWR.get(wr) || [], store.pouCenter.get(wr))
  if (view) map.setView([view.lat, view.lon], view.zoom, { animate: true })
}

function focusRight(wr: string, opts: { isolate: boolean; fromReceipt?: boolean }) {
  const rec = primaryPodForRight(store.podsByWR.get(wr) || [])
  state.isolateSelection = opts.isolate
  state.focusPodKey = opts.isolate && rec ? podKey(rec) : null
  ignoreMapClickUntil = Date.now() + 500
  setSelection(new Set([wr]))
  zoomToWR(wr)
  podLayer.reveal(wr)
  highlightReceiptZoomRow(wr)
  if (!opts.fromReceipt && rec) showPodDetails(rec, store)
}

/** Zoom + select + isolate when coming from a receipt table. */
function focusWRFromReceipt(wr: string) {
  focusRight(wr, { isolate: true, fromReceipt: true })
}

const GAGE_COORDS: Record<string, [number, number]> = {
  ...Object.fromEntries(Object.values(FLOW_STEP_GAGES).map(g => [g.site, [g.lat, g.lon]])),
  '13132580': [43.7965727, -112.8502748],
}

function zoomToGage(site: string) {
  const c = GAGE_COORDS[site]
  if (c) map.setView(c, 12)
}

function setLoadStatus(label: string, pct: number) {
  const status = document.getElementById('load-status')
  const fill = document.getElementById('load-bar-fill')
  if (status) status.textContent = label
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`
}

function hideLoadOverlay() {
  document.getElementById('load-overlay')?.classList.add('hidden')
}

async function bootstrap() {
  renderShell()
  void loadDataAsOf()
  const lite = preferLiteMap()
  // Dense POU fills are opt-in (Advanced) — keeps map usable; ★ click still paints selection.
  state.placeOfUseMode = false
  state.hideNonMatches = true
  if (lite) {
    document.body.classList.add('lite-map')
  }
  setLoadStatus(lite ? 'Phone-friendly load…' : 'Building map…', 8)

  map = createMap()
  basemap = new BasemapControl(map)
  basemap.set('satellite')

  const restored = applyHashToState()
  if (restored.basemap) {
    currentBasemap = restored.basemap
    basemap.set(restored.basemap)
  }
  void restoreImageryFromHash(restored).then(() => syncImageryControls())
  if (restored.view && restored.storyStep == null) {
    map.setView([restored.view.lat, restored.view.lng], restored.view.zoom)
  }
  if (restored.storyStep != null) setGuideStepIndex(restored.storyStep)

  setLoadStatus('Loading water rights…', 20)
  store = await loadDataStoreLight(label => setLoadStatus(label, 35))

  setLoadStatus('Drawing channels & gages…', 50)
  podLayer = new PodLayer(map, store, onPodClick, { lite })
  wellLayer = new WellLayer(map, store, rec => showWellDetails(rec))
  pouLayer = new PouLayer(map, store, onPouClick)
  diversionLayer = new DiversionLayer(map, store, d => showDiversionDetails(d, store))
  diversionLayer.setEnabled(true)
  podLayer.setEnabled(true)
  wellLayer.setEnabled(false)

  staticLayers = await loadStaticLayers(map, store.reaches, {
    onFeatureClick: (feature, group) =>
      group === 'gages' ? showGageDetails(feature) : showGenericDetails(feature, group),
  }, { deferHeavy: true })
  staticLayers.setFlowEra(state.flowEra)

  const syncLayerCheckbox = (id: string, on: boolean) => {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el) el.checked = on
  }

  wireExportButtons(store)

  void loadLocalWatchlist().then(wrs => {
    localWatchlist = wrs
    const btn = document.getElementById('watchlist-btn')
    if (btn && wrs.length) btn.classList.remove('hidden')
  })

  const ensureCanalsVisible = () => {
    syncLayerCheckbox('layer-hydro', true)
    void staticLayers.loadCanals().then(() => {
      const group = staticLayers.groups.hydro
      if (group && !map.hasLayer(group)) map.addLayer(group)
      updateLegendNow()
    })
  }

  // Defer canals; never auto-load heavy NWI (user toggles riparian).
  if (!lite) void staticLayers.loadCanals()

  wireSidebar({
    refreshData,
    setLayerEnabled: (key, on) => {
      if (key === 'pods') {
        podLayer.setEnabled(on)
        pouLayer.setVisibleWRs(podLayer.visibleWRs())
      } else if (key === 'wells') {
        wellLayer.setEnabled(on)
      } else if (key === 'diversions') {
        diversionLayer.setEnabled(on)
      } else {
        if (on && key === 'hydro') {
          void staticLayers.loadCanals().then(() => {
            const group = staticLayers.groups.hydro
            if (group) map.addLayer(group)
            updateLegendNow()
          })
          return
        }
        if (on && key === 'riparian') {
          void staticLayers.loadRiparian().then(() => {
            const group = staticLayers.groups.riparian
            if (group) map.addLayer(group)
            updateLegendNow()
          })
          return
        }
        const group = staticLayers.groups[key]
        if (group) {
          if (on) map.addLayer(group)
          else map.removeLayer(group)
        }
      }
      updateLegendNow()
    },
    setBasemap: b => {
      currentBasemap = b
      basemap.set(b)
      syncImageryControls()
      updatePermalink()
    },
    onImageryChange: () => {
      updatePermalink()
      pouLayer.setVisibleWRs(podLayer.visibleWRs())
    },
    setFlowEra: era => staticLayers.setFlowEra(era),
    onHighlightMode: mode => {
      if (mode === 'transfers') ensureCanalsVisible()
    },
    onSheetChange: () => {
      requestAnimationFrame(() => map.invalidateSize())
    },
    showAppropriation: () => showAppropriationPanel(store),
    showRiverShrink: () => showReachLossPanel(),
    showDryReach: () => showDryReachSeniorsPanel(store),
    showMovedFarther: () => {
      ensureCanalsVisible()
      showTransfersOverview(store)
    },
    showOwnerConcentration: () => showOwnerConcentrationPanel(store),
    showWellPressure: () => {
      showWellPressurePanel(store, {
        revealWells: () => {
          wellLayer.setEnabled(true)
          syncLayerCheckbox('layer-wells', true)
          syncLayerCheckbox('well-hide-domestic', state.hideDomestic)
          const wellColor = document.getElementById('well-color-mode') as HTMLSelectElement | null
          if (wellColor) wellColor.value = state.wellColorMode
          refreshData()
        },
      })
    },
    showWatchlist: () => showWatchlistPanel(store, localWatchlist),
    setOwnerHighlight: owner => {
      state.ownerHighlight = owner
      state.selectedWRs = new Set()
      state.isolateSelection = false
      state.focusPodKey = null
      refreshData()
    },
    resetAll: () => {
      dismissGuide()
      resetState()
      state.placeOfUseMode = false
      state.hideNonMatches = true
      syncSidebarToState()
      clearOwnerSearchUI()
      closeDetails()
      refreshData()
    },
  })
  syncSidebarToState()
  syncLayerCheckbox('layer-pods', podLayer.enabled)
  syncLayerCheckbox('layer-wells', wellLayer.enabled)
  syncLayerCheckbox('layer-riparian', false)
  syncLayerCheckbox('place-of-use-mode', state.placeOfUseMode)

  wireGuide({
    refreshData,
    setFlowEra: era => staticLayers.setFlowEra(era),
    setView: (lat, lon, zoom, opts) => {
      map.setView([lat, lon], zoom, opts?.animate === false ? { animate: false } : undefined)
    },
    setPodsEnabled: on => {
      podLayer.setEnabled(on)
      syncLayerCheckbox('layer-pods', on)
    },
    setWellsEnabled: on => {
      wellLayer.setEnabled(on)
      syncLayerCheckbox('layer-wells', on)
    },
    setPodsWellsFlags: (pods, wells) => {
      podLayer.enabled = pods
      wellLayer.enabled = wells
      syncLayerCheckbox('layer-pods', pods)
      syncLayerCheckbox('layer-wells', wells)
    },
    setGuidePaintMode: active => {
      state.placeOfUseMode = false
      syncLayerCheckbox('place-of-use-mode', false)
      podLayer.setGuideMode(active)
    },
    showRiverShrink: () => showReachLossPanel(),
    showDryReach: () => showDryReachSeniorsPanel(store),
    showTransfers: () => {
      ensureCanalsVisible()
      showTransfersOverview(store)
    },
    ensureCanalsVisible,
    onStepChange: i => {
      setStoryStepForHash(i)
      updatePermalink()
    },
    onGuideActiveChange: () => {
      requestAnimationFrame(() => map.invalidateSize())
    },
  })

  setupOwnerSearch(store, {
    onSelect: owner => {
      state.ownerHighlight = owner
      state.selectedWRs = new Set()
      state.isolateSelection = false
      state.focusPodKey = null
      if (!podLayer.enabled) {
        podLayer.setEnabled(true)
        syncLayerCheckbox('layer-pods', true)
      }
      refreshData()
    },
    onSelectRight: wr => {
      focusRight(wr, { isolate: false })
    },
    onShowAll: () => {
      state.isolateSelection = false
      setSelection(new Set())
      if (!isDetailsPinned()) closeDetails()
    },
    onClear: () => {
      state.ownerHighlight = null
      state.selectedWRs = new Set()
      state.isolateSelection = false
      state.focusPodKey = null
      refreshData()
    },
  })

  document.getElementById('selection-clear')?.addEventListener('click', clearSelection)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (isDetailsOpen()) {
      closeDetails()
      return
    }
    clearSelection()
  })
  map.on('click', () => {
    if (Date.now() < ignoreMapClickUntil) return
    clearSelection()
  })

  document.getElementById('close-details')?.addEventListener('click', closeDetails)
  document.getElementById('details-content')?.addEventListener('click', e => {
    const t = e.target as HTMLElement
    if (t.closest('[data-back-receipt]')) {
      getReceiptReopen()?.()
      return
    }
    const btn = t.closest<HTMLElement>('[data-zoom-wr]')
    if (btn?.dataset.zoomWr) {
      focusWRFromReceipt(btn.dataset.zoomWr)
    }
  })
  document.addEventListener('click', e => {
    const t = e.target as HTMLElement
    const gageBtn = t.closest<HTMLElement>('[data-zoom-gage]')
    if (gageBtn?.dataset.zoomGage) zoomToGage(gageBtn.dataset.zoomGage)
    if (t.closest('[data-show-shrink]')) showReachLossPanel()
  })

  map.on('moveend', updatePermalink)

  refreshData()
  setLoadStatus(lite ? 'Map ready — tap a ★ for cyan field lines' : 'Map ready — loading fields in background…', 70)
  hideLoadOverlay()
  requestAnimationFrame(() => map.invalidateSize())

  if (restored.storyStep != null) {
    startGuide(restored.storyStep)
  } else if (!restored.view) {
    map.setView([43.70, -113.32], 10)
  }

  void (async () => {
    try {
      await enrichDataStoreWithPou(store, label => setLoadStatus(label, 85))
      pouLayer.onPouDataReady()
      // Canals only — NWI waits for the riparian checkbox.
      if (!lite) await staticLayers.loadCanals()
      setLoadStatus('Background data ready — click a ★ or a field for cyan links', 100)
    } catch (err) {
      console.error('Background layer load failed', err)
      setLoadStatus('Some layers failed to load', 100)
    }
  })()

  // Debug handle
  ;(window as any).__basin34 = { map, store, state, lite, podLayer, wellLayer, pouLayer, goToGuideStep, startGuide }
}

bootstrap()
