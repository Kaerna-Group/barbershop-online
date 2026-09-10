import type { PublicConfig, TimeSlot, WeeklyWindow } from '../model/types'

export const fallbackConfig: PublicConfig = {
  demo: true,
  profile: {
    name: 'Programare la frizer',
    shortIntro: 'Un singur client, timpul rezervat doar pentru tine.',
    email: 'programare@barber.test',
    addressLine: 'Adresa va fi completată înainte de lansare',
    venueLabel: null,
  },
  settings: {
    timezone: 'Europe/Bucharest',
    currency: 'RON',
    slotStepMinutes: 30,
    minLeadHours: 2,
    bookingHorizonDays: 30,
    changeCutoffHours: 12,
    maxFutureBookings: 3,
    reminderHours: 24,
    bookingEnabled: true,
  },
  services: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Tuns',
      description: 'Consultație scurtă, tuns și finisare.',
      priceMinor: 8000,
      currency: 'RON',
      durationMinutes: 60,
      active: true,
      sortOrder: 1,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Tuns + barbă',
      description: 'Tuns, contur și aranjarea bărbii.',
      priceMinor: 12000,
      currency: 'RON',
      durationMinutes: 90,
      active: true,
      sortOrder: 2,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Barbă',
      description: 'Contur, scurtare și finisare.',
      priceMinor: 5000,
      currency: 'RON',
      durationMinutes: 30,
      active: true,
      sortOrder: 3,
    },
  ],
}

export const fallbackSchedule: WeeklyWindow[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    start: '09:00',
    end: '18:00',
  })),
  { weekday: 6, start: '10:00', end: '14:00' },
]

export function buildDemoSlots(
  date: string,
  durationMinutes: number,
): TimeSlot[] {
  const weekday = new Date(`${date}T12:00:00`).getDay()
  const window = fallbackSchedule.find((item) => item.weekday === weekday)
  if (!window) return []

  const [startHour, startMinute] = window.start.split(':').map(Number)
  const [endHour, endMinute] = window.end.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  const slots: TimeSlot[] = []

  for (let minute = start; minute + durationMinutes <= end; minute += 30) {
    const hour = Math.floor(minute / 60)
    const mins = minute % 60
    const startsAt = `${date}T${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00+03:00`
    const ends = minute + durationMinutes
    const endsAt = `${date}T${String(Math.floor(ends / 60)).padStart(2, '0')}:${String(ends % 60).padStart(2, '0')}:00+03:00`
    slots.push({ startsAt, endsAt })
  }

  return slots.filter((_, index) => index !== 2 && index !== 5)
}
