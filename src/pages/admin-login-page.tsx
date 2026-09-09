import { ArrowLeft, ArrowRight, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AppError,
  getSession,
  isCurrentUserMaster,
  isMockMode,
  isSupabaseConfigured,
  mockMasterCredentials,
  signInMaster,
} from '../shared/api/barber-api'
import { useI18n } from '../shared/i18n-context'
import { AppHeader, Button, Field, LoadingState, Notice } from '../shared/ui/ui'

export default function AdminLoginPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState(
    isMockMode ? mockMasterCredentials.email : '',
  )
  const [password, setPassword] = useState(
    isMockMode ? mockMasterCredentials.password : '',
  )
  const [busy, setBusy] = useState(false)
  const loginAvailable = isSupabaseConfigured || isMockMode
  const [checking, setChecking] = useState(loginAvailable)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loginAvailable) return
    getSession()
      .then(async (session) => {
        if (session && (await isCurrentUserMaster()))
          navigate('/admin', { replace: true })
      })
      .catch(() => undefined)
      .finally(() => setChecking(false))
  }, [loginAvailable, navigate])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError(t('Completează emailul și parola.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await signInMaster(email.trim(), password)
      navigate('/admin', { replace: true })
    } catch (caught) {
      setError(
        caught instanceof AppError && caught.code === 'NOT_MASTER'
          ? t('Contul este valid, dar nu este contul frizerului.')
          : t('Datele de autentificare nu sunt corecte.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell app-shell--admin">
      <AppHeader admin />
      <main className="admin-login-page">
        {checking ? (
          <LoadingState label={t('Verificăm sesiunea…')} />
        ) : (
          <div className="admin-login-card">
            <span className="auth-card__icon">
              <KeyRound aria-hidden="true" />
            </span>
            <p className="eyebrow">{t('Acces privat')}</p>
            <h1>{t('Panoul frizerului')}</h1>
            <p>
              {t(
                'Gestionează programările și orele de lucru. Accesul este permis unui singur cont.',
              )}
            </p>

            {isMockMode ? (
              <Notice tone="warning">
                {t(
                  'Intrare de test: folosește datele deja completate. Modificările dispar după reîncărcarea paginii.',
                )}
              </Notice>
            ) : null}

            <form onSubmit={submit} className="admin-login-form">
              <Field
                label={t('Email')}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy || !loginAvailable}
              />
              <Field
                label={t('Parolă')}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy || !loginAvailable}
              />
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Button
                type="submit"
                busy={busy}
                disabled={!loginAvailable}
                icon={ArrowRight}
              >
                {t('Intră în panou')}
              </Button>
            </form>

            <Link className="admin-login-card__back" to="/">
              <ArrowLeft aria-hidden="true" /> {t('Înapoi la programare')}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
