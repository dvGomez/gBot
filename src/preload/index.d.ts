import type { GbotApi } from '@shared/types'

declare global {
  interface Window {
    gbot: GbotApi
  }
}
