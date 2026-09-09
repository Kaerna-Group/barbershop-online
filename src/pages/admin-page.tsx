import {
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Clock3,
  LogOut,
  Plus,
  Save,
  Scissors,
  Settings2,
  UserRoundPlus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  adminCreateBlock,
  adminCreateBooking,
  adminRescheduleBooking,
  adminSavePublicProfile,
  adminSaveScheduleOverride,
  adminSaveService,
  adminSaveSettings,
  adminSetBookingStatus,
  getAdminCalendar,
  getAvailableSlots,
  getPublicConfig,
  getRescheduleSlots,
  getSession,
  getWeeklySchedule,
  isCurrentUserMaster,
  isSupabaseConfigured,
  saveWeeklySchedule,
  signOut,
} from '../shared/api/barber-api'
import { fallbackConfig } from '../shared/data/fallback'
import {
  addDaysToDateInput,
  formatLongDate,
  formatTime,
  statusLabel,
  todayInTimeZone,
} from '../shared/lib/format'
import { useI18n, type Translate } from '../shared/i18n-context'
import type {
  Booking,
  CalendarEntry,
  PublicConfig,
  Service,
  TimeSlot,
  WeeklyWindow,
} from '../shared/model/types'
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

type AdminTab = 'bookings' | 'schedule' | 'settings'

function getDayNames(locale: string) {
  return Array.from({ length: 7 }, (_, weekday) => {
    const label = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 7 + weekday)))
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
  })
}

function demoEntries(
  date: string,
  service: Service,
  t: Translate,
): CalendarEntry[] {
  const start = new Date(`${date}T10:00:00+03:00`)
  const secondStart = new Date(`${date}T12:30:00+03:00`)
  return [
    {
      id: 'demo-booking-1',
      kind: 'booking',
      serviceId: service.id,
      startsAt: start.toISOString(),
      endsAt: new Date(
        start.getTime() + service.durationMinutes * 60_000,
      ).toISOString(),
      status: 'confirmed',
      clientName: t('Client demonstrativ'),
      clientPhone: '+40 ••• ••• 112',
      serviceName: service.name,
      priceMinor: service.priceMinor,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      version: 1,
      notificationState: 'sent',
      createdByMaster: false,
    },
    {
      id: 'demo-block-1',
      kind: 'block',
      serviceId: '',
      startsAt: secondStart.toISOString(),
      endsAt: new Date(secondStart.getTime() + 30 * 60_000).toISOString(),
      status: 'confirmed',
      clientName: '',
      clientPhone: '',
      serviceName: t('Pauză'),
      priceMinor: 0,
      currency: 'RON',
      durationMinutes: 30,
      version: 1,
      note: t('Pauză personală'),
    },
  ]
}

