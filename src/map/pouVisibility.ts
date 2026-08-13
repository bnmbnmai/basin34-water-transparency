/**
 * IDWR POU polygons are today’s authorized fields. Hide the basin-wide outlines
 * on Year/Archive photos unless the user asks to compare.
 */
export function basinPouOutlinesAllowed(
  imageryMode: string,
  showPouOnImagery: boolean,
): boolean {
  if (imageryMode === 'landsat' || imageryMode === 'wayback') return showPouOnImagery
  return true
}
