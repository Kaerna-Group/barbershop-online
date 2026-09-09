import type { Session } from '@supabase/supabase-js'
import {
  buildDemoSlots,
  fallbackConfig,
  fallbackSchedule,
} from '../data/fallback'
import {
  mockBackend,
  MockBackendError,
  mockMasterCredentials,
  mockOtpCode,
} from '../data/mock-backend'
import {
  isMockMode,
  isSupabaseConfigured,
  requireSupabase,
  supabase,
} from '../lib/supabase'
import type {
  Booking,
  CalendarEntry,
  PublicConfig,
  Service,
  TimeSlot,
  WeeklyWindow,
} from '../model/types'

type Row = Record<string, unknown>

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function record(value: unknown): Row {
  return value && typeof value === 'object' ? (value as Row) : {}
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(record) : []
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' ? value : fallback
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeService(value: unknown): Service {
  const item = record(value)
  return {
    id: stringValue(item.id),
    name: stringValue(item.name),
    description: typeof item.description === 'string' ? item.description : null,
    priceMinor: numberValue(item.price_minor ?? item.priceMinor),
    currency: stringValue(item.currency, 'RON'),
    durationMinutes: numberValue(item.duration_minutes ?? item.durationMinutes),
    active: booleanValue(item.active, true),
    sortOrder: numberValue(item.sort_order ?? item.sortOrder),
  }
}

function normalizeBooking(value: unknown): Booking {
  const item = record(value)
  return {
    id: stringValue(item.id),
    serviceId: stringValue(item.service_id ?? item.serviceId),
    startsAt: stringValue(item.starts_at ?? item.startsAt),
    endsAt: stringValue(item.ends_at ?? item.endsAt),
    status: stringValue(item.status, 'confirmed') as Booking['status'],
    clientName: stringValue(item.client_name ?? item.clientName),
    clientPhone: stringValue(item.client_phone ?? item.clientPhone),
    serviceName: stringValue(item.service_name ?? item.serviceName),
    priceMinor: numberValue(item.price_minor ?? item.priceMinor),
    currency: stringValue(item.currency, 'RON'),
    durationMinutes: numberValue(item.duration_minutes ?? item.durationMinutes),
    version: numberValue(item.version, 1),
    notificationState:
      typeof (item.notification_state ?? item.notificationState) === 'string'
        ? ((item.notification_state ??
            item.notificationState) as Booking['notificationState'])
        : null,
    createdByMaster: booleanValue(
      item.created_by_master ?? item.createdByMaster,
    ),
  }
}

function throwApiError(error: { message: string; code?: string } | null) {
  if (!error) return
  const match = error.message.match(/APP_([A-Z0-9_]+)/)
  throw new AppError(
    match?.[1] ?? error.code ?? 'REQUEST_FAILED',
    error.message,
  )
}

function runMock<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    if (error instanceof MockBackendError) {
      throw new AppError(error.code, error.message)
    }
    throw error
  }
}

export async function getPublicConfig(): Promise<PublicConfig> {
  if (isMockMode) return mockBackend.getPublicConfig()
  if (!supabase) return fallbackConfig

  const { data, error } = await supabase.rpc('get_public_config')
  throwApiError(error)
  const payload = record(data)
  const profile = record(payload.profile)
  const settings = record(payload.settings)

  return {
    demo: false,
    profile: {
      name: stringValue(profile.name, fallbackConfig.profile.name),
      shortIntro: stringValue(
        profile.short_intro,
        fallbackConfig.profile.shortIntro,
      ),
      phoneDisplay: stringValue(profile.phone_display),
      phoneHref:
        typeof profile.phone_href === 'string' ? profile.phone_href : null,
      email: typeof profile.email === 'string' ? profile.email : null,
      addressLine: stringValue(profile.address_line),
      venueLabel:
        typeof profile.venue_label === 'string' ? profile.venue_label : null,
    },
    settings: {
      timezone: stringValue(settings.timezone, 'Europe/Bucharest'),
      currency: stringValue(settings.currency, 'RON'),
      slotStepMinutes: numberValue(settings.slot_step_minutes, 30),
      minLeadHours: numberValue(settings.min_lead_hours, 2),
      bookingHorizonDays: numberValue(settings.booking_horizon_days, 30),
      changeCutoffHours: numberValue(settings.change_cutoff_hours, 12),
      maxFutureBookings: numberValue(settings.max_future_bookings, 3),
      reminderHours:
        typeof settings.reminder_hours === 'number'
          ? settings.reminder_hours
          : null,
      bookingEnabled: booleanValue(settings.booking_enabled, true),
    },
    services: rows(payload.services).map(normalizeService),
  }
}

export async function getAvailableSlots(
  date: string,
  service: Service,
): Promise<TimeSlot[]> {
  if (isMockMode) return mockBackend.getAvailableSlots(date, service)
  if (!supabase) return buildDemoSlots(date, service.durationMinutes)

  const { data, error } = await supabase.rpc('get_available_slots', {
    p_day: date,
    p_service_id: service.id,
  })
  throwApiError(error)

  return rows(data).map((item) => ({
    startsAt: stringValue(item.starts_at),
    endsAt: stringValue(item.ends_at),
  }))
}

