import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AppError,
  createBooking,
  getAvailableSlots,
  getSession,
  requestPhoneCode,
  verifyPhoneCode,
} from '../../shared/api/barber-api'
import {
  addDaysToDateInput,
  formatLongDate,
  formatMoney,
  formatTime,
  getBookableDates,
  todayInTimeZone,
} from '../../shared/lib/format'
import type { Booking, PublicConfig, TimeSlot } from '../../shared/model/types'
import {
  Button,
  Field,
  LoadingState,
  Notice,
  StepIndicator,
} from '../../shared/ui/ui'

type BookingFlowProps = {
  config: PublicConfig
}

function dateParts(date: string) {
  const value = new Date(`${date}T12:00:00`)
  return {
    weekday: new Intl.DateTimeFormat('ro-RO', { weekday: 'short' })
      .format(value)
      .replace('.', ''),
    day: new Intl.DateTimeFormat('ro-RO', { day: '2-digit' }).format(value),
    month: new Intl.DateTimeFormat('ro-RO', { month: 'short' })
      .format(value)
      .replace('.', ''),
  }
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message === 'SUPABASE_NOT_CONFIGURED') {
    return 'Programarea este în modul demonstrativ. Conectează Supabase pentru confirmări reale.'
  }
  if (error instanceof AppError) {
    const messages: Record<string, string> = {
      DEMO_MODE:
        'Programarea este în modul demonstrativ. Conectează Supabase pentru confirmări reale.',
      SLOT_TAKEN:
        'Ora tocmai a fost ocupată. Am actualizat programul — alege alta.',
      TOO_EARLY:
        'Această oră este prea apropiată. Alege un interval mai târziu.',
      BOOKING_LIMIT: 'Ai deja numărul maxim de programări viitoare.',
      PHONE_REQUIRED: 'Confirmă numărul de telefon pentru a continua.',
    }
    return (
      messages[error.code] ??
      'Nu am putut finaliza cererea. Verifică datele și încearcă din nou.'
    )
  }
  return 'A apărut o problemă temporară. Încearcă din nou.'
}

