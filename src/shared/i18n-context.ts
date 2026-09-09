import { createContext, useContext } from 'react'

export type Language = 'ro' | 'ru' | 'en'
export type TranslationVariables = Record<string, number | string>
export type Translate = (
  source: string,
  variables?: TranslationVariables,
) => string

export function interpolate(
  template: string,
  variables?: TranslationVariables,
) {
  if (!variables) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in variables ? String(variables[key]) : match,
  )
}

export type I18nValue = {
  language: Language
  locale: string
  setLanguage: (language: Language) => void
  t: Translate
}

export const I18nContext = createContext<I18nValue>({
  language: 'ro',
  locale: 'ro-RO',
  setLanguage: () => undefined,
  t: (source, variables) => interpolate(source, variables),
})

export function useI18n() {
  return useContext(I18nContext)
}
