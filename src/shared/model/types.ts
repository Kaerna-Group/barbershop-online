export type BookingStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export type Service = {
  id: string
  name: string
  description: string | null
  priceMinor: number
  currency: string
  durationMinutes: number
  active: boolean
  sortOrder: number
}

export type MasterProfile = {
  name: string
  shortIntro: string
  email: string | null
  addressLine: string
  venueLabel: string | null
}

export type BookingSettings = {
  timezone: string
  currency: string
  slotStepMinutes: number
  minLeadHours: number
  bookingHorizonDays: number
  changeCutoffHours: number
  maxFutureBookings: number
  reminderHours: number | null
  bookingEnabled: boolean
}

export type PublicConfig = {
  profile: MasterProfile
  settings: BookingSettings
  services: Service[]
  demo: boolean
}

export type TimeSlot = {
  startsAt: string
  endsAt: string
}

export type Booking = {
  id: string
  serviceId: string
  startsAt: string
  endsAt: string
  status: BookingStatus
  clientName: string
  clientEmail: string
  serviceName: string
  priceMinor: number
  currency: string
  durationMinutes: number
  version: number
  notificationState?: 'pending' | 'sent' | 'failed' | null
  createdByMaster?: boolean
}

export type CalendarEntry = Booking & {
  kind: 'booking' | 'block'
  note?: string | null
}

export type WeeklyWindow = {
  id?: string
  weekday: number
  start: string
  end: string
}

export type EditableProfile = MasterProfile & {
  reminderHours: number | null
}

export type BookingDraft = {
  serviceId: string
  date: string
  startsAt: string
  clientName: string
  email: string
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string }
