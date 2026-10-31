import { useEffect, useState } from 'react'
import type { ProviderActionProgress } from '@shared/types'
import { useApp } from './app'

export interface ProviderActionState {
  /** Ação em andamento. */
  running?: string
  progress?: ProviderActionProgress
  result?: { ok: boolean; text: string }
}

/** Executa ações de um provedor (entrar, sair...) acompanhando o progresso enviado pelo processo principal. */
export function useProviderAction(providerId: string) {
  const app = useApp()
  const [state, setState] = useState<ProviderActionState>({})

  useEffect(
    () =>
      window.gbot.providers.onActionProgress((progress) => {
        if (progress.providerId === providerId) setState((s) => ({ ...s, progress }))
      }),
    [providerId]
  )

  const run = async (actionId: string): Promise<boolean> => {
    setState({ running: actionId })
    let ok = true
    try {
      const text = await window.gbot.providers.runAction(providerId, actionId)
      setState({ result: { ok: true, text: text ?? 'Pronto.' } })
    } catch (e) {
      ok = false
      // O Electron prefixa erros de IPC com "Error invoking remote method ..."
      const text = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      setState({ result: { ok: false, text } })
    }
    await app.refreshProviders()
    return ok
  }

  return { ...state, run }
}
