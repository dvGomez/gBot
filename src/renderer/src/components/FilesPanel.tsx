import { t as tr, localized, useLanguage } from '@/i18n'
import { useEffect, useState } from 'react'
import { FolderSearch } from 'lucide-react'
import type { FilesFilter, TouchedFile } from '@shared/types'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { fileSize, iconFor } from './FileCards'
import { Chip } from './ui'

const ACTION: Record<TouchedFile['action'], { label: string; tone: string }> = localized({
  created: {
    label: tr('Criado'),
    tone: 'text-success'
  },
  modified: {
    label: tr('Alterado'),
    tone: 'text-warning'
  },
  attached: {
    label: tr('Anexado'),
    tone: 'text-fg-2'
  },
  read: {
    label: tr('Lido'),
    tone: 'text-muted'
  }
})

/** Arquivos mexidos numa conversa, rotina ou bot; atualiza sozinho quando algo novo é mexido ali. */
export function useTouchedFiles(filter: FilesFilter): TouchedFile[] {
  const [files, setFiles] = useState<TouchedFile[]>([])
  const { conversationId, flowId, botId } = filter

  useEffect(() => {
    if (!conversationId && !flowId && !botId) {
      setFiles([])
      return
    }
    let alive = true
    const load = () =>
      void window.gbot.files.touched({ conversationId, flowId, botId }).then((list) => {
        if (alive) setFiles(list)
      })
    load()
    const off = window.gbot.files.onTouched((ctx) => {
      if ((conversationId && ctx.conversationId === conversationId) || (flowId && ctx.flowId === flowId) || (botId && ctx.botId === botId)) load()
    })
    return () => {
      alive = false
      off()
    }
  }, [conversationId, flowId, botId])

  return files
}

/** Pasta do arquivo, encurtada pelo começo (o fim é o que identifica). */
function folderOf(path: string): string {
  const dir = path.replace(/[\\/][^\\/]*$/, '')
  return dir.length > 42 ? `…${dir.slice(-41)}` : dir
}

/**
 * Lista de arquivos mexidos (criados, alterados, anexados ou lidos): clicar abre no app padrão, a lupa mostra na
 * pasta. Dá para ver só os criados e alterados.
 */
export function FilesPanel({ files, empty = tr('Nenhum arquivo mexido ainda.') }: { files: TouchedFile[]; empty?: string }) {
  useLanguage()
  const [onlyWritten, setOnlyWritten] = useState(false)
  const where = window.gbot.platform === 'darwin' ? tr('Mostrar no Finder') : tr('Mostrar no Explorer')
  const written = files.filter((f) => f.action === 'created' || f.action === 'modified')
  const shown = onlyWritten ? written : files

  return (
    <div>
      {files.length > 0 && written.length > 0 && written.length < files.length && (
        <div className="mb-2 flex gap-1.5">
          <Chip active={!onlyWritten} onClick={() => setOnlyWritten(false)} className="h-7 px-3 text-[12px]">{tr('Todos (')}{files.length})
          </Chip>
          <Chip active={onlyWritten} onClick={() => setOnlyWritten(true)} className="h-7 px-3 text-[12px]">{tr('Criados e alterados (')}{written.length})
          </Chip>
        </div>
      )}
      {!shown.length && <p className="py-2 text-[13px] text-muted">{empty}</p>}
      <div className="space-y-0.5">
        {shown.map((f) => {
          const Icon = iconFor(f.name)
          const action = ACTION[f.action]
          return (
            <div key={f.path} className={cn('group flex items-center gap-2 rounded-nav px-2 py-1.5 hover:bg-hover', !f.exists && 'opacity-50')}>
              <button
                onClick={() => f.exists && void window.gbot.files.open(f.path)}
                disabled={!f.exists}
                title={f.exists ? tr('Abrir {0}', f.path) : tr('{0} (não existe mais)', f.path)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <Icon size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{f.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    <span className={action.tone}>{action.label}</span> · {timeAgo(f.at)}
                    {f.size !== undefined && ` · ${fileSize(f.size)}`}
                    {!f.exists && tr(' · não existe mais')} · {folderOf(f.path)}
                  </span>
                </span>
              </button>
              {f.exists && (
                <button
                  onClick={() => void window.gbot.files.reveal(f.path)}
                  className="shrink-0 rounded-full p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:bg-card hover:text-fg"
                  aria-label={where}
                  title={where}
                >
                  <FolderSearch size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
