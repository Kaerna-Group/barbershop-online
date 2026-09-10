import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { resetMockBackend } from '../../shared/api/barber-api'
import { fallbackConfig } from '../../shared/data/fallback'
import { I18nProvider } from '../../shared/i18n'
import { AppHeader } from '../../shared/ui/ui'
import { BookingFlow } from './booking-flow'

describe('BookingFlow', () => {
  beforeEach(() => resetMockBackend())

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

  it('creates a mock booking without a phone number or OTP', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <BookingFlow config={fallbackConfig} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/Mod demonstrativ/i)).toBeInTheDocument()
    expect(screen.getByText(/fără telefon sau cod SMS/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Continuă/i }))
    const futureWeekday = screen
      .getAllByRole<HTMLInputElement>('radio')
      .find((input) => {
        const weekday = new Date(input.value + 'T12:00:00Z').getUTCDay()
        return !input.checked && weekday >= 1 && weekday <= 5
      })
    expect(futureWeekday).toBeDefined()
    if (!futureWeekday) return
    await user.click(futureWeekday)

    await user.click(screen.getByRole('button', { name: /Continuă/i }))
    const slots = await screen.findAllByRole<HTMLInputElement>('radio')
    await user.click(slots[0])
    await user.click(screen.getByRole('button', { name: /Continuă/i }))

    expect(
      screen.queryByRole('textbox', { name: /Telefon/i }),
    ).not.toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: /Numele tău/i }),
      'Client Demo',
    )
    await user.click(
      screen.getByRole('button', { name: /Creează programarea demo/i }),
    )

    expect(
      await screen.findByText(/Programarea demonstrativă a fost salvată/i),
    ).toBeInTheDocument()
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

    await user.click(
      screen.getByRole('button', {
        name: 'Limba interfeței: Română',
      }),
    )
    await user.click(
      screen.getByRole('option', {
        name: 'EN English',
      }),
    )

    expect(
      screen.getByRole('link', { name: 'My appointments' }),
    ).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    document.cookie = 'barber_language=; Max-Age=0; Path=/'
  })
})
