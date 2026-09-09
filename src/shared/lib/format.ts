const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(options: Intl.DateTimeFormatOptions, timezone: string) {
  const key = `${timezone}:${JSON.stringify(options)}`
  let formatter = dateFormatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('ro-RO', {
      ...options,
      timeZone: timezone,
    })
    dateFormatterCache.set(key, formatter)
  }
  return formatter
}

export function formatMoney(priceMinor: number, currency = 'RON') {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    minimumFractionDigits: priceMinor % 100 === 0 ? 0 : 2,
  }).format(priceMinor / 100)
}

export function formatTime(iso: string, timezone = 'Europe/Bucharest') {
  return getFormatter({ hour: '2-digit', minute: '2-digit' }, timezone).format(
    new Date(iso),
  )
}

export function formatLongDate(iso: string, timezone = 'Europe/Bucharest') {
  return getFormatter(
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    timezone,
  ).format(new Date(iso))
}

export function formatShortDate(iso: string, timezone = 'Europe/Bucharest') {
  return getFormatter({ day: '2-digit', month: 'short' }, timezone).format(
    new Date(iso),
  )
}

export function toLocalDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, amount: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

export function todayInTimeZone(timezone = 'Europe/Bucharest') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function addDaysToDateInput(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function getBookableDates(days = 7, timezone = 'Europe/Bucharest') {
  const today = todayInTimeZone(timezone)
  return Array.from({ length: days }, (_, index) =>
    addDaysToDateInput(today, index),
  )
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    confirmed: 'Confirmată',
    completed: 'Finalizată',
    cancelled: 'Anulată',
    no_show: 'Nu s-a prezentat',
  }
  return labels[status] ?? status
}

export function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}
