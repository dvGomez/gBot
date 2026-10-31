import { useState } from 'react'
import { ExternalLink, FlaskConical, KeyRound, LoaderCircle, RefreshCw, SquareTerminal } from 'lucide-react'
import type { ProviderInfo, ProviderKind } from '@shared/types'
import { Button, Card, IconTile, PageHeader, StatusBadge } from '@/components/ui'
import { useApp } from '@/state/app'
import { useProviderAction } from '@/state/useProviderAction'

const KIND_ICON: Record<ProviderKind, typeof SquareTerminal> = {
  'local-cli': SquareTerminal,
  api: KeyRound,
  dev: FlaskConical
}

const KIND_LABEL: Record<ProviderKind, string> = {
  'local-cli': 'Programa local',
  api: 'API com chave',
  dev: 'Teste'
}

function ProviderRow({ p }: { p: ProviderInfo }) {
  const app = useApp()
  const state = useProviderAction(p.id)
  const Icon = KIND_ICON[p.kind]
  const inUse = p.id === app.providerId

  return (
    <div className="border-b border-line py-4 last:border-0">
      <div className="flex items-center gap-4">
        <IconTile primary={inUse}>
          <Icon size={18} strokeWidth={1.6} />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {p.name}
            <span className="text-[12px] font-normal text-muted">· {KIND_LABEL[p.kind]}</span>
          </p>
          <p className="text-[13px] text-muted">{p.description}</p>
          {p.statusDetail && <p className="mt-1 font-mono text-[12px] text-fg-2">{p.statusDetail}</p>}
        </div>
        <StatusBadge status={p.status} />
        {p.actions?.map((a) => (
          <Button
            key={a.id}
            variant={a.primary ? 'primary' : 'secondary'}
            disabled={!!state.running}
            onClick={() => state.run(a.id)}
          >
            {state.running === a.id && <LoaderCircle size={14} className="animate-spin" />}
            {a.label}
          </Button>
        ))}
        {inUse ? (
          <span className="inline-flex h-9 w-24 items-center justify-center rounded-full bg-primary text-[13px] font-medium text-on-primary">
            Em uso
          </span>
        ) : (
          <Button disabled={p.status !== 'ready'} onClick={() => app.setProviderId(p.id)} className="w-24">
            Usar
          </Button>
        )}
      </div>

      {state.running && state.progress && (
        <div className="mt-3 ml-14 flex items-center gap-3 rounded-tile bg-sidebar px-4 py-3 text-[13px] text-fg-2">
          <LoaderCircle size={14} className="shrink-0 animate-spin text-muted" />
          <span className="flex-1">{state.progress.text}</span>
          {state.progress.url && (
            <a
              href={state.progress.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-fg underline underline-offset-2"
            >
              Abrir link <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
      {!state.running && state.result && (
        <p className={`mt-3 ml-14 text-[13px] ${state.result.ok ? 'text-success' : 'text-danger'}`}>{state.result.text}</p>
      )}
    </div>
  )
}

export function ProvidersView() {
  const app = useApp()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await app.refreshProviders()
    setRefreshing(false)
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <div className="flex items-end justify-between">
        <PageHeader eyebrow="Assistente" title="Provedores" subtitle="De onde vêm as respostas. Novos provedores entram aqui." />
        <Button onClick={refresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Verificar
        </Button>
      </div>

      <Card className="mt-8 px-6 py-2">
        {app.providers.length === 0 && <p className="py-5 text-[14px] text-muted">Verificando provedores…</p>}
        {app.providers.map((p) => (
          <ProviderRow key={p.id} p={p} />
        ))}
      </Card>

      <p className="mt-4 px-1 text-[12px] leading-relaxed text-muted">
        O gBot usa um perfil próprio do Claude Code, separado do seu <span className="font-mono">~/.claude</span>: o login
        feito aqui vale só para o gBot e não altera a configuração do Claude Code no terminal.
      </p>
    </div>
  )
}
