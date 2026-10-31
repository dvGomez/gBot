import type { ProviderInfo } from '@shared/types'
import type { ChatProvider } from './types'
import { claudeCodeProvider } from './claude-code'
import { anthropicApiProvider } from './anthropic-api'
import { echoProvider } from './echo'

/** Ordem em que os provedores aparecem na interface. Novo provedor = nova linha aqui. */
const providers: ChatProvider[] = [claudeCodeProvider, anthropicApiProvider, echoProvider]

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
