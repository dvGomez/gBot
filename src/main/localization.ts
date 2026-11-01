import { app } from 'electron'
import { resolveLanguage, translate } from '@shared/i18n'
import { getSettings } from './settings'

export const uiLanguage = () => resolveLanguage(getSettings().language, app.getPreferredSystemLanguages()[0] ?? app.getLocale())
export const uiText = (source: string, ...values: unknown[]) => translate(source, uiLanguage(), ...values)
export const languageInstructions = () => uiLanguage() === 'en'
  ? 'The app language is English. Use English for questions, plan titles, bot names/descriptions and workflow labels by default. Follow explicit language requests from the user and keep their existing content unchanged.'
  : 'O idioma do app é português do Brasil. Use português brasileiro nas perguntas, títulos do plano, nomes/descrições de bots e etapas por padrão. Respeite pedidos explícitos de outro idioma e preserve o conteúdo existente do usuário.'
