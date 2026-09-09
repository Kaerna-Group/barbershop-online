import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  I18nContext,
  interpolate,
  type Language,
  type Translate,
} from './i18n-context'
import { translations } from './translations'

const locales: Record<Language, string> = {
  ro: 'ro-RO',
  ru: 'ru-RU',
  en: 'en-GB',
}

function readInitialLanguage(): Language {
  if (typeof document === 'undefined') return 'ro'
  const match = document.cookie.match(
    /(?:^|; )barber_language=(ro|ru|en)(?:;|$)/,
  )
  return (match?.[1] as Language | undefined) ?? 'ro'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage)
    document.cookie = `barber_language=${nextLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [])

  const t = useCallback<Translate>(
    (source, variables) => {
      const translated =
        language === 'ro' ? source : translations[language][source]
      return interpolate(translated ?? source, variables)
    },
    [language],
  )

  const value = useMemo(
    () => ({ language, locale: locales[language], setLanguage, t }),
    [language, setLanguage, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