export async function requestPhoneCode(phone: string) {
  if (isMockMode) return runMock(() => mockBackend.requestPhoneCode(phone))
  const client = requireSupabase()
  const { error } = await client.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  })
  throwApiError(error)
}

export async function verifyPhoneCode(phone: string, token: string) {
  if (isMockMode)
    return runMock(() => mockBackend.verifyPhoneCode(phone, token))
  const client = requireSupabase()
  const { data, error } = await client.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  })
  throwApiError(error)
  return data.session
}

export async function signInMaster(email: string, password: string) {
  if (isMockMode) {
    return runMock(() => mockBackend.signInMaster(email, password))
  }
  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })
  throwApiError(error)
  if (!data.session)
    throw new AppError('NO_SESSION', 'Autentificarea nu a creat o sesiune.')

  const { data: isMaster, error: roleError } = await client.rpc(
    'is_current_user_master',
  )
  throwApiError(roleError)
  if (!isMaster) {
    await client.auth.signOut()
    throw new AppError(
      'NOT_MASTER',
      'Acest cont nu are acces la panoul frizerului.',
    )
  }
  return data.session
}

export async function signOut() {
  if (isMockMode) return mockBackend.signOut()
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  throwApiError(error)
}

export async function getSession(): Promise<Session | null> {
  if (isMockMode) return mockBackend.getSession()
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  throwApiError(error)
  return data.session
}

export function subscribeToAuth(callback: (session: Session | null) => void) {
  if (isMockMode) return mockBackend.subscribe(callback)
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    callback(session),
  )
  return () => data.subscription.unsubscribe()
}

export async function createBooking(input: {
  serviceId: string
  startsAt: string
  clientName: string
  requestId: string
}) {
  if (isMockMode) return runMock(() => mockBackend.createBooking(input))
  if (!supabase)
    throw new AppError('SUPABASE_NOT_CONFIGURED', 'Supabase is not configured.')

  const { data, error } = await supabase.rpc('create_booking', {
    p_client_name: input.clientName,
    p_request_id: input.requestId,
    p_service_id: input.serviceId,
    p_start_at: input.startsAt,
  })
  throwApiError(error)
  return normalizeBooking(data)
}

export async function getMyBookings() {
  if (isMockMode) return runMock(() => mockBackend.getMyBookings())
  const client = requireSupabase()
  const { data, error } = await client
    .from('calendar_entries')
    .select(
      'id,service_id,starts_at,ends_at,status,client_name,client_phone,service_name,price_minor,currency,duration_minutes,version,created_by_master',
    )
    .eq('kind', 'booking')
    .order('starts_at', { ascending: false })
  throwApiError(error)
  return rows(data).map(normalizeBooking)
}

export async function cancelBooking(
  bookingId: string,
  version: number,
  requestId: string,
) {
  if (isMockMode) {
    return runMock(() => mockBackend.cancelBooking(bookingId, version))
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_expected_version: version,
    p_request_id: requestId,
  })
  throwApiError(error)
  return normalizeBooking(data)
}

export async function rescheduleBooking(
  bookingId: string,
  startsAt: string,
  version: number,
  requestId: string,
) {
  if (isMockMode) {
    return runMock(() =>
      mockBackend.rescheduleBooking(bookingId, startsAt, version),
    )
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('reschedule_booking', {
    p_booking_id: bookingId,
    p_expected_version: version,
    p_new_start_at: startsAt,
    p_request_id: requestId,
  })
  throwApiError(error)
  return normalizeBooking(data)
}

export async function getRescheduleSlots(
  date: string,
  bookingId: string,
): Promise<TimeSlot[]> {
  if (isMockMode) {
    return runMock(() => mockBackend.getRescheduleSlots(date, bookingId))
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_reschedule_slots', {
    p_booking_id: bookingId,
    p_day: date,
  })
  throwApiError(error)
  return rows(data).map((item) => ({
    startsAt: stringValue(item.starts_at),
    endsAt: stringValue(item.ends_at),
  }))
}

export async function isCurrentUserMaster() {
  if (isMockMode) return mockBackend.isCurrentUserMaster()
  if (!supabase) return false
  const { data, error } = await supabase.rpc('is_current_user_master')
  throwApiError(error)
  return Boolean(data)
}

export async function getAdminCalendar(
  from: string,
  to: string,
): Promise<CalendarEntry[]> {
  if (isMockMode) {
    return runMock(() => mockBackend.getAdminCalendar(from, to))
  }
  if (!supabase) return []
  const { data, error } = await supabase.rpc('admin_list_calendar', {
    p_from: from,
    p_to: to,
  })
  throwApiError(error)
  return rows(data).map((item) => ({
    ...normalizeBooking(item),
    kind: stringValue(item.kind, 'booking') as CalendarEntry['kind'],
    note: typeof item.note === 'string' ? item.note : null,
  }))
}

