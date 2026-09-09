import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../shared/i18n-context'
import { AppHeader } from '../shared/ui/ui'

export default function NotFoundPage() {
  const { t } = useI18n()

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="page-center not-found">
        <p className="section-label">404</p>
        <h1>{t('Pagina nu există.')}</h1>
        <p>{t('Linkul poate fi vechi sau scris greșit.')}</p>
        <Link className="button button--primary" to="/">
          <ArrowLeft aria-hidden="true" />
          <span>{t('Înapoi la programare')}</span>
        </Link>
      </main>
    </div>
  )
}
