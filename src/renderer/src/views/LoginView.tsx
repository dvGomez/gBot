import { ExternalLink, LoaderCircle, RefreshCw, SquareTerminal } from 'lucide-react'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button, Card, IconTile, StatusBadge } from '@/components/ui'
import { AVATARS } from '@/avatars/sprites'
import { useApp } from '@/state/app'
import { useProviderAction } from '@/state/useProviderAction'

const CLAUDE_CODE = 'claude-code'
const INSTALL_DOCS = 'https://code.claude.com/docs/en/quickstart'

/** Tela inicial quando nenhum provedor real está conectado. */
export function LoginView() {
  const app = useApp()
  const claude = app.providers.find((p) => p.id === CLAUDE_CODE)
  const action = useProviderAction(CLAUDE_CODE)
  const waiting = action.running === 'login'

  const login = async () => {
    if (await action.run('login')) {
      app.setProviderId(CLAUDE_CODE)
      app.setView('home')
    }
  }

  return (
    <div className="flex h-full flex-col bg-page">
      <div className="drag h-14 shrink-0" />
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-14">
        <div className="w-full max-w-[460px]">
          <div className="flex items-end gap-4">
            {AVATARS.map((a, i) => (
              <PixelAvatar key={a.id} avatarId={a.id} size={44} seed={i} mood={waiting ? 'thinking' : 'idle'} />
            ))}
          </div>

          <h1 className="mt-8 text-[36px] leading-tight font-medium tracking-[-0.03em]">Bem-vindo ao gBot</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Entre com a sua conta Claude para conversar usando os limites da assinatura que você já tem.
          </p>

          <Card className="mt-8 p-5">
            <div className="flex items-center gap-4">
              <IconTile>
                <SquareTerminal size={18} strokeWidth={1.6} />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Claude Code</p>
                <p className="truncate text-[12px] text-muted">
                  {!claude
                    ? 'Verificando…'
                    : claude.status === 'unavailable'
                      ? 'Não encontrado neste computador'
                      : `${claude.statusDetail?.split(' · ')[0]} instalado neste computador`}
                </p>
              </div>
              {claude && <StatusBadge status={claude.status} />}
            </div>

            {claude?.status === 'unavailable' ? (
              <div className="mt-5 flex items-center gap-3">
                <a
                  href={INSTALL_DOCS}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[14px] font-medium text-on-primary"
                >
                  Como instalar o Claude Code <ExternalLink size={14} />
                </a>
                <Button onClick={() => void app.refreshProviders()} className="h-11">
                  <RefreshCw size={14} />
                  Verificar
                </Button>
              </div>
            ) : (
              <button
                onClick={login}
                disabled={waiting || !claude}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[14px] font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {waiting && <LoaderCircle size={16} className="animate-spin" />}
                {waiting ? 'Aguardando o navegador…' : 'Entrar com Claude Code'}
              </button>
            )}

            {waiting && action.progress && (
              <div className="mt-4 flex items-center gap-3 rounded-tile bg-sidebar px-4 py-3 text-[13px] text-fg-2">
                <span className="flex-1">{action.progress.text}</span>
                {action.progress.url && (
                  <a
                    href={action.progress.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 font-medium text-fg underline underline-offset-2"
                  >
                    Abrir link <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
            {!waiting && action.result && !action.result.ok && (
              <p className="mt-4 text-[13px] text-danger">{action.result.text}</p>
            )}
          </Card>

          <p className="mt-3 px-1 text-[12px] text-muted">Anthropic API e outros provedores chegam em breve.</p>
          <p className="mt-8 px-1 text-[12px] leading-relaxed text-muted">
            O login abre o navegador na página oficial da Anthropic. O gBot usa um perfil próprio do Claude Code: a conta
            conectada aqui não altera o Claude Code do seu terminal, e o app nunca vê a sua senha.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Enquanto a primeira verificação de provedores não termina. */
export function SplashView() {
  return (
    <div className="flex h-full flex-col bg-page">
      <div className="drag h-14 shrink-0" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-14">
        <PixelAvatar avatarId={AVATARS[0].id} mood="thinking" size={64} />
        <p className="text-[13px] text-muted">Verificando provedores…</p>
      </div>
    </div>
  )
}
