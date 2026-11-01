import { t as tr } from '@/i18n'
import { useEffect, useState } from 'react'
import { ExternalLink, Globe, Languages, LoaderCircle, SquareTerminal, X } from 'lucide-react'
import { useLanguage } from '@/i18n'
import { UpdateNotice } from '@/components/UpdateNotice'
import type { AppSettings, BrowserInfo } from '@shared/types'
import { Button, Card, PageHeader, Toggle, inputClass } from '@/components/ui'

function Row({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  useLanguage()
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
  useLanguage()
  const { preference, setPreference } = useLanguage()
  const [changingLanguage, setChangingLanguage] = useState(false)
  const [languageError, setLanguageError] = useState<string>()
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
      <PageHeader eyebrow={tr('Sistema')} title={tr('Configurações')} />

      <p className="mt-8 mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
        <Languages size={14} />{tr(' Idioma')}</p>
      <Card className="px-6 py-2">
        <Row title={tr('Idioma do aplicativo')} subtitle={tr('Use o idioma do sistema ou escolha um idioma para o gBot.')}>
          <div role="group" aria-label={tr('Idioma do aplicativo')} className="flex shrink-0 flex-wrap gap-1 rounded-nav border border-line p-1">
            {([{ id: 'system', label: tr('Seguir o sistema') }, { id: 'pt-BR', label: 'Português (Brasil)' }, { id: 'en', label: 'English' }] as const).map((option) => (
              <button key={option.id} type="button" aria-pressed={preference === option.id} disabled={changingLanguage}
                onClick={async () => {
                  setChangingLanguage(true)
                  setLanguageError(undefined)
                  try { await setPreference(option.id) }
                  catch { setLanguageError(tr('Não foi possível alterar o idioma.')) }
                  finally { setChangingLanguage(false) }
                }}
                className={`rounded-nav px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50 ${preference === option.id ? 'bg-primary text-on-primary' : 'text-fg-2 hover:bg-hover'}`}>
                {option.label}
              </button>
            ))}
          </div>
        </Row>
        {languageError && <p role="alert" className="pb-3 text-[13px] text-danger">{languageError}</p>}
      </Card>

      <p className="mt-8 mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
        <Globe size={14} />{tr(' Navegador')}</p>
      <Card className="px-6 py-2">
        <Row
          title={tr('Navegador do gBot')}
          subtitle={tr('Usado quando um bot ou conversa navega na web. Tem um perfil próprio: seus logins nele ficam salvos entre conversas, bots e reinícios.')}
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
            <span className="text-[13px] text-danger">{tr('Nenhum navegador compatível (Edge, Chrome ou Brave)')}</span>
          )}
        </Row>
        <Row
          title={tr('Abrir o navegador')}
          subtitle={tr('Abra para fazer login nos seus sites (ex.: a conta Microsoft) antes de pedir tarefas ao gBot.')}
        >
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button onClick={() => void openBrowser()} disabled={opening || !current}>
              {opening ? <LoaderCircle size={14} className="animate-spin" /> : <ExternalLink size={14} />}{tr('Abrir ')}{current?.name ?? 'navegador'}
            </Button>
            {openError && <span className="text-[12px] text-danger">{openError}</span>}
          </div>
        </Row>
        <Row
          title={tr('Pedir aprovação antes de usar sites')}
          subtitle={tr('Desligado: o gBot acessa os sites direto. Ligado: cada site novo pede aprovação no chat (mais seguro).')}
        >
          <Toggle
            label={tr('Pedir aprovação antes de usar sites')}
            checked={!!settings?.browserApprovals}
            onChange={(v) => void update({ browserApprovals: v })}
          />
        </Row>
        {settings?.browserApprovals && (
          <div className="py-4">
            <p className="text-[14px] font-medium">{tr('Sites sempre permitidos')}</p>
            <p className="text-[13px] text-muted">{tr('Nestes sites o gBot age sem perguntar. Os outros pedem aprovação no chat.')}</p>
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
                      aria-label={tr('Remover {0}', host)}
                      className="rounded-full p-0.5 text-muted hover:bg-hover hover:text-fg"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-muted">{tr('Nenhum ainda.')}</span>
              )}
            </div>
          </div>
        )}
      </Card>

      <p className="mt-8 mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
        <SquareTerminal size={14} />{tr(' Comandos e arquivos')}</p>
      <Card className="px-6 py-2">
        <Row
          title={tr('Liberar comandos sem perguntar')}
          subtitle={tr('Criar e editar arquivos na pasta de trabalho é sempre livre. Desligado (recomendado): comandos e ações fora da pasta pedem aprovação no chat. Ligado: o Claude Code roda tudo direto no seu computador.')}
        >
          <Toggle
            label={tr('Liberar comandos sem perguntar')}
            checked={!!settings?.autoApproveTools}
            onChange={(v) => void update({ autoApproveTools: v })}
          />
        </Row>
        {!settings?.autoApproveTools && (
          <div className="py-4">
            <p className="text-[14px] font-medium">{tr('Sempre permitidos')}</p>
            <p className="text-[13px] text-muted">{tr('Comandos e pastas que você liberou com "Sempre". O resto pede aprovação.')}</p>
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
                      aria-label={tr('Remover {0}', rule)}
                      className="shrink-0 rounded-full p-0.5 text-muted hover:bg-hover hover:text-fg"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-muted">{tr('Nenhum ainda.')}</span>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6 space-y-3">
        <UpdateNotice settings />
        <Card className="px-6 py-2">
          <Row title={tr('Baixar atualizações automaticamente')} subtitle={tr('Baixa novas versões em segundo plano. Você escolhe quando reiniciar para instalar.')}>
            <Toggle label={tr('Baixar atualizações automaticamente')} checked={settings?.autoDownloadUpdates !== false}
              onChange={(value) => void update({ autoDownloadUpdates: value })} />
          </Row>
        </Card>
      </div>
      <Card className="mt-6 px-6 py-2">
        <Row title={tr('Versão')} subtitle="gBot e Electron">
          <span className="font-mono text-[13px] text-fg-2">
            v{window.gbot.versions.app} · electron {window.gbot.versions.electron}
          </span>
        </Row>
      </Card>
    </div>
  )
}
