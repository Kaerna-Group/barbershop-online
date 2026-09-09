import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fallbackConfig } from '../../shared/data/fallback'
import { BookingFlow } from './booking-flow'

describe('BookingFlow', () => {
  it('lets the client choose a service and continue to the date', async () => {
    const user = userEvent.setup()
    render(<BookingFlow config={fallbackConfig} />)

    const combinedService = screen.getByRole('radio', {
      name: /Tuns \+ barbă/i,
    })
    await user.click(combinedService)
    expect(combinedService).toBeChecked()

    await user.click(screen.getByRole('button', { name: /Continuă/i }))
    expect(
      screen.getByRole('heading', { name: /În ce zi/i }),
    ).toBeInTheDocument()
  })

  it('explains that demo confirmation needs Supabase', () => {
    render(<BookingFlow config={fallbackConfig} />)
    expect(screen.getByText(/Mod demonstrativ/i)).toBeInTheDocument()
  })
})
