import type { Session } from '@supabase/supabase-js'
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  LogOut,
  MapPin,
  Scissors,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PhoneAuth } from '../features/auth/phone-auth'
import {
  cancelBooking,
  getMyBookings,
  getPublicConfig,
  getRescheduleSlots,
  getSession,
  isSupabaseConfigured,
  rescheduleBooking,
  signOut,
  subscribeToAuth,
} from '../shared/api/barber-api'
import {
  addDaysToDateInput,
  formatLongDate,
  formatMoney,
  formatTime,
  statusLabel,
  todayInTimeZone,
} from '../shared/lib/format'
import { useI18n } from '../shared/i18n-context'
import type { Booking, PublicConfig, TimeSlot } from '../shared/model/types'
import {
  AppHeader,
  Button,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  Notice,
  SectionLabel,
} from '../shared/ui/ui'

function BookingCard({
  booking,
  config,
  onCancel,
  onReschedule,
}: {
  booking: Booking
  config: PublicConfig
  onCancel: (booking: Booking) => void
  onReschedule: (booking: Booking) => void
}) {
  const { locale, t } = useI18n()
  const canChange =
    booking.status === 'confirmed' &&
    new Date(booking.startsAt).getTime() - Date.now() >=
      config.settings.changeCutoffHours * 60 * 60 * 1000

  return (
    <article className="booking-card">
      <div className="booking-card__date">
        <strong>
          {new Intl.DateTimeFormat(locale, {
            day: '2-digit',
            timeZone: config.settings.timezone,
          }).format(new Date(booking.startsAt))}
        </strong>
        <span>
          {new Intl.DateTimeFormat(locale, {
            month: 'short',
            timeZone: config.settings.timezone,
          }).format(new Date(booking.startsAt))}
        </span>
      </div>
      <div className="booking-card__body">
        <div className="booking-card__heading">
          <div>
            <h3>{booking.serviceName}</h3>
            <p>
              <Clock3 aria-hidden="true" />{' '}
              {formatTime(booking.startsAt, config.settings.timezone, locale)} ·{' '}
              {booking.durationMinutes} min
            </p>
          </div>
          <span className={`status-pill status-pill--${booking.status}`}>
            {t(statusLabel(booking.status))}
          </span>
        </div>
        <div className="booking-card__details">
          <span>
            <MapPin aria-hidden="true" /> {config.profile.addressLine}
          </span>
          <strong>
            {formatMoney(booking.priceMinor, booking.currency, locale)}
          </strong>
        </div>
        {booking.status === 'confirmed' ? (
          canChange ? (
            <div className="booking-card__actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => onReschedule(booking)}
              >
                {t('Mută vizita')}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => onCancel(booking)}
                icon={XCircle}
              >
                {t('Anulează')}
              </Button>
            </div>
          ) : (
            <p className="booking-card__cutoff">
              {t(
                'Modificările online s-au închis. Contactează frizerul direct dacă nu mai poți ajunge.',
              )}
            </p>
          )
        ) : null}
      </div>
    </article>
  )
}