export function BookingFlow({ config }: BookingFlowProps) {
  const dates = useMemo(
    () => getBookableDates(7, config.settings.timezone),
    [config.settings.timezone],
  )
  const [step, setStep] = useState(1)
  const [serviceId, setServiceId] = useState(config.services[0]?.id ?? '')
  const [date, setDate] = useState(
    dates[0] ?? todayInTimeZone(config.settings.timezone),
  )
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [startsAt, setStartsAt] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null)
  const [authKnown, setAuthKnown] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState<Booking | null>(null)

  const service =
    config.services.find((item) => item.id === serviceId) ?? config.services[0]
  const selectedSlot = slots.find((slot) => slot.startsAt === startsAt)
  const maxDate = addDaysToDateInput(
    dates[0] ?? todayInTimeZone(config.settings.timezone),
    config.settings.bookingHorizonDays,
  )

  useEffect(() => {
    let alive = true
    getSession()
      .then((session) => {
        if (!alive) return
        if (session?.user.phone) {
          setVerifiedPhone(session.user.phone)
          setPhone(session.user.phone)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setAuthKnown(true)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (step !== 3 || !service) return
    let alive = true
    setLoadingSlots(true)
    setError('')
    setStartsAt('')
    getAvailableSlots(date, service)
      .then((result) => {
        if (alive) setSlots(result)
      })
      .catch((caught) => {
        if (alive) setError(readableError(caught))
      })
      .finally(() => {
        if (alive) setLoadingSlots(false)
      })
    return () => {
      alive = false
    }
  }, [date, service, step])

  const goBack = () => {
    setError('')
    setCodeSent(false)
    setOtp('')
    setStep((value) => Math.max(1, value - 1))
  }

  const sendCode = async () => {
    const normalized = phone.replace(/[\s()-]/g, '')
    if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
      setError(
        'Scrie numărul complet, inclusiv prefixul de țară, de exemplu +40.',
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await requestPhoneCode(normalized)
      setPhone(normalized)
      setCodeSent(true)
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy(false)
    }
  }

  const saveBooking = async () => {
    if (!service || !selectedSlot || name.trim().length < 2) {
      setError('Completează numele și păstrează ora selectată.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await createBooking({
        serviceId: service.id,
        startsAt: selectedSlot.startsAt,
        clientName: name.trim(),
        requestId: crypto.randomUUID(),
      })
      setCompleted(result)
    } catch (caught) {
      setError(readableError(caught))
      if (caught instanceof AppError && caught.code === 'SLOT_TAKEN') {
        setStep(3)
        setSlots(await getAvailableSlots(date, service))
      }
    } finally {
      setBusy(false)
    }
  }

  const verifyAndSave = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Codul conține 6 cifre.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const session = await verifyPhoneCode(phone, otp)
      setVerifiedPhone(session?.user.phone ?? phone)
      await saveBooking()
    } catch (caught) {
      setError(readableError(caught))
      setBusy(false)
    }
  }

  if (completed && service) {
    return (
      <div className="booking-success" aria-live="polite">
        <span className="booking-success__icon">
          <Check aria-hidden="true" />
        </span>
        <p className="eyebrow">Programare confirmată</p>
        <h2>
          Ne vedem{' '}
          {formatLongDate(completed.startsAt, config.settings.timezone)}.
        </h2>
        <div className="summary-card">
          <div>
            <span>Ora</span>
            <strong>
              {formatTime(completed.startsAt, config.settings.timezone)}
            </strong>
          </div>
          <div>
            <span>Serviciu</span>
            <strong>{completed.serviceName}</strong>
          </div>
          <div>
            <span>Preț</span>
            <strong>
              {formatMoney(completed.priceMinor, completed.currency)}
            </strong>
          </div>
        </div>
        <p className="muted">
          Confirmarea este trimisă la {verifiedPhone ?? phone}.
        </p>
        <Link className="button button--primary" to="/my-bookings">
          <span>Vezi vizitele mele</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    )
  }

  if (!service) {
    return (
      <Notice tone="warning">
        Nu există încă servicii active. Frizerul trebuie să adauge cel puțin
        unul în setări.
      </Notice>
    )
  }

  if (!config.settings.bookingEnabled) {
    return (
      <div className="inline-empty">
        <CalendarDays aria-hidden="true" />
        <div>
          <strong>Programările online sunt oprite temporar.</strong>
          <span>Revino mai târziu sau contactează frizerul direct.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="booking-flow">
      <div className="booking-flow__top">
        <div>
          <p className="eyebrow">Rezervă online</p>
          <h2>Alege timpul potrivit.</h2>
        </div>
        <p className="booking-flow__timezone">
          <Clock3 aria-hidden="true" /> Ora României
        </p>
      </div>

      {config.demo ? (
        <Notice tone="warning">
          <strong>Mod demonstrativ.</strong> Poți parcurge alegerea serviciului
          și a orei; confirmarea devine activă după conectarea Supabase.
        </Notice>
      ) : null}

      <StepIndicator current={step} />

      <div className="booking-stage" aria-live="polite">
        {step === 1 ? (
          <div>
            <div className="stage-heading">
              <span>01</span>
              <div>
                <h3>Ce alegi?</h3>
                <p>Durata este rezervată integral pentru tine.</p>
              </div>
            </div>
            <div
              className="service-list"
              role="radiogroup"
              aria-label="Serviciu"
            >
              {config.services.map((item) => (
                <label
                  className={`service-option ${serviceId === item.id ? 'is-selected' : ''}`}
                  key={item.id}
                >
                  <input
                    type="radio"
                    name="service"
                    value={item.id}
                    checked={serviceId === item.id}
                    onChange={() => setServiceId(item.id)}
                  />
                  <span className="service-option__check">
                    <Check aria-hidden="true" />
                  </span>
                  <span className="service-option__main">
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="service-option__meta">
                    <strong>
                      {formatMoney(item.priceMinor, item.currency)}
                    </strong>
                    <small>{item.durationMinutes} min</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <div className="stage-heading">
              <span>02</span>
              <div>
                <h3>În ce zi?</h3>
                <p>
                  Poți rezerva cu până la {config.settings.bookingHorizonDays}{' '}
                  de zile înainte.
                </p>
              </div>
            </div>
            <div
              className="date-grid"
              role="radiogroup"
              aria-label="Data programării"
            >
              {dates.map((item) => {
                const parts = dateParts(item)
                return (
                  <label
                    className={`date-option ${date === item ? 'is-selected' : ''}`}
                    key={item}
                  >
                    <input
                      type="radio"
                      name="date"
                      value={item}
                      checked={date === item}
                      onChange={() => setDate(item)}
                    />
                    <small>{parts.weekday}</small>
                    <strong>{parts.day}</strong>
                    <span>{parts.month}</span>
                  </label>
                )
              })}
            </div>
            <Field
              className="date-picker"
              label="Altă dată"
              type="date"
              min={dates[0]}
              max={maxDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <div className="stage-heading">
              <span>03</span>
              <div>
                <h3>La ce oră?</h3>
                <p>
                  {formatLongDate(`${date}T12:00:00`, config.settings.timezone)}
                </p>
              </div>
            </div>
            {loadingSlots ? (
              <LoadingState label="Verificăm orele libere…" />
            ) : slots.length ? (
              <div
                className="slot-grid"
                role="radiogroup"
                aria-label="Ora programării"
              >
                {slots.map((slot) => (
                  <label
                    className={`slot-option ${startsAt === slot.startsAt ? 'is-selected' : ''}`}
                    key={slot.startsAt}
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={slot.startsAt}
                      checked={startsAt === slot.startsAt}
                      onChange={() => setStartsAt(slot.startsAt)}
                    />
                    {formatTime(slot.startsAt, config.settings.timezone)}
                  </label>
                ))}
              </div>
            ) : (
              <div className="inline-empty">
                <CalendarDays aria-hidden="true" />
                <div>
                  <strong>Nicio oră liberă în această zi.</strong>
                  <span>Alege o altă dată pentru a continua.</span>
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setStep(2)}
                >
                  Schimbă data
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <div className="stage-heading">
              <span>04</span>
              <div>
                <h3>Confirmă programarea.</h3>
                <p>
                  Numărul este folosit pentru cod și notificări despre vizită.
                </p>
              </div>
            </div>

            <div className="booking-confirm-layout">
              <div className="booking-form">
                <Field
                  label="Numele tău"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Cum să te trecem în programare"
                  disabled={busy}
                />

                {!verifiedPhone ? (
                  <>
                    <Field
                      label="Telefon"
                      autoComplete="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+40 7xx xxx xxx"
                      disabled={busy || codeSent}
                      hint="Include prefixul de țară."
                    />
                    {codeSent ? (
                      <div className="otp-row">
                        <Field
                          label="Codul SMS"
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          maxLength={6}
                          value={otp}
                          onChange={(event) =>
                            setOtp(event.target.value.replace(/\D/g, ''))
                          }
                          placeholder="000000"
                          disabled={busy}
                        />
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => {
                            setCodeSent(false)
                            setOtp('')
                          }}
                        >
                          Schimbă numărul
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Notice tone="success">
                    <strong>Telefon confirmat:</strong> {verifiedPhone}
                  </Notice>
                )}
              </div>

              <aside className="summary-card summary-card--vertical">
                <div>
                  <span>Serviciu</span>
                  <strong>{service.name}</strong>
                  <small>{service.durationMinutes} min</small>
                </div>
                <div>
                  <span>Data și ora</span>
                  <strong>
                    {selectedSlot ? formatLongDate(selectedSlot.startsAt) : '—'}
                  </strong>
                  <small>
                    {selectedSlot ? formatTime(selectedSlot.startsAt) : ''}
                  </small>
                </div>
                <div>
                  <span>Total la locație</span>
                  <strong>
                    {formatMoney(service.priceMinor, service.currency)}
                  </strong>
                  <small>Fără plată online</small>
                </div>
              </aside>
            </div>

            <p className="consent-copy">
              Continuând, accepți regulile de programare și folosirea datelor
              doar pentru gestionarea vizitei.
            </p>
          </div>
        ) : null}
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="booking-actions">
        {step > 1 ? (
          <Button
            variant="ghost"
            type="button"
            onClick={goBack}
            disabled={busy}
            icon={ArrowLeft}
          >
            Înapoi
          </Button>
        ) : (
          <span />
        )}

        {step < 4 ? (
          <Button
            type="button"
            onClick={() => setStep((value) => Math.min(4, value + 1))}
            disabled={(step === 1 && !serviceId) || (step === 3 && !startsAt)}
            icon={ArrowRight}
          >
            Continuă
          </Button>
        ) : !authKnown ? (
          <Button busy disabled>
            Verificare sesiune
          </Button>
        ) : verifiedPhone ? (
          <Button
            type="button"
            busy={busy}
            onClick={saveBooking}
            icon={ShieldCheck}
          >
            Confirmă programarea
          </Button>
        ) : codeSent ? (
          <Button
            type="button"
            busy={busy}
            onClick={verifyAndSave}
            icon={ShieldCheck}
          >
            Verifică și confirmă
          </Button>
        ) : (
          <Button
            type="button"
            busy={busy}
            onClick={sendCode}
            icon={ArrowRight}
          >
            Trimite codul
          </Button>
        )}
      </div>
    </div>
  )
}
