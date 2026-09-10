import { beforeEach, describe, expect, it } from 'vitest'
import {
  adminCreateBlock,
  adminCreateBooking,
  adminSavePublicProfile,
  adminSetBookingStatus,
  cancelBooking,
  createBooking,
  getAdminCalendar,
  getAvailableSlots,
  getMyBookings,
  getPublicConfig,
  getRescheduleSlots,
  getSession,
  isCurrentUserMaster,
  isMockMode,
  mockMasterCredentials,
  mockOtpCode,
  requestEmailCode,
  resetMockBackend,
  rescheduleBooking,
  signInMaster,
  verifyEmailCode,
} from './barber-api'
import { addDaysToDateInput, todayInTimeZone } from '../lib/format'
import type { Service } from '../model/types'

async function findBookableDay(service: Service, startOffset: number) {
  const today = todayInTimeZone()
  for (let offset = startOffset; offset < startOffset + 8; offset += 1) {
    const day = addDaysToDateInput(today, offset)
    if ((await getAvailableSlots(day, service)).length) return day
  }
  throw new Error('No mock bookable day found')
}

describe('mock barber API', () => {
  beforeEach(() => resetMockBackend())

  it('creates and owns a demo booking without email verification', async () => {
    expect(await getSession()).toBeNull()
    const config = await getPublicConfig()
    const service = config.services[0]
    expect(service).toBeDefined()
    if (!service) return

    const day = await findBookableDay(service, 1)
    const slot = (await getAvailableSlots(day, service))[0]
    expect(slot).toBeDefined()
    if (!slot) return

    const booking = await createBooking({
      serviceId: service.id,
      startsAt: slot.startsAt,
      clientName: 'Demo Guest',
      requestId: 'anonymous-mock-request',
    })

    expect(booking.clientEmail).toBe('')
    expect((await getSession())?.user.email).toBeUndefined()
    expect((await getMyBookings()).map((item) => item.id)).toContain(booking.id)
  })

  it('completes email verification, booking, rescheduling and cancellation', async () => {
    expect(isMockMode).toBe(true)
    const email = 'client@example.com'
    await requestEmailCode(email)
    await expect(verifyEmailCode(email, '123456')).rejects.toMatchObject({
      code: 'INVALID_OTP',
    })

    const session = await verifyEmailCode(email, mockOtpCode)
    expect(session).not.toBeNull()
    if (!session) return
    expect(session.user.email).toBe(email)

    const config = await getPublicConfig()
    const service = config.services[0]
    expect(service).toBeDefined()
    if (!service) return

    const firstDay = await findBookableDay(service, 1)
    const slots = await getAvailableSlots(firstDay, service)
    expect(slots.length).toBeGreaterThan(0)
    const slot = slots[0]
    if (!slot) return

    const booking = await createBooking({
      serviceId: service.id,
      startsAt: slot.startsAt,
      clientName: 'Client Test',
      requestId: 'mock-request-1',
    })
    expect((await getMyBookings()).map((item) => item.id)).toContain(booking.id)

    const secondDay = await findBookableDay(service, 2)
    const moveSlots = await getRescheduleSlots(secondDay, booking.id)
    const moveSlot = moveSlots[0]
    expect(moveSlot).toBeDefined()
    if (!moveSlot) return

    const moved = await rescheduleBooking(
      booking.id,
      moveSlot.startsAt,
      booking.version,
      'mock-request-2',
    )
    expect(moved.startsAt).toBe(moveSlot.startsAt)

    const cancelled = await cancelBooking(
      moved.id,
      moved.version,
      'mock-request-3',
    )
    expect(cancelled.status).toBe('cancelled')
  })

  it('supports master calendar and settings actions without real Supabase writes', async () => {
    await signInMaster(
      mockMasterCredentials.email,
      mockMasterCredentials.password,
    )
    expect(await isCurrentUserMaster()).toBe(true)
    expect((await getSession())?.user.email).toBe(mockMasterCredentials.email)

    const config = await getPublicConfig()
    const service = config.services[0]
    expect(service).toBeDefined()
    if (!service) return

    const day = await findBookableDay(service, 1)
    const slot = (await getAvailableSlots(day, service))[0]
    expect(slot).toBeDefined()
    if (!slot) return

    const booking = await adminCreateBooking({
      serviceId: service.id,
      startsAt: slot.startsAt,
      clientName: 'Programare manuală',
      clientEmail: 'manual@example.com',
      requestId: 'mock-admin-request-1',
    })
    const completed = await adminSetBookingStatus(
      booking.id,
      'completed',
      booking.version,
    )
    expect(completed.status).toBe('completed')

    await adminCreateBlock({
      day,
      start: '16:00',
      end: '16:30',
      note: 'Test',
      requestId: 'mock-admin-request-2',
    })
    expect((await getAdminCalendar(day, day)).length).toBeGreaterThanOrEqual(2)

    await adminSavePublicProfile({
      ...config.profile,
      addressLine: 'Adresă de test',
    })
    expect((await getPublicConfig()).profile.addressLine).toBe('Adresă de test')
  })
})