export default function MyBookingsPage() {
  const { locale, t } = useI18n()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState(
    addDaysToDateInput(todayInTimeZone(), 1),
  )
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([])
  const [rescheduleStart, setRescheduleStart] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const result = await getMyBookings()
      setBookings(result)
    } catch {
      setError(t('Nu am putut încărca vizitele. Încearcă din nou.'))
    } finally {
      setLoading(false)
    }
  }, [session, t])

  useEffect(() => {
    let alive = true
    Promise.all([getSession(), getPublicConfig()])
      .then(([currentSession, publicConfig]) => {
        if (!alive) return
        setSession(currentSession)
        setConfig(publicConfig)
      })
      .catch(() => setError(t('Serviciul nu este disponibil momentan.')))
      .finally(() => {
        if (alive) setSessionLoading(false)
      })
    const unsubscribe = subscribeToAuth((next) => setSession(next))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!rescheduleTarget || !config) return
    let alive = true
    setActionBusy(true)
    setRescheduleStart('')
    getRescheduleSlots(rescheduleDate, rescheduleTarget.id)
      .then((result) => {
        if (alive) setRescheduleSlots(result)
      })
      .catch(() => {
        if (alive) setError(t('Nu am putut încărca orele pentru mutare.'))
      })
      .finally(() => {
        if (alive) setActionBusy(false)
      })
    return () => {
      alive = false
    }
  }, [config, rescheduleDate, rescheduleTarget, t])

  const upcoming = useMemo(
    () =>
      bookings
        .filter(
          (item) =>
            item.status === 'confirmed' &&
            new Date(item.endsAt).getTime() >= Date.now(),
        )
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [bookings],
  )
  const history = useMemo(
    () =>
      bookings
        .filter((item) => !upcoming.some((future) => future.id === item.id))
        .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt)),
    [bookings, upcoming],
  )

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setActionBusy(true)
    setError('')
    try {
      await cancelBooking(
        cancelTarget.id,
        cancelTarget.version,
        crypto.randomUUID(),
      )
      setCancelTarget(null)
      await load()
    } catch {
      setError(
        t(
          'Vizita nu a putut fi anulată. Este posibil să fi fost modificată între timp.',
        ),
      )
    } finally {
      setActionBusy(false)
    }
  }

  const confirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleStart) return
    setActionBusy(true)
    setError('')
    try {
      await rescheduleBooking(
        rescheduleTarget.id,
        rescheduleStart,
        rescheduleTarget.version,
        crypto.randomUUID(),
      )
      setRescheduleTarget(null)
      await load()
    } catch {
      setError(
        t('Ora nu mai este disponibilă. Vizita inițială a rămas neschimbată.'),
      )
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="app-shell app-shell--light">
      <AppHeader />
      <main className="account-page">
        {sessionLoading || !config ? (
          <LoadingState label={t('Verificăm accesul…')} />
        ) : !isSupabaseConfigured ? (
          <div className="account-page__auth">
            <Notice tone="warning">
              {t(
                'Contul de client devine activ după conectarea proiectului Supabase. Programarea publică poate fi previzualizată pe pagina principală.',
              )}
            </Notice>
            <Link className="button button--primary" to="/">
              <ArrowLeft aria-hidden="true" />{' '}
              <span>{t('Înapoi la programare')}</span>
            </Link>
          </div>
        ) : !session ? (
          <PhoneAuth onAuthenticated={setSession} />
        ) : (
          <div className="account-content">
            <div className="account-heading">
              <div>
                <SectionLabel>{t('Contul meu')}</SectionLabel>
                <h1>{t('Vizitele mele')}</h1>
                <p>{session.user.phone}</p>
              </div>
              <Button
                variant="ghost"
                type="button"
                icon={LogOut}
                onClick={() => void signOut()}
              >
                {t('Ieși')}
              </Button>
            </div>

            <div
              className="account-tabs"
              role="tablist"
              aria-label={t('Tipul vizitelor')}
            >
              <button
                className={tab === 'upcoming' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={tab === 'upcoming'}
                onClick={() => setTab('upcoming')}
              >
                {t('Următoarele')} <span>{upcoming.length}</span>
              </button>
              <button
                className={tab === 'history' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={tab === 'history'}
                onClick={() => setTab('history')}
              >
                {t('Istoric')} <span>{history.length}</span>
              </button>
            </div>

            {error ? <Notice tone="error">{error}</Notice> : null}
            {loading ? (
              <LoadingState label={t('Încărcăm vizitele…')} />
            ) : (tab === 'upcoming' ? upcoming : history).length ? (
              <div className="booking-list">
                {(tab === 'upcoming' ? upcoming : history).map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    config={config}
                    onCancel={setCancelTarget}
                    onReschedule={(target) => {
                      setRescheduleDate(
                        addDaysToDateInput(todayInTimeZone(), 1),
                      )
                      setRescheduleTarget(target)
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={
                  tab === 'upcoming'
                    ? t('Nu ai vizite viitoare.')
                    : t('Istoricul este gol.')
                }
                text={
                  tab === 'upcoming'
                    ? t(
                        'Alege serviciul și o oră liberă — durează doar câteva minute.',
                      )
                    : t('Vizitele finalizate și anulate vor apărea aici.')
                }
                action={
                  tab === 'upcoming' ? (
                    <Link className="button button--primary" to="/">
                      <Scissors aria-hidden="true" />{' '}
                      <span>{t('Fă o programare')}</span>
                    </Link>
                  ) : undefined
                }
              />
            )}
          </div>
        )}
      </main>

      <Modal
        open={Boolean(cancelTarget)}
        title={t('Anulezi această vizită?')}
        onClose={() => setCancelTarget(null)}
      >
        {cancelTarget ? (
          <div className="modal-content">
            <p>
              {t('{service}, {date} la {time}.', {
                service: cancelTarget.serviceName,
                date: formatLongDate(
                  cancelTarget.startsAt,
                  config?.settings.timezone,
                  locale,
                ),
                time: formatTime(
                  cancelTarget.startsAt,
                  config?.settings.timezone,
                  locale,
                ),
              })}
            </p>
            <Notice tone="warning">
              {t('Ora va deveni disponibilă imediat pentru alt client.')}
            </Notice>
            <div className="modal-actions">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setCancelTarget(null)}
              >
                {t('Păstrează vizita')}
              </Button>
              <Button
                variant="danger"
                type="button"
                busy={actionBusy}
                onClick={confirmCancel}
              >
                {t('Da, anulează')}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(rescheduleTarget)}
        title={t('Mută vizita')}
        onClose={() => setRescheduleTarget(null)}
      >
        <div className="modal-content">
          <Field
            label={t('Noua dată')}
            type="date"
            min={todayInTimeZone()}
            max={addDaysToDateInput(
              todayInTimeZone(),
              config?.settings.bookingHorizonDays ?? 30,
            )}
            value={rescheduleDate}
            onChange={(event) => setRescheduleDate(event.target.value)}
          />
          {actionBusy && !rescheduleSlots.length ? (
            <LoadingState label={t('Verificăm orele…')} />
          ) : rescheduleSlots.length ? (
            <div className="slot-grid slot-grid--modal">
              {rescheduleSlots.map((slot) => (
                <label
                  className={`slot-option ${rescheduleStart === slot.startsAt ? 'is-selected' : ''}`}
                  key={slot.startsAt}
                >
                  <input
                    type="radio"
                    name="new-slot"
                    checked={rescheduleStart === slot.startsAt}
                    onChange={() => setRescheduleStart(slot.startsAt)}
                  />
                  {formatTime(slot.startsAt, config?.settings.timezone, locale)}
                </label>
              ))}
            </div>
          ) : (
            <Notice tone="info">
              {t('Nu sunt ore libere în această zi.')}
            </Notice>
          )}
          <div className="modal-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setRescheduleTarget(null)}
            >
              {t('Renunță')}
            </Button>
            <Button
              type="button"
              busy={actionBusy}
              disabled={!rescheduleStart}
              onClick={confirmReschedule}
              icon={CalendarClock}
            >
              {t('Confirmă ora nouă')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
