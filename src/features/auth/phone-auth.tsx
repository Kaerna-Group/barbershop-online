import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AppError,
  isMockMode,
  mockOtpCode,
  requestPhoneCode,
  verifyPhoneCode,
} from '../../shared/api/barber-api'
import { useI18n } from '../../shared/i18n-context'
import { Button, Field, Notice } from '../../shared/ui/ui'

export function PhoneAuth({
  onAuthenticated,
}: {
  onAuthenticated: (session: Session) => void
}) {
  const { t } = useI18n()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    const normalized = phone.replace(/[\s()-]/g, '')
    if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
      setError(t('Scrie numărul complet, cu prefixul de țară.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await requestPhoneCode(normalized)
      setPhone(normalized)
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
      const session = await verifyPhoneCode(phone, code)
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
          'Folosește același număr confirmat la programare. Nu ai nevoie de parolă sau email.',
        )}
      </p>

      {isMockMode ? (
        <Notice tone="info">
          {t('Cod de test: {code}. Nu se trimite niciun SMS.', {
            code: mockOtpCode,
          })}
        </Notice>
      ) : null}

      <div className="auth-card__form">
        <Field
          label={t('Număr de telefon')}
          autoComplete="tel"
          inputMode="tel"
          placeholder="+40 7xx xxx xxx"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={sent || busy}
        />
        {sent ? (
          <Field
            label={t('Cod SMS')}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            disabled={busy}
          />
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        {sent ? (
          <>
            <Button
              type="button"
              busy={busy}
              onClick={verify}
              icon={ArrowRight}
            >
              {t('Intră în cont')}
            </Button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setSent(false)
                setCode('')
                setError('')
              }}
            >
              {t('Schimbă numărul')}
            </button>
          </>
        ) : (
          <Button type="button" busy={busy} onClick={send} icon={ArrowRight}>
            {t('Trimite codul')}
          </Button>
        )}
      </div>
    </div>
  )
}
