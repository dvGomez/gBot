import { useState } from 'react'
import { FlaskConical, KeyRound, RefreshCw, SquareTerminal } from 'lucide-react'
import type { ProviderKind } from '@shared/types'
import { Button, Card, IconTile, PageHeader, StatusBadge } from '@/components/ui'
import { useApp } from '@/state/app'

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
        {app.providers.map((p) => {
          const Icon = KIND_ICON[p.kind]
          const inUse = p.id === app.providerId
          return (
            <div key={p.id} className="flex items-center gap-4 border-b border-line py-4 last:border-0">
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
          )
        })}
      </Card>
    </div>
  )
}
