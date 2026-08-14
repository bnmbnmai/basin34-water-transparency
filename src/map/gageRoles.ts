/** Gage roles for the Mackay → Moore → Arco story. */

export type GageRole = 'yield' | 'terminus' | 'remnant' | 'archive' | 'context'

const BY_SITE: Record<string, GageRole> = {
  '13127000': 'yield',
  '13132100': 'terminus',
  '13132000': 'terminus',
  '13132500': 'remnant',
  '13132535': 'archive',
  '13132565': 'archive',
  '13130500': 'context',
  '13132580': 'context',
  '13120000': 'context',
}

export function gageRoleFromProps(siteNo: string | undefined, props?: Record<string, unknown>): GageRole {
  const tagged = props?.role
  if (
    tagged === 'yield' || tagged === 'terminus' || tagged === 'remnant' ||
    tagged === 'archive' || tagged === 'context'
  ) {
    return tagged
  }
  if (siteNo && BY_SITE[siteNo]) return BY_SITE[siteNo]
  return 'context'
}

export function gageChartsStory(role: GageRole): boolean {
  return role === 'yield' || role === 'terminus' || role === 'remnant'
}

export function gageRoleLabel(role: GageRole): string {
  switch (role) {
    case 'yield': return 'Basin yield'
    case 'terminus': return 'Where the river often ends now'
    case 'remnant': return 'What still reaches Arco'
    case 'archive': return 'Discontinued — historical reach'
    case 'context': return 'Context gage — not a long discharge record'
  }
}

export interface GageMarkerStyle {
  radius: number
  color: string
  fillColor: string
  fillOpacity: number
  weight: number
}

export function gageMarkerStyle(role: GageRole): GageMarkerStyle {
  switch (role) {
    case 'yield':
      return { radius: 8, color: '#0369a1', fillColor: '#0ea5e9', fillOpacity: 0.95, weight: 2 }
    case 'terminus':
      return { radius: 8, color: '#c2410c', fillColor: '#f97316', fillOpacity: 0.95, weight: 2 }
    case 'remnant':
      return { radius: 8, color: '#991b1b', fillColor: '#dc2626', fillOpacity: 0.95, weight: 2 }
    case 'archive':
      return { radius: 5.5, color: '#57534e', fillColor: '#a8a29e', fillOpacity: 0.85, weight: 1.5 }
    case 'context':
      return { radius: 5, color: '#78716c', fillColor: '#fafaf9', fillOpacity: 0.9, weight: 1.5 }
  }
}
