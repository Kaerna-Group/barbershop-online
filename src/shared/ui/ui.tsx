import {
  Check,
  ChevronDown,
  LoaderCircle,
  Languages,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink } from 'react-router-dom'
import { useI18n, type Language } from '../i18n-context'

const languageOptions = [
  { value: 'ro', code: 'RO', label: 'Română' },
  { value: 'en', code: 'EN', label: 'English' },
  { value: 'ru', code: 'RU', label: 'Русский' },
] satisfies Array<{ value: Language; code: string; label: string }>

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

function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const current =
    languageOptions.find((option) => option.value === language) ??
    languageOptions[0]

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  const focusOption = (edge: 'first' | 'last') => {
    requestAnimationFrame(() => {
      const options =
        rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
      options?.[edge === 'first' ? 0 : options.length - 1]?.focus()
    })
  }

  const openAndFocus = (edge: 'first' | 'last') => {
    setOpen(true)
    focusOption(edge)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return

    event.preventDefault()
    const options = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
        [],
    )
    const activeIndex = options.indexOf(
      document.activeElement as HTMLButtonElement,
    )
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex =
      activeIndex < 0
        ? direction > 0
          ? 0
          : options.length - 1
        : (activeIndex + direction + options.length) % options.length
    options[nextIndex]?.focus()
  }

  return (
    <div className="language-switcher" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        className="language-switcher__trigger"
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${t('Limba interfeței')}: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openAndFocus(event.key === 'ArrowDown' ? 'first' : 'last')
          }
        }}
      >
        <Languages aria-hidden="true" />
        <span>{current.code}</span>
        <ChevronDown aria-hidden="true" className={open ? 'is-open' : ''} />
      </button>
      {open ? (
        <div
          className="language-switcher__menu"
          id={listId}
          role="listbox"
          aria-label={t('Limba interfeței')}
        >
          {languageOptions.map((option) => (
            <button
              className="language-switcher__option"
              type="button"
              role="option"
              aria-selected={option.value === language}
              key={option.value}
              onClick={() => {
                setLanguage(option.value)
                setOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <span className="language-switcher__code">{option.code}</span>
              <span>{option.label}</span>
              <Check aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AppHeader({ admin = false }: { admin?: boolean }) {
  const { t } = useI18n()
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" to="/" aria-label={t('Pagina principală')}>
          <span className="brand__mark">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
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
          <LanguageSwitcher />
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