function AdminBookings({
  config,
  demo,
}: {
  config: PublicConfig
  demo: boolean
}) {
  const { locale, t } = useI18n()
  const [date, setDate] = useState(todayInTimeZone())
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState<CalendarEntry | null>(null)
  const [moveDate, setMoveDate] = useState(date)
  const [moveSlots, setMoveSlots] = useState<TimeSlot[]>([])
  const [moveStart, setMoveStart] = useState('')
  const [serviceId, setServiceId] = useState(config.services[0]?.id ?? '')
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [slot, setSlot] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [blockStart, setBlockStart] = useState('12:00')
  const [blockEnd, setBlockEnd] = useState('12:30')
  const [blockNote, setBlockNote] = useState('Pauză')
  const [actionBusy, setActionBusy] = useState(false)

  const selectedService = config.services.find((item) => item.id === serviceId)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setEntries(
        demo
          ? demoEntries(
              date,
              config.services[0] ?? fallbackConfig.services[0],
              t,
            )
          : await getAdminCalendar(date, date),
      )
    } catch {
      setError(t('Calendarul nu a putut fi încărcat.'))
    } finally {
      setLoading(false)
    }
  }, [config.services, date, demo, t])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  useEffect(() => {
    if (!manualOpen || !selectedService) return
    setActionBusy(true)
    getAvailableSlots(date, selectedService)
      .then((result) => {
        setSlots(result)
        setSlot('')
      })
      .catch(() => setError(t('Orele libere nu au putut fi încărcate.')))
      .finally(() => setActionBusy(false))
  }, [date, manualOpen, selectedService, t])

  useEffect(() => {
    if (!moveTarget || demo) return
    setActionBusy(true)
    setMoveStart('')
    getRescheduleSlots(moveDate, moveTarget.id)
      .then(setMoveSlots)
      .catch(() => setError(t('Orele pentru mutare nu au putut fi încărcate.')))
      .finally(() => setActionBusy(false))
  }, [demo, moveDate, moveTarget, t])

  const updateStatus = async (
    booking: CalendarEntry,
    status: Booking['status'],
  ) => {
    if (demo) {
      setNotice(t('În modul demo modificările nu sunt salvate.'))
      return
    }
    setActionBusy(true)
    setError('')
    try {
      await adminSetBookingStatus(booking.id, status, booking.version)
      await loadEntries()
    } catch {
      setError(t('Starea nu a putut fi actualizată. Reîncarcă programările.'))
    } finally {
      setActionBusy(false)
    }
  }

  const createManual = async () => {
    if (
      !selectedService ||
      !slot ||
      clientName.trim().length < 2 ||
      !clientPhone.trim()
    ) {
      setError(t('Completează serviciul, ora, numele și telefonul.'))
      return
    }
    if (demo) {
      setManualOpen(false)
      setNotice(
        t(
          'Formularul este funcțional; salvarea devine activă după conectarea bazei.',
        ),
      )
      return
    }
    setActionBusy(true)
    try {
      await adminCreateBooking({
        serviceId: selectedService.id,
        startsAt: slot,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        requestId: crypto.randomUUID(),
      })
      setManualOpen(false)
      setClientName('')
      setClientPhone('')
      await loadEntries()
    } catch {
      setError(
        t('Programarea nu a fost salvată. Verifică dacă ora este încă liberă.'),
      )
    } finally {
      setActionBusy(false)
    }
  }

  const createBlock = async () => {
    if (blockStart >= blockEnd) {
      setError(t('Ora de final trebuie să fie după ora de început.'))
      return
    }
    if (demo) {
      setBlockOpen(false)
      setNotice(t('Blocarea se va salva după conectarea bazei.'))
      return
    }
    setActionBusy(true)
    try {
      await adminCreateBlock({
        day: date,
        start: blockStart,
        end: blockEnd,
        note: blockNote,
        requestId: crypto.randomUUID(),
      })
      setBlockOpen(false)
      await loadEntries()
    } catch {
      setError(
        t(
          'Intervalul nu poate fi blocat; verifică programul și suprapunerile.',
        ),
      )
    } finally {
      setActionBusy(false)
    }
  }

  const moveBooking = async () => {
    if (!moveTarget || !moveStart) return
    if (demo) {
      setMoveTarget(null)
      setNotice(t('Mutarea este disponibilă după conectarea bazei.'))
      return
    }
    setActionBusy(true)
    setError('')
    try {
      await adminRescheduleBooking(moveTarget.id, moveStart, moveTarget.version)
      setMoveTarget(null)
      await loadEntries()
    } catch {
      setError(
        t('Ora nu mai este liberă; vizita inițială a rămas neschimbată.'),
      )
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-section__heading">
        <div>
          <SectionLabel>{t('Calendar')}</SectionLabel>
          <h1>{t('Programările zilei')}</h1>
        </div>
        <div className="admin-heading-actions">
          <Button
            variant="secondary"
            type="button"
            icon={Ban}
            onClick={() => setBlockOpen(true)}
          >
            {t('Blochează timp')}
          </Button>
          <Button
            type="button"
            icon={UserRoundPlus}
            onClick={() => setManualOpen(true)}
          >
            {t('Programare manuală')}
          </Button>
        </div>
      </div>

      <div className="date-toolbar">
        <button
          className="icon-button"
          type="button"
          aria-label={t('Ziua anterioară')}
          onClick={() => setDate(addDaysToDateInput(date, -1))}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <label>
          <CalendarDays aria-hidden="true" />
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <strong>
            {formatLongDate(
              `${date}T12:00:00`,
              config.settings.timezone,
              locale,
            )}
          </strong>
        </label>
        <button
          className="icon-button"
          type="button"
          aria-label={t('Ziua următoare')}
          onClick={() => setDate(addDaysToDateInput(date, 1))}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      {notice ? <Notice tone="info">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {loading ? (
        <LoadingState label={t('Încărcăm ziua…')} />
      ) : entries.length ? (
        <div className="day-timeline">
          {entries.map((entry) => (
            <article
              className={`timeline-entry timeline-entry--${entry.kind}`}
              key={entry.id}
            >
              <time>
                {formatTime(entry.startsAt, config.settings.timezone, locale)}
              </time>
              <span className="timeline-entry__rule" />
              <div className="timeline-entry__card">
                <div>
                  <span className="timeline-entry__duration">
                    {entry.durationMinutes} min
                  </span>
                  <h3>
                    {entry.kind === 'block'
                      ? entry.note || t('Timp blocat')
                      : entry.clientName}
                  </h3>
                  <p>
                    {entry.kind === 'booking'
                      ? `${entry.serviceName} · ${entry.clientPhone}`
                      : `${formatTime(
                          entry.startsAt,
                          config.settings.timezone,
                          locale,
                        )}–${formatTime(
                          entry.endsAt,
                          config.settings.timezone,
                          locale,
                        )}`}
                  </p>
                </div>
                {entry.kind === 'booking' ? (
                  <div className="timeline-entry__status">
                    <span
                      className={`status-pill status-pill--${entry.status}`}
                    >
                      {t(statusLabel(entry.status))}
                    </span>
                    {entry.status === 'confirmed' ? (
                      <div className="entry-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setMoveDate(date)
                            setMoveSlots([])
                            setMoveTarget(entry)
                          }}
                          disabled={actionBusy}
                        >
                          {t('Mută')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateStatus(entry, 'completed')}
                          disabled={actionBusy}
                        >
                          <CheckCircle2 aria-hidden="true" /> {t('Finalizată')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateStatus(entry, 'no_show')}
                          disabled={actionBusy}
                        >
                          <CircleOff aria-hidden="true" /> {t('Nu a venit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateStatus(entry, 'cancelled')}
                          disabled={actionBusy}
                        >
                          {t('Anulează')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={t('Zi liberă, deocamdată.')}
          text={t('Nu există programări sau blocări pentru data aleasă.')}
          action={
            <Button
              type="button"
              icon={Plus}
              onClick={() => setManualOpen(true)}
            >
              {t('Adaugă o programare')}
            </Button>
          }
        />
      )}

      <Modal
        open={manualOpen}
        title={t('Programare manuală')}
        onClose={() => setManualOpen(false)}
      >
        <div className="modal-content">
          <label className="field">
            <span className="field__label">{t('Serviciu')}</span>
            <select
              className="field__input"
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
            >
              {config.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.durationMinutes} min
                </option>
              ))}
            </select>
          </label>
          <div className="slot-grid slot-grid--modal">
            {slots.map((item) => (
              <label
                className={`slot-option ${slot === item.startsAt ? 'is-selected' : ''}`}
                key={item.startsAt}
              >
                <input
                  type="radio"
                  name="manual-slot"
                  checked={slot === item.startsAt}
                  onChange={() => setSlot(item.startsAt)}
                />
                {formatTime(item.startsAt, config.settings.timezone, locale)}
              </label>
            ))}
          </div>
          <div className="form-grid">
            <Field
              label={t('Nume client')}
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
            />
            <Field
              label={t('Telefon')}
              type="tel"
              value={clientPhone}
              onChange={(event) => setClientPhone(event.target.value)}
            />
          </div>
          <div className="modal-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setManualOpen(false)}
            >
              {t('Renunță')}
            </Button>
            <Button
              type="button"
              busy={actionBusy}
              onClick={createManual}
              icon={Plus}
            >
              {t('Adaugă programarea')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={blockOpen}
        title={t('Blochează un interval')}
        onClose={() => setBlockOpen(false)}
      >
        <div className="modal-content">
          <p className="muted">
            {t('Data')}:&nbsp;
            {formatLongDate(
              `${date}T12:00:00`,
              config.settings.timezone,
              locale,
            )}
          </p>
          <div className="form-grid">
            <Field
              label={t('De la')}
              type="time"
              value={blockStart}
              onChange={(event) => setBlockStart(event.target.value)}
            />
            <Field
              label={t('Până la')}
              type="time"
              value={blockEnd}
              onChange={(event) => setBlockEnd(event.target.value)}
            />
          </div>
          <Field
            label={t('Motiv intern')}
            value={blockNote}
            onChange={(event) => setBlockNote(event.target.value)}
          />
          <div className="modal-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setBlockOpen(false)}
            >
              {t('Renunță')}
            </Button>
            <Button
              type="button"
              busy={actionBusy}
              onClick={createBlock}
              icon={Ban}
            >
              {t('Blochează timpul')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(moveTarget)}
        title={t('Mută programarea')}
        onClose={() => setMoveTarget(null)}
      >
        <div className="modal-content">
          <Field
            label={t('Noua dată')}
            type="date"
            value={moveDate}
            onChange={(event) => setMoveDate(event.target.value)}
          />
          {demo ? (
            <Notice tone="info">
              {t('În modul demo, mutarea nu este salvată.')}
            </Notice>
          ) : actionBusy && !moveSlots.length ? (
            <LoadingState label={t('Verificăm orele…')} />
          ) : moveSlots.length ? (
            <div className="slot-grid slot-grid--modal">
              {moveSlots.map((item) => (
                <label
                  className={`slot-option ${moveStart === item.startsAt ? 'is-selected' : ''}`}
                  key={item.startsAt}
                >
                  <input
                    type="radio"
                    name="admin-move-slot"
                    checked={moveStart === item.startsAt}
                    onChange={() => setMoveStart(item.startsAt)}
                  />
                  {formatTime(item.startsAt, config.settings.timezone, locale)}
                </label>
              ))}
            </div>
          ) : (
            <Notice tone="info">
              {t('Nu sunt ore disponibile în această zi.')}
            </Notice>
          )}
          <div className="modal-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setMoveTarget(null)}
            >
              {t('Renunță')}
            </Button>
            <Button
              type="button"
              busy={actionBusy}
              disabled={!demo && !moveStart}
              onClick={moveBooking}
            >
              {t('Confirmă mutarea')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function AdminSchedule({ demo }: { demo: boolean }) {
  const { locale, t } = useI18n()
  const dayNames = useMemo(() => getDayNames(locale), [locale])
  const [windows, setWindows] = useState<WeeklyWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [overrideDate, setOverrideDate] = useState(todayInTimeZone())
  const [overrideClosed, setOverrideClosed] = useState(true)
  const [overrideStart, setOverrideStart] = useState('09:00')
  const [overrideEnd, setOverrideEnd] = useState('14:00')

  useEffect(() => {
    getWeeklySchedule()
      .then(setWindows)
      .catch(() => setError(t('Programul săptămânal nu a putut fi încărcat.')))
      .finally(() => setLoading(false))
  }, [t])

  const updateWindow = (
    index: number,
    field: 'start' | 'end',
    value: string,
  ) => {
    setWindows((current) =>
      current.map((window, windowIndex) =>
        windowIndex === index ? { ...window, [field]: value } : window,
      ),
    )
  }

  const addWindow = (weekday: number) => {
    setWindows((current) => [
      ...current,
      { weekday, start: '09:00', end: '18:00' },
    ])
  }

  const removeWindow = (index: number) => {
    setWindows((current) =>
      current.filter((_, windowIndex) => windowIndex !== index),
    )
  }

  const save = async () => {
    if (windows.some((window) => window.start >= window.end)) {
      setError(t('Fiecare interval trebuie să aibă finalul după început.'))
      return
    }
    if (demo) {
      setMessage(t('Programul este corect; în modul demo nu este salvat.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveWeeklySchedule(windows)
      setMessage(t('Programul săptămânal a fost salvat.'))
    } catch {
      setError(t('Programul nu a putut fi salvat. Verifică intervalele.'))
    } finally {
      setBusy(false)
    }
  }

  const saveOverride = async () => {
    if (!overrideClosed && overrideStart >= overrideEnd) {
      setError(t('Intervalul special nu este valid.'))
      return
    }
    if (demo) {
      setMessage(t('Excepția este pregătită; în modul demo nu este salvată.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await adminSaveScheduleOverride(
        overrideDate,
        overrideClosed ? [] : [{ start: overrideStart, end: overrideEnd }],
      )
      setMessage(
        t(
          'Excepția a fost salvată. Programările existente nu au fost modificate.',
        ),
      )
    } catch {
      setError(t('Excepția intră în conflict cu o programare existentă.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label={t('Încărcăm programul…')} />

  return (
    <section className="admin-section">
      <div className="admin-section__heading">
        <div>
          <SectionLabel>{t('Disponibilitate')}</SectionLabel>
          <h1>{t('Program de lucru')}</h1>
        </div>
        <Button type="button" busy={busy} icon={Save} onClick={save}>
          {t('Salvează programul')}
        </Button>
      </div>
      <p className="section-intro">
        {t(
          'Poți adăuga două intervale în aceeași zi pentru a păstra automat o pauză între ele.',
        )}
      </p>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="weekly-editor">
        {dayNames.map((day, weekday) => {
          const dayWindows = windows
            .map((window, index) => ({ window, index }))
            .filter((item) => item.window.weekday === weekday)
          return (
            <div className="weekday-row" key={day}>
              <div className="weekday-row__day">
                <strong>{day}</strong>
                <span>{t(dayWindows.length ? 'Lucrezi' : 'Liber')}</span>
              </div>
              <div className="weekday-row__windows">
                {dayWindows.map(({ window, index }) => (
                  <div className="window-editor" key={`${weekday}-${index}`}>
                    <input
                      aria-label={t('{day}, început', { day })}
                      type="time"
                      value={window.start}
                      onChange={(event) =>
                        updateWindow(index, 'start', event.target.value)
                      }
                    />
                    <span>—</span>
                    <input
                      aria-label={t('{day}, final', { day })}
                      type="time"
                      value={window.end}
                      onChange={(event) =>
                        updateWindow(index, 'end', event.target.value)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeWindow(index)}
                      aria-label={t('Șterge intervalul de {day}', { day })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="add-window"
                  type="button"
                  onClick={() => addWindow(weekday)}
                >
                  <Plus aria-hidden="true" /> {t('Adaugă interval')}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="override-card">
        <div>
          <SectionLabel>{t('Excepție')}</SectionLabel>
          <h2>{t('O zi diferită sau concediu')}</h2>
          <p>
            {t(
              'O excepție înlocuiește programul obișnuit doar pentru data aleasă.',
            )}
          </p>
        </div>
        <div className="override-form">
          <Field
            label={t('Data')}
            type="date"
            value={overrideDate}
            onChange={(event) => setOverrideDate(event.target.value)}
          />
          <label className="switch-row">
            <input
              type="checkbox"
              checked={overrideClosed}
              onChange={(event) => setOverrideClosed(event.target.checked)}
            />
            <span>
              <strong>{t('Zi închisă')}</strong>
              <small>{t('Nu se vor oferi ore noi.')}</small>
            </span>
          </label>
          {!overrideClosed ? (
            <div className="form-grid">
              <Field
                label={t('De la')}
                type="time"
                value={overrideStart}
                onChange={(event) => setOverrideStart(event.target.value)}
              />
              <Field
                label={t('Până la')}
                type="time"
                value={overrideEnd}
                onChange={(event) => setOverrideEnd(event.target.value)}
              />
            </div>
          ) : null}
          <Button
            variant="secondary"
            type="button"
            busy={busy}
            onClick={saveOverride}
            icon={CalendarDays}
          >
            {t('Salvează excepția')}
          </Button>
        </div>
      </div>
    </section>
  )
}

function AdminSettings({
  initialConfig,
  demo,
}: {
  initialConfig: PublicConfig
  demo: boolean
}) {
  const { t } = useI18n()
  const [config, setConfig] = useState(initialConfig)
  const [services, setServices] = useState(initialConfig.services)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const saveProfile = async () => {
    if (!config.profile.name.trim() || !config.profile.addressLine.trim()) {
      setError(t('Numele și adresa sunt obligatorii.'))
      return
    }
    if (demo) {
      setMessage(t('Datele sunt valide; în modul demo nu sunt salvate.'))
      return
    }
    setBusy(true)
    try {
      await Promise.all([
        adminSavePublicProfile(config.profile),
        adminSaveSettings(config.settings),
      ])
      setMessage(t('Datele publice și regulile au fost salvate.'))
    } catch {
      setError(t('Setările nu au putut fi salvate.'))
    } finally {
      setBusy(false)
    }
  }

  const saveService = async (service: Service, index: number) => {
    if (
      !service.name.trim() ||
      service.durationMinutes <= 0 ||
      service.priceMinor < 0
    ) {
      setError(t('Verifică numele, durata și prețul serviciului.'))
      return
    }
    if (demo) {
      setMessage(t('Serviciul este valid; în modul demo nu este salvat.'))
      return
    }
    setBusy(true)
    try {
      await adminSaveService(service)
      const latest = await getPublicConfig()
      setServices(latest.services)
      setConfig(latest)
      setMessage(t('Serviciul {number} a fost salvat.', { number: index + 1 }))
    } catch {
      setError(t('Serviciul nu a putut fi salvat.'))
    } finally {
      setBusy(false)
    }
  }

  const updateService = (index: number, patch: Partial<Service>) => {
    setServices((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    )
  }

  return (
    <section className="admin-section">
      <div className="admin-section__heading">
        <div>
          <SectionLabel>{t('Configurare')}</SectionLabel>
          <h1>{t('Setările programării')}</h1>
        </div>
        <Button type="button" busy={busy} icon={Save} onClick={saveProfile}>
          {t('Salvează setările')}
        </Button>
      </div>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="settings-grid">
        <article className="settings-card">
          <div className="settings-card__heading">
            <h2>{t('Date publice')}</h2>
            <p>{t('Apar pe pagina de programare și în confirmare.')}</p>
          </div>
          <div className="form-grid">
            <Field
              label={t('Numele afișat')}
              value={config.profile.name}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  profile: { ...current.profile, name: event.target.value },
                }))
              }
            />
            <Field
              label={t('Telefon afișat')}
              value={config.profile.phoneDisplay}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  profile: {
                    ...current.profile,
                    phoneDisplay: event.target.value,
                  },
                }))
              }
            />
          </div>
          <Field
            label={t('Descriere scurtă')}
            value={config.profile.shortIntro}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                profile: { ...current.profile, shortIntro: event.target.value },
              }))
            }
          />
          <Field
            label={t('Adresa completă')}
            value={config.profile.addressLine}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                profile: {
                  ...current.profile,
                  addressLine: event.target.value,
                },
              }))
            }
          />
          <div className="form-grid">
            <Field
              label={t('Telefon pentru apel (format +40…)')}
              value={config.profile.phoneHref ?? ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  profile: {
                    ...current.profile,
                    phoneHref: event.target.value || null,
                  },
                }))
              }
            />
            <Field
              label={t('Locul de primire (opțional)')}
              value={config.profile.venueLabel ?? ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  profile: {
                    ...current.profile,
                    venueLabel: event.target.value || null,
                  },
                }))
              }
            />
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-card__heading">
            <h2>{t('Reguli')}</h2>
            <p>{t('Se aplică automat programărilor făcute de client.')}</p>
          </div>
          <div className="rule-grid">
            <Field
              label={t('Pas ore (minute)')}
              type="number"
              min={5}
              max={120}
              value={config.settings.slotStepMinutes}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    slotStepMinutes: Number(event.target.value),
                  },
                }))
              }
            />
            <Field
              label={t('Minim înainte (ore)')}
              type="number"
              min={0}
              max={168}
              value={config.settings.minLeadHours}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    minLeadHours: Number(event.target.value),
                  },
                }))
              }
            />
            <Field
              label={t('Orizont (zile)')}
              type="number"
              min={1}
              max={365}
              value={config.settings.bookingHorizonDays}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    bookingHorizonDays: Number(event.target.value),
                  },
                }))
              }
            />
            <Field
              label={t('Modificări până la (ore)')}
              type="number"
              min={0}
              max={168}
              value={config.settings.changeCutoffHours}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    changeCutoffHours: Number(event.target.value),
                  },
                }))
              }
            />
            <Field
              label={t('Maximum vizite viitoare')}
              type="number"
              min={1}
              max={20}
              value={config.settings.maxFutureBookings}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    maxFutureBookings: Number(event.target.value),
                  },
                }))
              }
            />
            <Field
              label={t('Reminder înainte (ore)')}
              type="number"
              min={1}
              max={168}
              value={config.settings.reminderHours ?? ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    reminderHours: event.target.value
                      ? Number(event.target.value)
                      : null,
                  },
                }))
              }
            />
          </div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={config.settings.bookingEnabled}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    bookingEnabled: event.target.checked,
                  },
                }))
              }
            />
            <span>
              <strong>{t('Programarea online este activă')}</strong>
              <small>
                {t('Dezactivează temporar fără a șterge programul.')}
              </small>
            </span>
          </label>
        </article>
      </div>

      <div className="services-editor">
        <div className="services-editor__heading">
          <div>
            <SectionLabel>{t('Catalog')}</SectionLabel>
            <h2>{t('Servicii')}</h2>
          </div>
          <Button
            variant="secondary"
            type="button"
            icon={Plus}
            onClick={() =>
              setServices((current) => [
                ...current,
                {
                  id: '',
                  name: '',
                  description: '',
                  durationMinutes: 60,
                  priceMinor: 0,
                  currency: config.settings.currency,
                  active: true,
                  sortOrder: current.length + 1,
                },
              ])
            }
          >
            {t('Serviciu nou')}
          </Button>
        </div>
        <div className="service-editor-list">
          {services.map((service, index) => (
            <article
              className="service-editor"
              key={service.id || `new-${index}`}
            >
              <div className="service-editor__number">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="service-editor__fields">
                <Field
                  label={t('Denumire')}
                  value={service.name}
                  onChange={(event) =>
                    updateService(index, { name: event.target.value })
                  }
                />
                <Field
                  label={t('Descriere')}
                  value={service.description ?? ''}
                  onChange={(event) =>
                    updateService(index, {
                      description: event.target.value || null,
                    })
                  }
                />
                <div className="form-grid form-grid--three">
                  <Field
                    label={t('Durată (minute)')}
                    type="number"
                    min={5}
                    value={service.durationMinutes}
                    onChange={(event) =>
                      updateService(index, {
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                  <Field
                    label={t('Preț (RON)')}
                    type="number"
                    min={0}
                    step="0.01"
                    value={service.priceMinor / 100}
                    onChange={(event) =>
                      updateService(index, {
                        priceMinor: Math.round(
                          Number(event.target.value) * 100,
                        ),
                      })
                    }
                  />
                  <label className="switch-row switch-row--compact">
                    <input
                      type="checkbox"
                      checked={service.active}
                      onChange={(event) =>
                        updateService(index, { active: event.target.checked })
                      }
                    />
                    <span>
                      <strong>{t('Activ')}</strong>
                      <small>{t('Vizibil clienților')}</small>
                    </span>
                  </label>
                </div>
              </div>
              <Button
                variant="secondary"
                type="button"
                busy={busy}
                icon={Save}
                onClick={() => void saveService(service, index)}
              >
                {t('Salvează')}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function AdminPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<AdminTab>('bookings')
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const demo = !isSupabaseConfigured && searchParams.get('demo') === '1'

  useEffect(() => {
    let alive = true
    const prepare = async () => {
      if (!isSupabaseConfigured) {
        if (!demo) {
          navigate('/admin/login', { replace: true })
          return
        }
        setConfig(fallbackConfig)
        return
      }
      const session = await getSession()
      if (!session || !(await isCurrentUserMaster())) {
        navigate('/admin/login', { replace: true })
        return
      }
      setConfig(await getPublicConfig())
    }
    prepare()
      .catch(() => {
        if (alive) setError(t('Panoul nu poate fi încărcat momentan.'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [demo, navigate, t])

  const tabs = useMemo(
    () => [
      {
        id: 'bookings' as const,
        label: t('Programări'),
        icon: CalendarDays,
      },
      { id: 'schedule' as const, label: t('Program'), icon: Clock3 },
      { id: 'settings' as const, label: t('Setări'), icon: Settings2 },
    ],
    [t],
  )

  return (
    <div className="app-shell app-shell--admin">
      <AppHeader admin />
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar__title">
            <span>
              <Scissors aria-hidden="true" />
            </span>
            <div>
              <strong>{t('Panou')}</strong>
              <small>{t('Frizer')}</small>
            </div>
          </div>
          <nav aria-label={t('Panou administrare')}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                className={tab === id ? 'is-active' : ''}
                type="button"
                key={id}
                onClick={() => setTab(id)}
              >
                <Icon aria-hidden="true" /> {label}
              </button>
            ))}
          </nav>
          <button
            className="admin-sidebar__logout"
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/admin/login')
            }}
          >
            <LogOut aria-hidden="true" /> {t('Ieși din cont')}
          </button>
        </aside>

        <main className="admin-main">
          {demo ? (
            <Notice tone="warning">
              <strong>{t('Mod demonstrativ.')}</strong>{' '}
              {t(
                'Panoul este doar pentru previzualizare; datele nu sunt salvate.',
              )}
            </Notice>
          ) : null}
          {loading ? (
            <LoadingState label={t('Pregătim panoul…')} />
          ) : error || !config ? (
            <Notice tone="error">{error || t('Configurația lipsește.')}</Notice>
          ) : tab === 'bookings' ? (
            <AdminBookings config={config} demo={demo} />
          ) : tab === 'schedule' ? (
            <AdminSchedule demo={demo} />
          ) : (
            <AdminSettings initialConfig={config} demo={demo} />
          )}
        </main>
      </div>
    </div>
  )
}
