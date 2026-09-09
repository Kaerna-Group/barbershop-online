import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from '../shared/i18n'
import { AppRouter } from './router'
import './styles.css'

const baseName = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter basename={baseName}>
        <AppRouter />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
)
