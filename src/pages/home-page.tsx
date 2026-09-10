import { CalendarCheck2, Clock3, Mail, MapPin, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookingFlow } from '../features/booking/booking-flow'
import { getPublicConfig, isMockMode } from '../shared/api/barber-api'
import { useI18n } from '../shared/i18n-context'
import type { PublicConfig } from '../shared/model/types'
import {
  AppHeader,
  Button,
  LoadingState,
  Notice,
  SectionLabel,
} from '../shared/ui/ui'

export default function HomePage() {
  const { t } = useI18n()
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(false)
    getPublicConfig()
      .then((result) => {
        if (!alive) return
        setConfig(result)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [attempt])

  useEffect(() => {
    if (config)
      document.title = `${config.profile.name} — ${t('programare online')}`
  }, [config, t])

  return (
    <div className="app-shell">
      <AppHeader />
      <main>
        <section className="booking-hero" id="programare">
          <div className="booking-hero__intro">
            <SectionLabel>{t('Programare individuală')}</SectionLabel>
            <h1>
              {t('Ora ta.')}
              <br />
              <em>{t('Fără așteptare.')}</em>
            </h1>
            <p className="booking-hero__lead">
              {t(
                isMockMode
                  ? 'Alegi serviciul, ziua și ora. În modul demonstrativ nu ai nevoie de email.'
                  : 'Alegi serviciul, ziua și ora. Confirmi adresa de email, iar locul este rezervat.',
              )}
            </p>

            <div className="promise-list">
              <div>
                <span>
                  <Clock3 aria-hidden="true" />
                </span>
                <p>
                  <strong>{t('Un singur client')}</strong>
                  <small>{t('Timpul nu se împarte între programări.')}</small>
                </p>
              </div>
              <div>
                <span>
                  <CalendarCheck2 aria-hidden="true" />
                </span>
                <p>
                  <strong>{t('Confirmare imediată')}</strong>
                  <small>{t('Vezi doar orele disponibile acum.')}</small>
                </p>
              </div>
              <div>
                <span>
                  <ShieldCheck aria-hidden="true" />
                </span>
                <p>
                  <strong>{t('Fără plată online')}</strong>
                  <small>{t('Plătești la locație după serviciu.')}</small>
                </p>
              </div>
            </div>
          </div>

          <div className="booking-hero__surface">
            {error ? (
              <div className="load-error">
                <Notice tone="error">
                  {t('Nu am putut încărca programul.')}
                </Notice>
                <Button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {t('Încearcă din nou')}
                </Button>
              </div>
            ) : config ? (
              <BookingFlow config={config} />
            ) : (
              <LoadingState label={t('Pregătim calendarul…')} />
            )}
          </div>
        </section>

        {config ? (
          <section className="visit-info">
            <div className="visit-info__title">
              <SectionLabel>{t('Înainte să vii')}</SectionLabel>
              <h2>{t('Tot ce trebuie să știi.')}</h2>
            </div>
            <div className="visit-info__grid">
              <article>
                <span>01</span>
                <h3>{t('Modificări')}</h3>
                <p>
                  {t(
                    'Poți anula sau muta vizita cu cel puțin {hours} ore înainte, din pagina „Vizitele mele”.',
                    { hours: config.settings.changeCutoffHours },
                  )}
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>{t('Locație')}</h3>
                <p>{config.profile.addressLine}</p>
                {config.profile.venueLabel ? (
                  <small>{config.profile.venueLabel}</small>
                ) : null}
              </article>
              <article>
                <span>03</span>
                <h3>{t('Contact')}</h3>
                {config.profile.email ? (
                  <a href={`mailto:${config.profile.email}`}>
                    <Mail aria-hidden="true" /> {config.profile.email}
                  </a>
                ) : (
                  <p>{t('Email indisponibil momentan.')}</p>
                )}
                <small>{t('Scrie-ne dacă întârzii.')}</small>
              </article>
            </div>
            <div className="privacy-note">
              <MapPin aria-hidden="true" />
              <p>
                {t(
                  'Adresa exactă apare și în confirmare. Datele tale sunt folosite doar pentru programare și notificările aferente.',
                )}
              </p>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        <div>
          <strong>{t('PROGRAMARE')}</strong>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <nav aria-label={t('Legături secundare')}>
          <a href="#programare">{t('Reguli de programare')}</a>
          <Link to="/my-bookings">{t('Vizitele mele')}</Link>
          <Link to="/admin/login">{t('Administrare')}</Link>
        </nav>
      </footer>
    </div>
  )
}
