import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

type Job = {
  id: string
  calendar_entry_id: string
  event_type: 'confirmation' | 'reschedule' | 'cancellation' | 'reminder'
  booking_version: number
  attempt_count: number
}

type Booking = {
  id: string
  status: string
  version: number
  client_name: string
  client_email: string
  service_name: string
  starts_at: string
  price_minor: number
  currency: string
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

function messageFor(job: Job, booking: Booking, timezone: string) {
  const date = new Intl.DateTimeFormat('ro-RO', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(booking.starts_at))
  const money = new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: booking.currency,
    minimumFractionDigits: booking.price_minor % 100 === 0 ? 0 : 2,
  }).format(booking.price_minor / 100)

  if (job.event_type === 'cancellation') {
    return `Programarea pentru ${booking.service_name}, ${date}, a fost anulată.`
  }
  if (job.event_type === 'reschedule') {
    return `Programarea ta a fost mutată: ${booking.service_name}, ${date}. Total la locație: ${money}.`
  }
  if (job.event_type === 'reminder') {
    return `Reamintire: ai programare pentru ${booking.service_name}, ${date}. Te așteptăm!`
  }
  return `Programare confirmată: ${booking.service_name}, ${date}. Total la locație: ${money}.`
}

function subjectFor(job: Job) {
  if (job.event_type === 'cancellation') return 'Programare anulată'
  if (job.event_type === 'reschedule') return 'Programare reprogramată'
  if (job.event_type === 'reminder') return 'Reamintire programare'
  return 'Programare confirmată'
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: jsonHeaders,
    })
  }

  const expectedSecret = Deno.env.get('NOTIFICATION_WORKER_SECRET')
  if (
    !expectedSecret ||
    request.headers.get('x-worker-secret') !== expectedSecret
  ) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const emailUrl = Deno.env.get('EMAIL_WEBHOOK_URL')
  const emailToken = Deno.env.get('EMAIL_WEBHOOK_TOKEN')
  if (!supabaseUrl || !serviceRoleKey || !emailUrl || !emailToken) {
    return new Response(JSON.stringify({ error: 'worker_not_configured' }), {
      status: 503,
      headers: jsonHeaders,
    })
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: jobs, error: claimError } = await client.rpc(
    'claim_notification_jobs',
    {
      p_limit: 20,
    },
  )
  if (claimError) {
    console.error('notification_claim_failed', claimError.code)
    return new Response(JSON.stringify({ error: 'claim_failed' }), {
      status: 500,
      headers: jsonHeaders,
    })
  }

  const { data: config } = await client.rpc('get_public_config')
  const timezone = config?.settings?.timezone ?? 'Europe/Bucharest'
  let sent = 0
  let cancelled = 0
  let failed = 0

  for (const job of (jobs ?? []) as Job[]) {
    const { data: booking, error: bookingError } = await client
      .from('calendar_entries')
      .select(
        'id,status,version,client_name,client_email,service_name,starts_at,price_minor,currency',
      )
      .eq('id', job.calendar_entry_id)
      .maybeSingle<Booking>()

    const stale =
      bookingError ||
      !booking ||
      booking.version !== job.booking_version ||
      (job.event_type === 'reminder' && booking.status !== 'confirmed') ||
      (job.event_type !== 'cancellation' && booking.status === 'cancelled')

    if (stale) {
      await client
        .from('notification_jobs')
        .update({ status: 'cancelled', last_error: null, locked_at: null })
        .eq('id', job.id)
      cancelled += 1
      continue
    }

    try {
      const response = await fetch(emailUrl, {
        method: 'POST',
        headers: {
          ...jsonHeaders,
          authorization: `Bearer ${emailToken}`,
        },
        body: JSON.stringify({
          to: booking.client_email,
          subject: subjectFor(job),
          text: messageFor(job, booking, timezone),
          idempotencyKey: job.id,
        }),
      })
      if (!response.ok) throw new Error(`provider_${response.status}`)
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string
      }
      await client
        .from('notification_jobs')
        .update({
          status: 'sent',
          provider_message_id: payload.id ?? null,
          last_error: null,
          locked_at: null,
        })
        .eq('id', job.id)
      sent += 1
    } catch (error) {
      const retryable = job.attempt_count < 5
      await client
        .from('notification_jobs')
        .update({
          status: retryable ? 'failed' : 'cancelled',
          last_error:
            error instanceof Error
              ? error.message.slice(0, 200)
              : 'provider_error',
          locked_at: null,
          scheduled_for: retryable
            ? new Date(
                Date.now() + Math.min(60, 2 ** job.attempt_count) * 60_000,
              ).toISOString()
            : undefined,
        })
        .eq('id', job.id)
      failed += 1
    }
  }

  return new Response(
    JSON.stringify({ claimed: jobs?.length ?? 0, sent, cancelled, failed }),
    {
      status: 200,
      headers: jsonHeaders,
    },
  )
})
