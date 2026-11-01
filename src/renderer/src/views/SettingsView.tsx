import { useEffect, useState } from 'react'
import { ExternalLink, Globe, LoaderCircle, SquareTerminal, X } from 'lucide-react'
import type { AppSettings, BrowserInfo } from '@shared/types'
import { Button, Card, PageHeader, Toggle, inputClass } from '@/components/ui'

function Row({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[13px] text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>()
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([])
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string>()

  useEffect(() => {
    void window.gbot.settings.get().then(setSettings)
    void window.gbot.browser.list().then(setBrowsers)
  }, [])

  const installed = browsers.filter((b) => b.installed)
  const current = installed.find((b) => b.id === settings?.browserId) ?? installed[0]

  const update = async (patch: Partial<AppSettings>) => setSettings(await window.gbot.settings.set(patch))

  const openBrowser = async () => {
    setOpening(true)
    setOpenError(undefined)
    try {
      await window.gbot.browser.open()
    } catch (e) {
      setOpenError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <PageHeader eyebrow="Sistema" title="Configurações" />

      <p className="mt-8 mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
        <Globe size={14} /> Navegador
      </p>
      <Card className="px-6 py-2">
        <Row
          title="Navegador do gBot"
          subtitle="Usado quando um bot ou conversa navega na web. Tem um perfil próprio: seus logins nele ficam salvos entre conversas, bots e reinícios."
        >
          {installed.length ? (
            <div className="w-[220px] shrink-0">
              <select value={current?.id ?? ''} onChange={(e) => void update({ browserId: e.target.value })} className={inputClass}>
                {installed.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-[13px] text-danger">Nenhum navegador compatível (Edge, Chrome ou Brave)</span>
          )}
        </Row>
        <Row
          title="Abrir o navegador"
          subtitle="Abra para fazer login nos seus sites (ex.: a conta Microsoft) antes de pedir tarefas ao gBot."
        >
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button onClick={() => void openBrowser()} disabled={opening || !current}>
              {opening ? <LoaderCircle size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              Abrir {current?.name ?? 'navegador'}
            </Button>
            {openError && <span className="text-[12px] text-danger">{openError}</span>}
          </div>
        </Row>
        <Row
          title="Pedir aprovação antes de usar sites"
          subtitle="Desligado: o gBot acessa os sites direto. Ligado: cada site novo pede aprovação no chat (mais seguro)."
        >
          <Toggle
            label="Pedir aprovação antes de usar sites"
            checked={!!settings?.browserApprovals}
            onChange={(v) => void update({ browserApprovals: v })}
          />
        </Row>
        {settings?.browserApprovals && (
          <div className="py-4">
            <p className="text-[14px] font-medium">Sites sempre permitidos</p>
            <p className="text-[13px] text-muted">
              Nestes sites o gBot age sem perguntar. Os outros pedem aprovação no chat.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {settings?.allowedSites.length ? (
                settings.allowedSites.map((host) => (
                  <span
                    key={host}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line py-1 pr-1.5 pl-3 text-[13px] text-fg-2"
                  >
                    {host}
                    <button
                      onClick={() => void update({ allowedSites: settings.allowedSites.filter((h) => h !== host) })}
                      aria-label={`Remover ${host}`}
                      className="rounded-full p-0.5 text-muted hover:bg-hover hover:text-fg"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-muted">Nenhum ainda.</span>
              )}
            </div>
          </div>
        )}
      </Card>

      <p className="mt-8 mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
        <SquareTerminal size={14} /> Comandos e arquivos
      </p>
      <Card className="px-6 py-2">
        <Row
          title="Liberar comandos sem perguntar"
          subtitle="Criar e editar arquivos na pasta de trabalho é sempre livre. Desligado (recomendado): comandos e ações fora da pasta pedem aprovação no chat. Ligado: o Claude Code roda tudo direto no seu computador."
        >
          <Toggle
            label="Liberar comandos sem perguntar"
            checked={!!settings?.autoApproveTools}
            onChange={(v) => void update({ autoApproveTools: v })}
          />
        </Row>
        {!settings?.autoApproveTools && (
          <div className="py-4">
            <p className="text-[14px] font-medium">Sempre permitidos</p>
            <p className="text-[13px] text-muted">Comandos e pastas que você liberou com "Sempre". O resto pede aprovação.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {settings?.allowedTools?.length ? (
                settings.allowedTools.map((rule) => (
                  <span
                    key={rule}
                    title={rule}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line py-1 pr-1.5 pl-3 font-mono text-[12px] text-fg-2"
                  >
                    <span className="truncate">{rule.replace(/^Bash[:=]/, '')}</span>
                    <button
                      onClick={() => void update({ allowedTools: settings.allowedTools?.filter((r) => r !== rule) })}
                      aria-label={`Remover ${rule}`}
                      className="shrink-0 rounded-full p-0.5 text-muted hover:bg-hover hover:text-fg"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-muted">Nenhum ainda.</span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6 px-6 py-2">
        <Row title="Versão" subtitle="gBot e Electron">
          <span className="font-mono text-[13px] text-fg-2">
            v{window.gbot.versions.app} · electron {window.gbot.versions.electron}
          </span>
        </Row>
      </Card>
    </div>
  )
}
