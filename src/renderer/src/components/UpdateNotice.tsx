import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { AppUpdateState } from '@shared/types'
import { t, useLanguage } from '@/i18n'
import { Button, Card } from './ui'

function useUpdates() {
  const [state, setState] = useState<AppUpdateState>({ status: 'idle', currentVersion: window.gbot.versions.app })
  useEffect(() => {
    const receive = (value: AppUpdateState) => { if (value && typeof value.status === 'string') setState(value) }
    void window.gbot.updates.get().then(receive)
    return window.gbot.updates.onChanged(receive)
  }, [])
  return state
}

export function UpdateNotice({ settings = false }: { settings?: boolean }) {
  useLanguage()
  const state = useUpdates()
  const [error, setError] = useState<string>()
  const [acting, setActing] = useState(false)
  const act = async (work: () => Promise<void>) => {
    setActing(true)
    setError(undefined)
    try { await work() }
    catch (e) { setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
    finally { setActing(false) }
  }
  if (!settings && (state.dismissed || !['available', 'downloading', 'downloaded', 'manual'].includes(state.status))) return null
  const messages: Record<AppUpdateState['status'], string> = {
    idle: t('Verifique se há uma nova versão do gBot.'),
    checking: t('Buscando atualizações…'),
    available: t('Uma nova versão está disponível.'),
    downloading: t('Baixando atualização: {0}%', state.percent ?? 0),
    downloaded: t('Atualização pronta para instalar.'),
    'up-to-date': t('Você está usando a versão mais recente.'),
    error: t('Não foi possível verificar ou baixar a atualização. Tente novamente.'),
    development: t('Atualizações automáticas ficam disponíveis no aplicativo instalado.'),
    manual: t('Esta versão do macOS não tem assinatura para atualização automática. Baixe o instalador da nova versão.')
  }
  return <Card className={settings ? 'p-5' : 'mx-4 mb-2 shrink-0 border-primary/40 px-4 py-3'}>
    <div className="flex flex-wrap items-center gap-3">
      <Download size={17} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{settings ? t('Atualizações') : t('Nova versão do gBot')}{state.version && ` · v${state.version}`}</p>
        <p className="text-[12px] text-muted">{messages[state.status]}{settings && ` · v${state.currentVersion}`}</p>
      </div>
      {state.status === 'available' && <Button disabled={acting} onClick={() => void act(window.gbot.updates.download)}>{t('Baixar atualização')}</Button>}
      {state.status === 'downloaded' && <Button variant="primary" disabled={acting} onClick={() => void act(window.gbot.updates.install)}>{t('Reiniciar e instalar')}</Button>}
      {state.status === 'manual' && <Button onClick={() => void window.gbot.updates.openRelease()}>{t('Baixar instalador')}</Button>}
      {!settings && <Button variant="ghost" disabled={acting} onClick={() => void act(window.gbot.updates.dismiss)}>{t('Pular esta versão')}</Button>}
      {settings && <Button disabled={acting || ['checking', 'downloading', 'development', 'downloaded'].includes(state.status)} onClick={() => void act(window.gbot.updates.check)}>
        <RefreshCw size={14} className={state.status === 'checking' ? 'animate-spin' : ''} />{t('Verificar atualizações')}
      </Button>}
    </div>
    {state.status === 'downloading' && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-tile" role="progressbar" aria-label={t('Baixando atualização')} aria-valuenow={state.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${state.percent ?? 0}%` }} />
    </div>}
    {(error || state.error) && <p role="alert" className="mt-2 text-[12px] text-danger">{t(error ?? state.error ?? '')}</p>}
  </Card>
}
