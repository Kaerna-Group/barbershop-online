import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../shared/ui/ui'

export default function NotFoundPage() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="page-center not-found">
        <p className="section-label">404</p>
        <h1>Pagina nu există.</h1>
        <p>Linkul poate fi vechi sau scris greșit.</p>
        <Link className="button button--primary" to="/">
          <ArrowLeft aria-hidden="true" />
          <span>Înapoi la programare</span>
        </Link>
      </main>
    </div>
  )
}
