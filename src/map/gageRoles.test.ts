import { describe, expect, it } from 'vitest'
import { gageChartsStory, gageRoleFromProps, gageRoleLabel } from './gageRoles'

describe('gageRoleFromProps', () => {
  it('uses the GeoJSON role when present', () => {
    expect(gageRoleFromProps('13130500', { role: 'context' })).toBe('context')
    expect(gageRoleFromProps('13132500', { role: 'remnant' })).toBe('remnant')
  })

  it('falls back by USGS site number', () => {
    expect(gageRoleFromProps('13127000')).toBe('yield')
    expect(gageRoleFromProps('13132100')).toBe('terminus')
    expect(gageRoleFromProps('13132500')).toBe('remnant')
    expect(gageRoleFromProps('13132565')).toBe('archive')
    expect(gageRoleFromProps('13130500')).toBe('context')
    expect(gageRoleFromProps('13132580')).toBe('context')
  })

  it('treats unknown sites as context (no fake annual-mean chart)', () => {
    expect(gageRoleFromProps('99999999')).toBe('context')
    expect(gageRoleFromProps(undefined)).toBe('context')
  })
})

describe('gageChartsStory', () => {
  it('charts yield, terminus, and remnant; redirects archive and context', () => {
    expect(gageChartsStory('yield')).toBe(true)
    expect(gageChartsStory('terminus')).toBe(true)
    expect(gageChartsStory('remnant')).toBe(true)
    expect(gageChartsStory('archive')).toBe(false)
    expect(gageChartsStory('context')).toBe(false)
  })

  it('labels roles for the inspector', () => {
    expect(gageRoleLabel('context')).toMatch(/not a long discharge record/i)
    expect(gageRoleLabel('archive')).toMatch(/discontinued/i)
  })
})
