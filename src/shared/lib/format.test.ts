import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatMoney,
  getBookableDates,
  toLocalDateInput,
} from './format'

describe('format helpers', () => {
  it('formats Romanian lei from minor units', () => {
    expect(formatMoney(8000, 'RON')).toContain('80')
  })

  it('keeps date input values stable', () => {
    expect(toLocalDateInput(new Date(2026, 8, 9))).toBe('2026-09-09')
    expect(toLocalDateInput(addDays(new Date(2026, 8, 9), 2))).toBe(
      '2026-09-11',
    )
  })

  it('builds a requested number of booking dates', () => {
    expect(getBookableDates(8)).toHaveLength(8)
  })
})
