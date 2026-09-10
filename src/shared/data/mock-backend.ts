import type { Session, User } from '@supabase/supabase-js'
import type {
  Booking,
  BookingStatus,
  CalendarEntry,
  PublicConfig,
  Service,
  TimeSlot,
  WeeklyWindow,
} from '../model/types'
import { todayInTimeZone } from '../lib/format'
import { fallbackConfig, fallbackSchedule } from './fallback'

export const mockOtpCode = '000000'
export const mockMasterCredentials = {
  email: 'demo@barber.test',
  password: 'demo1234',
} as const

export class MockBackendError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

type AuthListener = (session: Session | null) => void
type ScheduleOverride = Array<{ start: string; end: string }>

function cloneService(service: Service): Service {
  return { ...service }
}

function cloneConfig(config: PublicConfig): PublicConfig {
  return {
    demo: true,
    profile: { ...config.profile },
    settings: { ...config.settings },
    services: config.services.map(cloneService),
  }
}

function cloneBooking<T extends Booking>(booking: T): T {
  return { ...booking }
}

function localDate(iso: string, timezone = 'Europe/Bucharest') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function zonedDateTimeToIso(
  day: string,
  time: string,
  timezone = 'Europe/Bucharest',
) {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const target = Date.UTC(year, month - 1, date, hour, minute)
  let guess = target

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess))
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0)
    const represented = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
    )
    guess += target - represented
  }

  return new Date(guess).toISOString()
}

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(
    value % 60,
  ).padStart(2, '0')}`
}

function addMinutes(iso: string, value: number) {
  return new Date(new Date(iso).getTime() + value * 60_000).toISOString()
}

function overlaps(startsAt: string, endsAt: string, entry: CalendarEntry) {
  return (
    entry.status !== 'cancelled' &&
    new Date(startsAt).getTime() < new Date(entry.endsAt).getTime() &&
    new Date(endsAt).getTime() > new Date(entry.startsAt).getTime()
  )
}

function makeSession(
  role: 'client' | 'master',
  identity: { email?: string },
): Session {
  const createdAt = new Date().toISOString()
  const user: User = {
    id:
      role === 'master'
        ? '00000000-0000-4000-8000-000000000001'
        : '00000000-0000-4000-8000-000000000002',
    app_metadata: {
      provider: 'mock',
      providers: ['mock'],
      mock_role: role,
    },
    user_metadata: {},
    aud: 'authenticated',
    created_at: createdAt,
    role: 'authenticated',
    email: identity.email,
    identities: [],
  }

  return {
    access_token: `mock-${role}-access-token`,
    refresh_token: `mock-${role}-refresh-token`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  }
}

function initialEntries(config: PublicConfig): CalendarEntry[] {
  const day = todayInTimeZone(config.settings.timezone)
  const service = config.services[0]
  if (!service) return []
  const bookingStart = zonedDateTimeToIso(
    day,
    '10:00',
    config.settings.timezone,
  )
  const blockStart = zonedDateTimeToIso(day, '12:30', config.settings.timezone)

  return [
    {
      id: 'mock-booking-initial',
      kind: 'booking',
      serviceId: service.id,
      startsAt: bookingStart,
      endsAt: addMinutes(bookingStart, service.durationMinutes),
      status: 'confirmed',
      clientName: 'Client demonstrativ',
      clientEmail: 'client.demo@example.com',
      serviceName: service.name,
      priceMinor: service.priceMinor,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      version: 1,
      notificationState: 'sent',
      createdByMaster: false,
    },
    {
      id: 'mock-block-initial',
      kind: 'block',
      serviceId: '',
      startsAt: blockStart,
      endsAt: addMinutes(blockStart, 30),
      status: 'confirmed',
      clientName: '',
      clientEmail: '',
      serviceName: 'Pauză',
      priceMinor: 0,
      currency: config.settings.currency,
      durationMinutes: 30,
      version: 1,
      notificationState: null,
      createdByMaster: true,
      note: 'Pauză personală',
    },
  ]
}

class MockBackend {
  private config = cloneConfig(fallbackConfig)
  private weeklySchedule = fallbackSchedule.map((window) => ({ ...window }))
  private scheduleOverrides = new Map<string, ScheduleOverride>()
  private entries = initialEntries(this.config)
  private session: Session | null = null
  private pendingEmail: string | null = null
  private readonly listeners = new Set<AuthListener>()
  private readonly bookingRequests = new Map<string, Booking>()

  reset() {
    this.config = cloneConfig(fallbackConfig)
    this.weeklySchedule = fallbackSchedule.map((window) => ({ ...window }))
    this.scheduleOverrides.clear()
    this.entries = initialEntries(this.config)
    this.session = null
    this.pendingEmail = null
    this.bookingRequests.clear()
    this.emitAuth()
  }

  getPublicConfig() {
    return cloneConfig(this.config)
  }

  getAvailableSlots(
    day: string,
    service: Service,
    excludeEntryId?: string,
  ): TimeSlot[] {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    const windows = this.scheduleOverrides.has(day)
      ? (this.scheduleOverrides.get(day) ?? [])
      : this.weeklySchedule.filter((window) => window.weekday === weekday)
    const slots: TimeSlot[] = []

    for (const window of windows) {
      const start = minutes(window.start)
      const end = minutes(window.end)
      for (
        let minute = start;
        minute + service.durationMinutes <= end;
        minute += this.config.settings.slotStepMinutes
      ) {
        const startsAt = zonedDateTimeToIso(
          day,
          timeFromMinutes(minute),
          this.config.settings.timezone,
        )
        const endsAt = addMinutes(startsAt, service.durationMinutes)
        const occupied = this.entries.some(
          (entry) =>
            entry.id !== excludeEntryId && overlaps(startsAt, endsAt, entry),
        )
        if (!occupied) slots.push({ startsAt, endsAt })
      }
    }

    return slots
  }

  requestEmailCode(email: string) {
    this.pendingEmail = email
  }

  verifyEmailCode(email: string, token: string) {
    if (this.pendingEmail !== email || token !== mockOtpCode) {
      throw new MockBackendError('INVALID_OTP')
    }
    this.session = makeSession('client', { email })
    this.pendingEmail = null
    this.emitAuth()
    return this.session
  }

  signInMaster(email: string, password: string) {
    if (
      email !== mockMasterCredentials.email ||
      password !== mockMasterCredentials.password
    ) {
      throw new MockBackendError('INVALID_CREDENTIALS')
    }
    this.session = makeSession('master', { email })
    this.emitAuth()
    return this.session
  }

  signOut() {
    this.session = null
    this.emitAuth()
  }

  getSession() {
    return this.session
  }

  subscribe(callback: AuthListener) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  isCurrentUserMaster() {
    return this.session?.user.app_metadata.mock_role === 'master'
  }

  createBooking(input: {
    serviceId: string
    startsAt: string
    clientName: string
    requestId: string
  }) {
    const existing = this.bookingRequests.get(input.requestId)
    if (existing) return cloneBooking(existing)

    const email = this.ensureCustomerSession()
    const service = this.config.services.find(
      (item) => item.id === input.serviceId && item.active,
    )
    if (!service) throw new MockBackendError('SERVICE_NOT_FOUND')
    const day = localDate(input.startsAt, this.config.settings.timezone)
    const slot = this.getAvailableSlots(day, service).find(
      (item) => item.startsAt === input.startsAt,
    )
    if (!slot) throw new MockBackendError('SLOT_TAKEN')

    const futureCount = this.entries.filter(
      (entry) =>
        entry.kind === 'booking' &&
        entry.clientEmail === email &&
        entry.status === 'confirmed' &&
        new Date(entry.endsAt).getTime() >= Date.now(),
    ).length
    if (futureCount >= this.config.settings.maxFutureBookings) {
      throw new MockBackendError('BOOKING_LIMIT')
    }

    const booking: CalendarEntry = {
      id: crypto.randomUUID(),
      kind: 'booking',
      serviceId: service.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: 'confirmed',
      clientName: input.clientName,
      clientEmail: email,
      serviceName: service.name,
      priceMinor: service.priceMinor,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      version: 1,
      notificationState: email ? 'sent' : null,
      createdByMaster: false,
    }
    this.entries.push(booking)
    this.bookingRequests.set(input.requestId, booking)
    return cloneBooking(booking)
  }

  getMyBookings() {
    if (this.session?.user.app_metadata.mock_role !== 'client') {
      throw new MockBackendError('EMAIL_REQUIRED')
    }
    const email = this.session.user.email ?? ''
    return this.entries
      .filter(
        (entry) => entry.kind === 'booking' && entry.clientEmail === email,
      )
      .map(cloneBooking)
  }

  cancelBooking(bookingId: string, version: number) {
    const booking = this.findEditableBooking(bookingId, version)
    booking.status = 'cancelled'
    booking.version += 1
    booking.notificationState = 'sent'
    return cloneBooking(booking)
  }

  rescheduleBooking(bookingId: string, startsAt: string, version: number) {
    const booking = this.findEditableBooking(bookingId, version)
    const service = this.config.services.find(
      (item) => item.id === booking.serviceId,
    )
    if (!service) throw new MockBackendError('SERVICE_NOT_FOUND')
    const day = localDate(startsAt, this.config.settings.timezone)
    const slot = this.getAvailableSlots(day, service, booking.id).find(
      (item) => item.startsAt === startsAt,
    )
    if (!slot) throw new MockBackendError('SLOT_TAKEN')
    booking.startsAt = slot.startsAt
    booking.endsAt = slot.endsAt
    booking.version += 1
    booking.notificationState = 'sent'
    return cloneBooking(booking)
  }

  getRescheduleSlots(day: string, bookingId: string) {
    const booking = this.entries.find((entry) => entry.id === bookingId)
    if (!booking) throw new MockBackendError('BOOKING_NOT_FOUND')
    const service = this.config.services.find(
      (item) => item.id === booking.serviceId,
    )
    if (!service) throw new MockBackendError('SERVICE_NOT_FOUND')
    return this.getAvailableSlots(day, service, booking.id)
  }

  getAdminCalendar(from: string, to: string) {
    this.assertMaster()
    return this.entries
      .filter((entry) => {
        const day = localDate(entry.startsAt, this.config.settings.timezone)
        return day >= from && day <= to
      })
      .sort(
        (left, right) => +new Date(left.startsAt) - +new Date(right.startsAt),
      )
      .map(cloneBooking)
  }

  getWeeklySchedule() {
    this.assertMaster()
    return this.weeklySchedule.map((window) => ({ ...window }))
  }

  saveWeeklySchedule(windows: WeeklyWindow[]) {
    this.assertMaster()
    this.weeklySchedule = windows.map((window) => ({ ...window }))
  }

  saveScheduleOverride(day: string, windows: ScheduleOverride) {
    this.assertMaster()
    this.scheduleOverrides.set(
      day,
      windows.map((window) => ({ ...window })),
    )
  }

  adminCreateBlock(input: {
    day: string
    start: string
    end: string
    note: string
  }) {
    this.assertMaster()
    const startsAt = zonedDateTimeToIso(
      input.day,
      input.start,
      this.config.settings.timezone,
    )
    const endsAt = zonedDateTimeToIso(
      input.day,
      input.end,
      this.config.settings.timezone,
    )
    if (
      new Date(startsAt).getTime() >= new Date(endsAt).getTime() ||
      this.entries.some((entry) => overlaps(startsAt, endsAt, entry))
    ) {
      throw new MockBackendError('SLOT_TAKEN')
    }
    this.entries.push({
      id: crypto.randomUUID(),
      kind: 'block',
      serviceId: '',
      startsAt,
      endsAt,
      status: 'confirmed',
      clientName: '',
      clientEmail: '',
      serviceName: 'Blocat',
      priceMinor: 0,
      currency: this.config.settings.currency,
      durationMinutes: Math.round(
        (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000,
      ),
      version: 1,
      notificationState: null,
      createdByMaster: true,
      note: input.note || null,
    })
  }

  adminCreateBooking(input: {
    serviceId: string
    startsAt: string
    clientName: string
    clientEmail: string
  }) {
    this.assertMaster()
    const service = this.config.services.find(
      (item) => item.id === input.serviceId && item.active,
    )
    if (!service) throw new MockBackendError('SERVICE_NOT_FOUND')
    const day = localDate(input.startsAt, this.config.settings.timezone)
    const slot = this.getAvailableSlots(day, service).find(
      (item) => item.startsAt === input.startsAt,
    )
    if (!slot) throw new MockBackendError('SLOT_TAKEN')
    const booking: CalendarEntry = {
      id: crypto.randomUUID(),
      kind: 'booking',
      serviceId: service.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: 'confirmed',
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      serviceName: service.name,
      priceMinor: service.priceMinor,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      version: 1,
      notificationState: 'sent',
      createdByMaster: true,
    }
    this.entries.push(booking)
    return cloneBooking(booking)
  }

  adminSetBookingStatus(
    bookingId: string,
    status: BookingStatus,
    version: number,
  ) {
    this.assertMaster()
    const booking = this.findBooking(bookingId, version)
    booking.status = status
    booking.version += 1
    return cloneBooking(booking)
  }

  adminRescheduleBooking(bookingId: string, startsAt: string, version: number) {
    this.assertMaster()
    return this.rescheduleBooking(bookingId, startsAt, version)
  }

  savePublicProfile(profile: PublicConfig['profile']) {
    this.assertMaster()
    this.config.profile = { ...profile }
  }

  saveSettings(settings: PublicConfig['settings']) {
    this.assertMaster()
    this.config.settings = { ...settings }
  }

  saveService(service: Service) {
    this.assertMaster()
    const index = this.config.services.findIndex(
      (item) => item.id === service.id,
    )
    const saved = {
      ...service,
      id: service.id || crypto.randomUUID(),
    }
    if (index >= 0) this.config.services[index] = saved
    else this.config.services.push(saved)
  }

  private findEditableBooking(bookingId: string, version: number) {
    const booking = this.findBooking(bookingId, version)
    const isMaster = this.isCurrentUserMaster()
    const isClient = this.session?.user.app_metadata.mock_role === 'client'
    const clientEmail = this.session?.user.email ?? ''
    if (!isMaster && (!isClient || booking.clientEmail !== clientEmail)) {
      throw new MockBackendError('NOT_OWNER')
    }
    return booking
  }

  private ensureCustomerSession() {
    if (this.session?.user.app_metadata.mock_role !== 'client') {
      this.session = makeSession('client', {})
      this.emitAuth()
    }
    return this.session.user.email ?? ''
  }

  private findBooking(bookingId: string, version: number) {
    const booking = this.entries.find(
      (entry) => entry.id === bookingId && entry.kind === 'booking',
    )
    if (!booking) throw new MockBackendError('BOOKING_NOT_FOUND')
    if (booking.version !== version) {
      throw new MockBackendError('VERSION_CONFLICT')
    }
    return booking
  }

  private assertMaster() {
    if (!this.isCurrentUserMaster()) {
      throw new MockBackendError('NOT_MASTER')
    }
  }

  private emitAuth() {
    for (const listener of this.listeners) listener(this.session)
  }
}

export const mockBackend = new MockBackend()
