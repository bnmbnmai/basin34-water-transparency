/** Shared JSON fetch cache so POU enrich + static layers do not double-download. */

const cache = new Map<string, Promise<any | null>>()

export function fetchJsonCached(url: string): Promise<any | null> {
  let pending = cache.get(url)
  if (pending) return pending
  pending = (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[fetch] failed ${url}: ${res.status}`)
        return null
      }
      return await res.json()
    } catch (e) {
      console.warn(`[fetch] error ${url}`, e)
      return null
    }
  })()
  cache.set(url, pending)
  return pending
}

export async function fetchFeaturesCached(url: string): Promise<any[]> {
  const data = await fetchJsonCached(url)
  return data?.features || []
}
