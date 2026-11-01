import { useState } from 'react'
import { ExternalLink, FlaskConical, KeyRound, LoaderCircle, Pencil, RefreshCw, SquareTerminal, Trash2, UserRound } from 'lucide-react'
import type { ProviderAccount, ProviderInfo, ProviderKind } from '@shared/types'
import { ItemMenu } from '@/components/ItemMenu'
import { Button, Card, IconTile, PageHeader, StatusBadge, inputClass } from '@/components/ui'
import { useApp } from '@/state/app'
import { useAccounts } from '@/state/useAccounts'
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

/** Uma conta conectada: apelido, plano, limites e ações (usar, renomear, remover). */
function AccountRow({ account }: { account: ProviderAccount }) {
  const app = useApp()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(account.name ?? '')
  const [error, setError] = useState<string>()

  const act = async (fn: () => Promise<void>) => {
    setError(undefined)
    try {
      await fn()
      void app.refreshProviders()
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  const saveName = () => {
    setEditing(false)
    if (name.trim() !== (account.name ?? '')) void act(() => window.gbot.accounts.rename(account.providerId, account.id, name))
  }
  const sub = [account.name && account.email, account.organization, account.plan && `plano ${account.plan}`].filter(Boolean).join(' · ')
  const limits = account.limits.map((l) => `${l.label}: ${l.percent}%`).join(' · ')

  return (
    <div className="flex items-center gap-3 py-2.5">
      <UserRound size={15} className="shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') {
                setName(account.name ?? '')
                setEditing(false)
              }
            }}
            placeholder={account.email ?? 'Apelido da conta'}
            maxLength={40}
            className={`${inputClass} h-8 max-w-[280px] text-[13px]`}
          />
        ) : (
          <p className="truncate text-[14px] font-medium">{account.label}</p>
        )}
        {sub && <p className="truncate text-[12px] text-muted">{sub}</p>}
        {!account.loggedIn ? (
          <p className="text-[12px] text-danger">Sem login: adicione a conta de novo para entrar.</p>
        ) : (
          limits && <p className="truncate text-[12px] text-fg-2">{limits}</p>
        )}
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </div>
      {account.active ? (
        <span className="inline-flex h-8 w-20 items-center justify-center rounded-full bg-primary text-[12px] font-medium text-on-primary">
          Em uso
        </span>
      ) : (
        <Button
          className="h-8 w-20"
          disabled={!account.loggedIn}
          onClick={() => void act(() => window.gbot.accounts.setActive(account.providerId, account.id))}
        >
          Usar
        </Button>
      )}
      <ItemMenu
        actions={[
          { label: 'Renomear', icon: Pencil, onSelect: () => setEditing(true) },
          {
            label: 'Remover conta',
            icon: Trash2,
            danger: true,
            confirm: `Sair de ${account.label} no gBot? As conversas continuam; quem estiver usando esta conta passa para a próxima.`,
            onSelect: () => void act(() => window.gbot.accounts.remove(account.providerId, account.id))
          }
        ]}
      />
    </div>
  )
}

function ProviderRow({ p, accounts }: { p: ProviderInfo; accounts: ProviderAccount[] }) {
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

      {accounts.length > 0 && (
        <div className="mt-3 ml-14 divide-y divide-line rounded-tile border border-line px-4">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ProvidersView() {
  const app = useApp()
  const accounts = useAccounts()
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
          <ProviderRow key={p.id} p={p} accounts={accounts.filter((a) => a.providerId === p.id)} />
        ))}
      </Card>

      <p className="mt-4 px-1 text-[12px] leading-relaxed text-muted">
        O gBot usa perfis próprios do Claude Code e do Codex, um por conta, separados do seu{' '}
        <span className="font-mono">~/.claude</span> e <span className="font-mono">~/.codex</span>: os logins feitos aqui valem
        só para o gBot. A conta em uso de cada provedor atende o que usa aquele provedor; ao trocar, cada conversa continua na
        nova conta. Os bots trabalham sempre no Claude Code.
      </p>
    </div>
  )
}
