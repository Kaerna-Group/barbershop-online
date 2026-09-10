import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AppError,
  isMockMode,
  mockOtpCode,
  requestEmailCode,
  verifyEmailCode,
} from '../../shared/api/barber-api'
import { useI18n } from '../../shared/i18n-context'
import { Button, Field, Notice } from '../../shared/ui/ui'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailAuth({
  onAuthenticated,
}: {
  onAuthenticated: (session: Session) => void
}) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    const normalized = email.trim().toLowerCase()
    if (!emailPattern.test(normalized)) {
      setError(t('Scrie o adresă de email validă.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await requestEmailCode(normalized)
      setEmail(normalized)
      setSent(true)
    } catch (caught) {
      setError(
        (caught instanceof AppError &&
          caught.code === 'SUPABASE_NOT_CONFIGURED') ||
          (caught instanceof Error &&
            caught.message === 'SUPABASE_NOT_CONFIGURED')
          ? t(
              'Autentificarea devine activă după conectarea proiectului Supabase.',
            )
          : t(
              'Codul nu a putut fi trimis. Încearcă din nou peste câteva momente.',
            ),
      )
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError(t('Codul conține 6 cifre.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const session = await verifyEmailCode(email, code)
      if (!session) throw new Error('No session')
      onAuthenticated(session)
    } catch {
      setError(t('Codul nu este valid sau a expirat. Cere un cod nou.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-card">
      <span className="auth-card__icon">
        <LockKeyhole aria-hidden="true" />
      </span>
      <p className="eyebrow">{t('Acces securizat')}</p>
      <h1>{t('Vizitele tale, într-un singur loc.')}</h1>
      <p className="auth-card__intro">
        {t(
          'Folosește aceeași adresă de email confirmată la programare. Nu ai nevoie de parolă.',
        )}
      </p>

      {isMockMode ? (
        <Notice tone="info">
          {t('Cod de test: {code}. Nu se trimite niciun email.', {
            code: mockOtpCode,
          })}
        </Notice>
      ) : null}

      <div className="auth-card__form">
        <Field
          label={t('Adresă de email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="nume@exemplu.ro"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={sent || busy}
        />
        {sent ? (
          <Field
            label={t('Cod din email')}
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
          />
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        {sent ? (
          <div className="auth-card__actions">
            <Button onClick={() => void verify()} disabled={busy}>
              {busy ? t('Se verifică…') : t('Confirmă codul')}
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSent(false)
                setCode('')
                setError('')
              }}
              disabled={busy}
            >
              {t('Schimbă adresa')}
            </Button>
          </div>
        ) : (
          <Button onClick={() => void send()} disabled={busy}>
            {busy ? t('Se trimite…') : t('Trimite codul')}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}
