import { ArrowLeft, ArrowRight, Eye, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AppError,
  getSession,
  isCurrentUserMaster,
  isSupabaseConfigured,
  signInMaster,
} from '../shared/api/barber-api'
import { useI18n } from '../shared/i18n-context'
import { AppHeader, Button, Field, LoadingState, Notice } from '../shared/ui/ui'

export default function AdminLoginPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    getSession()
      .then(async (session) => {
        if (session && (await isCurrentUserMaster()))
          navigate('/admin', { replace: true })
      })
      .catch(() => undefined)
      .finally(() => setChecking(false))
  }, [navigate])

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

            {!isSupabaseConfigured ? (
              <Notice tone="warning">
                {t(
                  'Autentificarea reală devine activă după configurarea Supabase. Poți vedea acum panoul în mod demonstrativ, fără modificări salvate.',
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
                disabled={busy || !isSupabaseConfigured}
              />
              <Field
                label={t('Parolă')}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy || !isSupabaseConfigured}
              />
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Button
                type="submit"
                busy={busy}
                disabled={!isSupabaseConfigured}
                icon={ArrowRight}
              >
                {t('Intră în panou')}
              </Button>
            </form>

            {!isSupabaseConfigured ? (
              <Link className="button button--secondary" to="/admin?demo=1">
                <Eye aria-hidden="true" /> <span>{t('Vezi panoul demo')}</span>
              </Link>
            ) : null}

            <Link className="admin-login-card__back" to="/">
              <ArrowLeft aria-hidden="true" /> {t('Înapoi la programare')}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