export async function getWeeklySchedule(): Promise<WeeklyWindow[]> {
  if (isMockMode) return runMock(() => mockBackend.getWeeklySchedule())
  if (!supabase) return fallbackSchedule
  const { data, error } = await supabase.rpc('admin_get_weekly_schedule')
  throwApiError(error)
  return rows(data).map((item) => ({
    id: stringValue(item.id),
    weekday: numberValue(item.weekday),
    start: stringValue(item.starts_at).slice(0, 5),
    end: stringValue(item.ends_at).slice(0, 5),
  }))
}

export async function saveWeeklySchedule(windows: WeeklyWindow[]) {
  if (isMockMode) {
    return runMock(() => mockBackend.saveWeeklySchedule(windows))
  }
  const client = requireSupabase()
  const { error } = await client.rpc('admin_replace_weekly_schedule', {
    p_windows: windows.map((item) => ({
      weekday: item.weekday,
      start: item.start,
      end: item.end,
    })),
  })
  throwApiError(error)
}

export async function adminSaveScheduleOverride(
  day: string,
  windows: Array<{ start: string; end: string }>,
) {
  if (isMockMode) {
    return runMock(() => mockBackend.saveScheduleOverride(day, windows))
  }
  const client = requireSupabase()
  const { error } = await client.rpc('admin_set_schedule_override', {
    p_day: day,
    p_windows: windows,
  })
  throwApiError(error)
}

export async function adminCreateBlock(input: {
  day: string
  start: string
  end: string
  note: string
  requestId: string
}) {
  if (isMockMode) {
    return runMock(() => mockBackend.adminCreateBlock(input))
  }
  const client = requireSupabase()
  const { error } = await client.rpc('admin_create_block', {
    p_day: input.day,
    p_end: input.end,
    p_note: input.note || null,
    p_request_id: input.requestId,
    p_start: input.start,
  })
  throwApiError(error)
}

export async function adminCreateBooking(input: {
  serviceId: string
  startsAt: string
  clientName: string
  clientPhone: string
  requestId: string
}) {
  if (isMockMode) {
    return runMock(() => mockBackend.adminCreateBooking(input))
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_create_booking', {
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone,
    p_request_id: input.requestId,
    p_service_id: input.serviceId,
    p_start_at: input.startsAt,
  })
  throwApiError(error)
  return normalizeBooking(data)
}

export async function adminSetBookingStatus(
  bookingId: string,
  status: Booking['status'],
  version: number,
) {
  if (isMockMode) {
    return runMock(() =>
      mockBackend.adminSetBookingStatus(bookingId, status, version),
    )
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_set_booking_status', {
    p_booking_id: bookingId,
    p_expected_version: version,
    p_status: status,
  })
  throwApiError(error)
  return normalizeBooking(data)
}

export async function adminRescheduleBooking(
  bookingId: string,
  startsAt: string,
  version: number,
) {
  if (isMockMode) {
    return runMock(() =>
      mockBackend.adminRescheduleBooking(bookingId, startsAt, version),
    )
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_reschedule_booking', {
    p_booking_id: bookingId,
    p_expected_version: version,
    p_new_start_at: startsAt,
  })
  throwApiError(error)
  return normalizeBooking(data)
}

export async function adminSavePublicProfile(input: PublicConfig['profile']) {
  if (isMockMode) {
    return runMock(() => mockBackend.savePublicProfile(input))
  }
  const client = requireSupabase()
  const { error } = await client.rpc('admin_update_public_profile', {
    p_address_line: input.addressLine,
    p_email: input.email || null,
    p_name: input.name,
    p_phone_display: input.phoneDisplay,
    p_phone_href: input.phoneHref || null,
    p_short_intro: input.shortIntro,
    p_venue_label: input.venueLabel || null,
  })
  throwApiError(error)
}

export async function adminSaveSettings(input: PublicConfig['settings']) {
  if (isMockMode) {
    return runMock(() => mockBackend.saveSettings(input))
  }
  const client = requireSupabase()
  const { error } = await client.rpc('admin_update_booking_settings', {
    p_booking_enabled: input.bookingEnabled,
    p_booking_horizon_days: input.bookingHorizonDays,
    p_change_cutoff_hours: input.changeCutoffHours,
    p_max_future_bookings: input.maxFutureBookings,
    p_min_lead_hours: input.minLeadHours,
    p_reminder_hours: input.reminderHours,
    p_slot_step_minutes: input.slotStepMinutes,
  })
  throwApiError(error)
}

export async function adminSaveService(service: Service) {
  if (isMockMode) return runMock(() => mockBackend.saveService(service))
  const client = requireSupabase()
  const { error } = await client.rpc('admin_upsert_service', {
    p_active: service.active,
    p_description: service.description,
    p_duration_minutes: service.durationMinutes,
    p_id: service.id || null,
    p_name: service.name,
    p_price_minor: service.priceMinor,
    p_sort_order: service.sortOrder,
  })
  throwApiError(error)
}

export function resetMockBackend() {
  mockBackend.reset()
}

export { isMockMode, isSupabaseConfigured, mockMasterCredentials, mockOtpCode }
