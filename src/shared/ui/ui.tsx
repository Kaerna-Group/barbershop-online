import {
  LoaderCircle,
  Languages,
  Scissors,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink } from 'react-router-dom'
import { useI18n, type Language } from '../i18n-context'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  busy?: boolean
  icon?: LucideIcon
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  busy = false,
  icon: Icon,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} ${className}`}
      disabled={disabled || busy}
      {...props}
    >
      {busy ? (
        <LoaderCircle className="spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}

export function Field({
  label,
  hint,
  error,
  className = '',
  id,
  ...props
}: FieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label className={`field ${className}`} htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input
        className={`field__input ${error ? 'field__input--error' : ''}`}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        {...props}
      />
      {error ? (
        <span className="field__error" id={`${inputId}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'success' | 'warning' | 'error'
}) {
  return (
    <div
      className={`notice notice--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {tone === 'warning' || tone === 'error' ? (
        <TriangleAlert aria-hidden="true" />
      ) : null}
      <div>{children}</div>
    </div>
  )
}

export function LoadingState({ label = 'Se încarcă…' }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" aria-hidden="true" />
      <span>{t(label)}</span>
    </div>
  )
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__line" />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, open])

  if (!open) return null

  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <button
        className="modal__backdrop"
        type="button"
        onClick={onClose}
        aria-label={t('Închide')}
      />
      <div className="modal__card">
        <div className="modal__header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t('Închide')}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function AppHeader({ admin = false }: { admin?: boolean }) {
  const { language, setLanguage, t } = useI18n()
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" to="/" aria-label={t('Pagina principală')}>
          <span className="brand__mark">
            <Scissors aria-hidden="true" />
          </span>
          <span>
            <strong>{t('PROGRAMARE')}</strong>
            <small>{t('la frizer')}</small>
          </span>
        </Link>

        <nav className="site-nav" aria-label={t('Navigare principală')}>
          {admin ? (
            <NavLink to="/" className="nav-link">
              {t('Site public')}
            </NavLink>
          ) : (
            <>
              <a className="nav-link nav-link--desktop" href="#programare">
                {t('Programare')}
              </a>
              <NavLink className="nav-link" to="/my-bookings">
                {t('Vizitele mele')}
              </NavLink>
            </>
          )}
          <label className="language-switcher">
            <Languages aria-hidden="true" />
            <span className="sr-only">{t('Limba interfeței')}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              aria-label={t('Limba interfeței')}
            >
              <option value="ro">RO</option>
              <option value="en">EN</option>
              <option value="ru">RU</option>
            </select>
          </label>
        </nav>
      </div>
    </header>
  )
}

export function StepIndicator({ current }: { current: number }) {
  const { t } = useI18n()
  const labels = ['Serviciu', 'Data', 'Ora', 'Confirmare'].map((label) =>
    t(label),
  )
  return (
    <ol className="steps" aria-label={t('Pașii programării')}>
      {labels.map((label, index) => {
        const step = index + 1
        return (
          <li
            className={`${step === current ? 'is-current' : ''} ${step < current ? 'is-done' : ''}`}
            key={label}
            aria-current={step === current ? 'step' : undefined}
          >
            <span>{step < current ? '✓' : step}</span>
            <small>{label}</small>
          </li>
        )
      })}
    </ol>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="section-label">{children}</p>
}
