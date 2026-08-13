/**
 * Local-only pin list. Loaded in `npm run dev` from private/watchlist.json
 * (Vite middleware). Production builds never fetch or bundle it.
 */

export interface WatchlistFile {
  rights?: Array<{ wr?: string }>
}

export async function loadLocalWatchlist(): Promise<string[]> {
  if (!import.meta.env.DEV) return []
  try {
    const res = await fetch('/watchlist.local.json', { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as WatchlistFile
    const seen = new Set<string>()
    const out: string[] = []
    for (const row of data.rights || []) {
      const wr = (row.wr || '').trim()
      if (!wr || seen.has(wr)) continue
      seen.add(wr)
      out.push(wr)
    }
    return out
  } catch {
    return []
  }
}
