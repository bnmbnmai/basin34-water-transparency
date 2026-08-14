import type { HighlightMode } from '../types'

/** Full-basin view still clusters; focused views draw individual stars. */
export const CLUSTER_WHEN_MORE_THAN = 400

/**
 * Numbered cluster blobs hide which right is which. Cluster only when the
 * map is showing the unfiltered basin (thousands of DivIcons). Isolation,
 * owner search, and analysis receipts are small enough to draw as stars.
 */
export function shouldClusterPods(opts: {
  isolateSelection: boolean
  ownerHighlight: string | null
  highlightMode: HighlightMode
  visibleCount: number
  threshold?: number
}): boolean {
  if (opts.isolateSelection) return false
  if (opts.ownerHighlight) return false
  if (opts.highlightMode !== 'none') return false
  return opts.visibleCount > (opts.threshold ?? CLUSTER_WHEN_MORE_THAN)
}
