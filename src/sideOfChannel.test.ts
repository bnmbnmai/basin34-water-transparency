import { describe, expect, it } from 'vitest'
import { sideOfMainstem } from './sideOfChannel'

describe('sideOfMainstem', () => {
  const stem: Array<[number, number]> = [
    [43.78, -113.36],
    [43.58, -113.27],
  ]

  it('labels a more-westerly point as west', () => {
    expect(sideOfMainstem(43.58, -113.40, stem)).toBe('west')
  })

  it('labels a more-easterly point as east', () => {
    expect(sideOfMainstem(43.58, -113.10, stem)).toBe('east')
  })

  it('returns unknown when too far or on-channel', () => {
    expect(sideOfMainstem(43.58, -113.2701, stem)).toBe('unknown')
    expect(sideOfMainstem(40.0, -100.0, stem)).toBe('unknown')
  })
})
