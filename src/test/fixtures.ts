import type { DataStore } from '../data'
import type { PodRecord } from '../types'

export function emptyStore(over: Partial<DataStore> = {}): DataStore {
  return {
    pods: [],
    wells: [],
    pous: [],
    podsByWR: new Map(),
    pousByWR: new Map(),
    geomKeyToWRs: new Map(),
    transferDistKm: new Map(),
    corridorDistKm: new Map(),
    newGroundWRs: new Set(),
    pouCenter: new Map(),
    reaches: [],
    reachSouthLat: new Map(),
    owners: [],
    mainstemPts: [],
    ...over,
  }
}

export function pod(over: Partial<PodRecord> = {}): PodRecord {
  const wr = over.wr ?? '34-1'
  const rec: PodRecord = {
    feature: { type: 'Feature', geometry: null, properties: {} },
    wr,
    owner: 'Test Owner',
    ownerLc: 'test owner',
    source: 'BIG LOST RIVER',
    isGW: false,
    isSurf: true,
    year: 1940,
    rate: 2,
    lat: 43.70,
    lon: -113.30,
    isTransfer: false,
    corridorDistKm: 0.5,
    uses: 'IRRIGATION',
    diversionName: '',
    ...over,
  }
  rec.ownerLc = rec.owner.toLowerCase()
  return rec
}
