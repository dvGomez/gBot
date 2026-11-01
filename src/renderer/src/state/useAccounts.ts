import { useEffect, useState } from 'react'
import type { ProviderAccount } from '@shared/types'

/** Lê de novo os limites de tempos em tempos enquanto algo na tela mostra as contas. */
const POLL_MS = 2 * 60_000

/**
 * Contas conectadas (de todos os provedores) com os limites de uso. Os limites atualizam ao abrir, a cada
 * poucos minutos e depois de cada resposta; o processo principal evita consultas repetidas.
 */
export function useAccounts(): ProviderAccount[] {
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])

  useEffect(() => {
    let alive = true
    const load = () =>
      void window.gbot.accounts.list().then((list) => {
        if (alive) setAccounts(list)
      })
    load()
    void window.gbot.accounts.refreshLimits()
    const offChanged = window.gbot.accounts.onChanged(load)
    const offUsage = window.gbot.usage.onChanged(() => void window.gbot.accounts.refreshLimits(true))
    const timer = setInterval(() => void window.gbot.accounts.refreshLimits(), POLL_MS)
    return () => {
      alive = false
      offChanged()
      offUsage()
      clearInterval(timer)
    }
  }, [])

  return accounts
}

/** O limite mais apertado da conta (o que vai acabar primeiro). */
export const tightestLimit = (account?: ProviderAccount) =>
  account?.limits.reduce<ProviderAccount['limits'][number] | undefined>((max, l) => (!max || l.percent > max.percent ? l : max), undefined)
