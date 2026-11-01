import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Gauge, RefreshCw } from 'lucide-react'
import type { ProviderAccount, UsageLimit } from '@shared/types'
import { cn } from '@/lib/cn'
import { resetTime, timeAgo } from '@/lib/format'
import { useApp } from '@/state/app'
import { tightestLimit, useAccounts } from '@/state/useAccounts'

/** Cor da barra conforme o quanto já foi usado. */
const barColor = (percent: number) => (percent >= 95 ? 'bg-danger' : percent >= 80 ? 'bg-warning' : 'bg-primary')

function LimitBar({ limit }: { limit: UsageLimit }) {
  useLanguage()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="font-medium text-fg-2">{tr(limit.label)}</span>
        <span className="shrink-0 text-muted">
          {limit.resetsAt && tr('Reinicia {0} · ', resetTime(limit.resetsAt))}
          <span className="font-medium text-fg-2">{limit.percent}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hover">
        <div className={cn('h-full rounded-full', barColor(limit.percent))} style={{ width: `${Math.min(100, limit.percent)}%` }} />
      </div>
    </div>
  )
}

function AccountLimits({ account, provider, onUse }: { account: ProviderAccount; provider?: string; onUse(): void }) {
  useLanguage()
  const sub = [provider, account.label !== account.email && account.email, account.organization !== provider && account.organization, account.plan && tr('plano {0}', account.plan)]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-fg">{account.label}</p>
          {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
        </div>
        {account.active ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-on-primary">
            <Check size={11} />{tr(' Em uso')}</span>
        ) : (
          <button
            onClick={onUse}
            disabled={!account.loggedIn}
            className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium text-fg-2 hover:bg-hover disabled:opacity-40"
          >{tr('Usar esta')}</button>
        )}
      </div>
      {!account.loggedIn ? (
        <p className="mt-2 text-[12px] text-danger">{tr('Sem login. Entre de novo em Provedores.')}</p>
      ) : (
        <>
          {account.limits.length > 0 && (
            <div className="mt-3 space-y-3">
              {account.limits.map((l) => (
                <LimitBar key={l.id} limit={l} />
              ))}
            </div>
          )}
          {account.limitsError ? (
            <p className="mt-2 text-[11px] text-muted">
              {account.limitsError}
              {account.limitsAt && tr(' Última leitura {0}.', timeAgo(account.limitsAt))}
            </p>
          ) : (
            !account.limitsAt && <p className="mt-2 text-[11px] text-muted">{tr('Lendo limites…')}</p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Botão com o limite de uso da conta ativa; ao clicar, mostra os limites de todas as contas conectadas e deixa
 * trocar a conta em uso. `placement` diz para que lado o painel abre.
 */
export function LimitsButton({ placement = 'down', className }: { placement?: 'up' | 'down'; className?: string }) {
  useLanguage()
  const app = useApp()
  const accounts = useAccounts()
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void window.gbot.accounts.refreshLimits()
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!accounts.length) return null
  // O botão mostra a conta ativa do provedor em uso (cada provedor tem a sua).
  const active = accounts.find((a) => a.active && a.providerId === app.providerId) ?? accounts.find((a) => a.active)
  const providerName = (id: string) => (id === 'codex' ? 'ChatGPT' : id === 'claude-code' ? 'Claude' : app.providers.find((p) => p.id === id)?.name)
  const multi = new Set(accounts.map((a) => a.providerId)).size > 1
  const top = tightestLimit(active)

  const refresh = async () => {
    setRefreshing(true)
    await window.gbot.accounts.refreshLimits(true)
    setRefreshing(false)
  }

  const use = async (account: ProviderAccount) => {
    await window.gbot.accounts.setActive(account.providerId, account.id)
    void app.refreshProviders()
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={top ? `${active?.label} · ${top.label}: ${top.percent}%` : tr('Limites de uso das contas')}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13px] font-medium text-fg-2 hover:bg-hover',
          open && 'bg-hover'
        )}
      >
        <Gauge size={14} className={top ? (top.percent >= 95 ? 'text-danger' : top.percent >= 80 ? 'text-warning' : 'text-muted') : 'text-muted'} />
        {top ? `${top.percent}%` : tr('Limites')}
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 z-40 w-[360px] overflow-hidden rounded-tile border border-line bg-sidebar shadow-xl',
            placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-[12px] font-medium text-muted">{tr('Limites de uso')}</p>
            <button
              onClick={() => void refresh()}
              disabled={refreshing}
              className="rounded-full p-1 text-muted hover:bg-hover hover:text-fg"
              aria-label={tr('Atualizar limites')}
              title={tr('Atualizar agora')}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {accounts.map((a) => (
              <AccountLimits
                key={`${a.providerId}:${a.id}`}
                account={a}
                provider={multi ? providerName(a.providerId) : undefined}
                onUse={() => void use(a)}
              />
            ))}
          </div>
          <button
            onClick={() => {
              setOpen(false)
              app.setView('providers')
            }}
            className="flex w-full items-center justify-between border-t border-line px-4 py-2.5 text-[12px] font-medium text-fg-2 hover:bg-hover"
          >{tr('Gerenciar contas ')}<ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
