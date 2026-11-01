import type { ProviderAccount, ProviderInfo } from '@shared/types'
import type { ChatProvider, ProviderAccounts } from './types'
import { claudeCodeProvider } from './claude-code'
import { codexProvider } from './codex'
import { anthropicApiProvider } from './anthropic-api'
import { echoProvider } from './echo'

/** Ordem em que os provedores aparecem na interface. Novo provedor = nova linha aqui. */
const providers: ChatProvider[] = [claudeCodeProvider, codexProvider, anthropicApiProvider, echoProvider]

export function getProvider(id: string): ChatProvider | undefined {
  return providers.find((p) => p.info.id === id)
}

export async function listProviders(): Promise<ProviderInfo[]> {
  return Promise.all(
    providers.map(async (p) => {
      try {
        const { status, detail, actions } = await p.checkStatus()
        return { ...p.info, status, statusDetail: detail, actions }
      } catch (e) {
        return { ...p.info, status: 'unavailable' as const, statusDetail: (e as Error).message }
      }
    })
  )
}

/** Contas de todos os provedores que aceitam várias. */
export function listAccounts(): ProviderAccount[] {
  return providers.flatMap((p) => p.accounts?.list() ?? [])
}

export async function refreshAccountLimits(force?: boolean) {
  await Promise.all(providers.map((p) => p.accounts?.refreshLimits(force)))
}

export function providerAccounts(providerId: string): ProviderAccounts {
  const accounts = getProvider(providerId)?.accounts
  if (!accounts) throw new Error('Este provedor não tem contas.')
  return accounts
}
