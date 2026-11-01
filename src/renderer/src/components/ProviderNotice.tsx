import { t as tr, useLanguage } from '@/i18n'
import { CircleAlert } from 'lucide-react'
import { useApp } from '@/state/app'

/** Aviso acima do campo de mensagem quando o provedor escolhido ainda não pode ser usado. */
export function ProviderNotice() {
  useLanguage()
  const app = useApp()
  const preferred = app.providers.find((p) => p.id === app.preferredProviderId)
  const active = app.providers.find((p) => p.id === app.providerId)
  if (!preferred || preferred.status === 'ready') return null

  return (
    <div className="mb-3 flex items-center gap-3 rounded-tile border border-line bg-sidebar px-4 py-3 text-[13px]">
      <CircleAlert size={16} className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-fg-2">
        <span className="font-medium text-fg">{preferred.name}</span>{tr(' ainda não está pronto')}{preferred.statusDetail ? ` — ${preferred.statusDetail}` : ''}.
        {active && active.id !== preferred.id && tr(' Por enquanto, usando {0}.', active.name)}
      </p>
      <button
        onClick={() => app.setView('providers')}
        className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-on-primary"
      >{tr('Configurar')}</button>
    </div>
  )
}
