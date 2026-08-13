/** Published WD34 storage-results extract (see scripts/etl/fetch_wd34_accounting.py). */

export interface AccountingReachValues {
  sharp: number | null
  twoBToLeslie: number | null
  leslieToMoore: number | null
  belowMoore: number | null
}

export interface AccountingDaily {
  date: string
  decreeDate: string | null
  percentFilled: number | null
  inflowCfs: number | null
  mackayReleaseCfs: number | null
  storageCfs: number | null
  decreeDelivery: AccountingReachValues
  storageDelivery: AccountingReachValues
  totals: { decree: number | null; storage: number | null }
  losses: { decree: number | null; storage: number | null }
  deliveryFactor: { decree: number | null; storage: number | null }
  conveyance: { leslie: number | null; moore: number | null; arco: number | null }
}

export interface AccountingCanal {
  canal: string
  wraUsedAf: number | null
  sbwAllocationIn: number | null
  sbwRemainingIn: number | null
  sbwUsedAf: number | null
}

export interface AccountingFile {
  title: string
  url: string
  kind: string
  available: boolean
}

export interface AccountingExtract {
  asOf: string
  generated: string
  sourcePage: string
  workbookUrl: string
  season: { start: string; end: string; days: number }
  notes: string
  files: AccountingFile[]
  daily: AccountingDaily[]
  canals: AccountingCanal[]
}

let cached: AccountingExtract | null | undefined

export async function loadAccounting(): Promise<AccountingExtract | null> {
  if (cached !== undefined) return cached
  try {
    const res = await fetch('/data/wd34-accounting.json')
    if (!res.ok) {
      cached = null
      return null
    }
    cached = (await res.json()) as AccountingExtract
    return cached
  } catch {
    cached = null
    return null
  }
}

export const ACCOUNTING_METHODOLOGY =
  'Figures copied from IDWR Water District 34 storage-results (public XLSX). Daily losses and delivery factors ' +
  'are as published by the district — they are not a physical seepage measurement and not a finding about any named user. ' +
  'Named canals (Eastside, Westside, Island, Arco, Munsey, Moore, …) are the workbook labels. Authorized max cfs on the ' +
  'POD layer is a different quantity from these daily delivery columns.'
