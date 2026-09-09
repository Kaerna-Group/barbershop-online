import {
  CalendarCheck2,
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookingFlow } from '../features/booking/booking-flow'
import { getPublicConfig } from '../shared/api/barber-api'
import type { PublicConfig } from '../shared/model/types'
import {
  AppHeader,
  Button,
  LoadingState,
  Notice,
  SectionLabel,
} from '../shared/ui/ui'

export default function HomePage() {
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
        document.title = `${result.profile.name} — programare online`
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [attempt])

  return (
    <div className="app-shell">
      <AppHeader />
      <main>
        <section className="booking-hero" id="programare">
          <div className="booking-hero__intro">
            <SectionLabel>Programare individuală</SectionLabel>
            <h1>
              Ora ta.
              <br />
              <em>Fără așteptare.</em>
            </h1>
            <p className="booking-hero__lead">
              Alegi serviciul, ziua și ora. Confirmi telefonul, iar locul este
              rezervat.
            </p>

            <div className="promise-list">
              <div>
                <span>
                  <Clock3 aria-hidden="true" />
                </span>
                <p>
                  <strong>Un singur client</strong>
                  <small>Timpul nu se împarte între programări.</small>
                </p>
              </div>
              <div>
                <span>
                  <CalendarCheck2 aria-hidden="true" />
                </span>
                <p>
                  <strong>Confirmare imediată</strong>
                  <small>Vezi doar orele disponibile acum.</small>
                </p>
              </div>
              <div>
                <span>
                  <ShieldCheck aria-hidden="true" />
                </span>
                <p>
                  <strong>Fără plată online</strong>
                  <small>Plătești la locație după serviciu.</small>
                </p>
              </div>
            </div>
          </div>

          <div className="booking-hero__surface">
            {error ? (
              <div className="load-error">
                <Notice tone="error">Nu am putut încărca programul.</Notice>
                <Button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Încearcă din nou
                </Button>
              </div>
            ) : config ? (
              <BookingFlow config={config} />
            ) : (
              <LoadingState label="Pregătim calendarul…" />
            )}
          </div>
        </section>

        {config ? (
          <section className="visit-info">
            <div className="visit-info__title">
              <SectionLabel>Înainte să vii</SectionLabel>
              <h2>Tot ce trebuie să știi.</h2>
            </div>
            <div className="visit-info__grid">
              <article>
                <span>01</span>
                <h3>Modificări</h3>
                <p>
                  Poți anula sau muta vizita cu cel puțin{' '}
                  {config.settings.changeCutoffHours} ore înainte, din pagina
                  „Vizitele mele”.
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>Locație</h3>
                <p>{config.profile.addressLine}</p>
                {config.profile.venueLabel ? (
                  <small>{config.profile.venueLabel}</small>
                ) : null}
              </article>
              <article>
                <span>03</span>
                <h3>Contact</h3>
                {config.profile.phoneHref ? (
                  <a href={`tel:${config.profile.phoneHref}`}>
                    <Phone aria-hidden="true" /> {config.profile.phoneDisplay}
                  </a>
                ) : (
                  <p>{config.profile.phoneDisplay}</p>
                )}
                <small>Scrie sau sună dacă întârzii.</small>
              </article>
            </div>
            <div className="privacy-note">
              <MapPin aria-hidden="true" />
              <p>
                Adresa exactă apare și în confirmare. Datele tale sunt folosite
                doar pentru programare și notificările aferente.
              </p>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        <div>
          <strong>PROGRAMARE</strong>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <nav aria-label="Legături secundare">
          <a href="#programare">Reguli de programare</a>
          <Link to="/my-bookings">Vizitele mele</Link>
          <Link to="/admin/login">Administrare</Link>
        </nav>
      </footer>
    </div>
  )
}
