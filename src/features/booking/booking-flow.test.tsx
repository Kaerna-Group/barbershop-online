import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { fallbackConfig } from '../../shared/data/fallback'
import { I18nProvider } from '../../shared/i18n'
import { AppHeader } from '../../shared/ui/ui'
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

  it('switches the interface language to English', async () => {
    document.cookie = 'barber_language=; Max-Age=0; Path=/'
    const user = userEvent.setup()

    render(
      <I18nProvider>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </I18nProvider>,
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Limba interfeței' }),
      'en',
    )

    expect(
      screen.getByRole('link', { name: 'My appointments' }),
    ).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    document.cookie = 'barber_language=; Max-Age=0; Path=/'
  })
})
