import type { ChatEvent, ProviderAction, ProviderInfo, ProviderStatus, SendMessageRequest } from '@shared/types'

/**
 * Contrato que todo provedor implementa. Para adicionar um novo (Anthropic API, OpenAI, Ollama...):
 * crie um arquivo nesta pasta implementando `ChatProvider` e registre em `registry.ts`.
 */
export interface ChatProvider {
  readonly info: Omit<ProviderInfo, 'status' | 'statusDetail' | 'actions'>
  /** Verifica se o provedor pode ser usado agora (instalado, logado, chave configurada...). */
  checkStatus(): Promise<{ status: ProviderStatus; detail?: string; actions?: ProviderAction[] }>
  /** Executa uma ação listada em `checkStatus` (ex.: login). `progress` atualiza a interface. */
  runAction?(actionId: string, progress: (text: string, url?: string) => void): Promise<string | undefined>
  /** Envia a mensagem e emite eventos (`mood`, `delta`, `done`/`error`) até terminar ou ser cancelado. */
  send(req: SendMessageRequest, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<void>
}
