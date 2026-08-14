import type { DataStore } from '../data'
import { listOwnerRights, type OwnerRightRow } from './ownerRights'

const LIST_CAP = 40

export interface OwnerSearchCallbacks {
  onSelect: (owner: string) => void
  onClear: () => void
  onSelectRight: (wr: string) => void
  onShowAll: () => void
}

export function setupOwnerSearch(store: DataStore, cb: OwnerSearchCallbacks) {
  const search = document.getElementById('search') as HTMLInputElement
  const resultsDiv = document.getElementById('owner-search-results')!
  const clearBtn = document.getElementById('clear-owner-highlight')!
  const summaryDiv = document.getElementById('owner-summary')!

  let debounce: ReturnType<typeof setTimeout>
  search.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      const term = search.value.trim().toLowerCase()
      if (term.length < 2) {
        resultsDiv.innerHTML = ''
        resultsDiv.classList.add('hidden')
        return
      }
      const list = store.owners.filter(o => o.toLowerCase().includes(term)).slice(0, 8)
      if (!list.length) {
        resultsDiv.innerHTML = '<div class="text-[var(--text-muted)] p-0.5">No matching owners</div>'
        resultsDiv.classList.remove('hidden')
        return
      }
      resultsDiv.innerHTML = list
        .map(o => `<div class="owner-result cursor-pointer hover:bg-[var(--border)] p-0.5 rounded" data-owner="${escAttr(o)}">${esc(o)}</div>`)
        .join('')
      resultsDiv.classList.remove('hidden')
      resultsDiv.querySelectorAll<HTMLElement>('.owner-result').forEach(el => {
        el.addEventListener('click', () => {
          const owner = el.dataset.owner || ''
          resultsDiv.innerHTML = ''
          resultsDiv.classList.add('hidden')
          search.value = owner
          const rights = updateOwnerSummary(owner, store)
          cb.onSelect(owner)
          if (rights.length === 1) cb.onSelectRight(rights[0].wr)
        })
      })
    }, 180)
  })

  clearBtn.addEventListener('click', () => {
    search.value = ''
    resultsDiv.innerHTML = ''
    resultsDiv.classList.add('hidden')
    summaryDiv.classList.add('hidden')
    cb.onClear()
  })

  summaryDiv.addEventListener('click', e => {
    const t = e.target as HTMLElement
    if (t.closest('[data-owner-show-all]')) {
      e.preventDefault()
      syncOwnerRightsSelection(null)
      cb.onShowAll()
      return
    }
    const row = t.closest<HTMLElement>('[data-owner-wr]')
    if (row?.dataset.ownerWr) {
      e.preventDefault()
      syncOwnerRightsSelection(row.dataset.ownerWr)
      cb.onSelectRight(row.dataset.ownerWr)
    }
  })
}

export function clearOwnerSearchUI() {
  const search = document.getElementById('search') as HTMLInputElement | null
  if (search) search.value = ''
  document.getElementById('owner-summary')?.classList.add('hidden')
  const res = document.getElementById('owner-search-results')
  if (res) { res.innerHTML = ''; res.classList.add('hidden') }
}

export function syncOwnerRightsSelection(wr: string | null) {
  document.querySelectorAll<HTMLElement>('#owner-summary [data-owner-wr]').forEach(el => {
    el.classList.toggle('is-selected', !!wr && el.dataset.ownerWr === wr)
  })
}

function updateOwnerSummary(term: string, store: DataStore): OwnerRightRow[] {
  const summaryDiv = document.getElementById('owner-summary')!
  const nameEl = document.getElementById('owner-name')!
  const statsEl = document.getElementById('owner-stats')!

  const rights = listOwnerRights(store, term)
  const matches = store.pods.filter(r => r.ownerLc.includes(term.toLowerCase()))
  if (!rights.length) {
    summaryDiv.classList.add('hidden')
    return []
  }
  const totalRate = rights.reduce((s, r) => s + r.rate, 0)
  const years = rights.map(r => r.year).filter((y): y is number => y != null)
  const minY = years.length ? Math.min(...years) : null
  const maxY = years.length ? Math.max(...years) : null

  const shown = rights.slice(0, LIST_CAP)
  let html = `<div><strong>${rights.length}</strong> right${rights.length === 1 ? '' : 's'} · <strong>${totalRate.toFixed(1)}</strong> cfs`
  if (matches.length > rights.length) html += ` · ${matches.length} PODs`
  html += `</div>`
  if (minY != null && maxY != null) html += `<div>Priority: ${minY}–${maxY}</div>`
  html += `<p class="owner-rights-hint">Click a right to paint its diversion and fields (cyan). Other rights for this owner stay amber.</p>`
  if (rights.length > 1) {
    html += `<button type="button" class="owner-show-all" data-owner-show-all>Show all this owner's stars</button>`
  }
  html += `<div class="owner-rights-list">`
  for (const row of shown) {
    const src = (row.source || 'Unknown').slice(0, 28)
    const yr = row.year != null ? String(row.year) : '—'
    const pods = row.podCount > 1 ? ` · ${row.podCount} PODs` : ''
    html += `<button type="button" class="owner-right-row" data-owner-wr="${escAttr(row.wr)}">`
    html += `<span class="owner-right-id">${esc(row.wr)}</span>`
    html += `<span class="owner-right-meta">${yr} · ${row.rate.toFixed(1)} cfs · ${esc(src)}${pods}</span>`
    html += `</button>`
  }
  html += `</div>`
  if (rights.length > LIST_CAP) {
    html += `<div class="owner-rights-more">Showing ${LIST_CAP} of ${rights.length}. Pick a more specific owner name to narrow the list.</div>`
  }

  nameEl.textContent = term
  statsEl.innerHTML = html
  summaryDiv.classList.remove('hidden')
  return rights
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(s: string): string {
  return esc(s).replace(/"/g, '&quot;')
}
