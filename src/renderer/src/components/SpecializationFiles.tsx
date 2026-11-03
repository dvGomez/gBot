import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useState, type DragEvent } from 'react'
import { FileImage, FileText, FolderSearch, Paperclip, Plus, Trash2, TriangleAlert } from 'lucide-react'
import type { SpecializationFile } from '@shared/types'
import { ItemMenu } from '@/components/ItemMenu'
import { Button } from '@/components/ui'
import { timeAgo } from '@/lib/format'

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
/** Formatos que a ferramenta Read do Claude Code não abre (binários do Office etc.). */
const UNREADABLE = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'zip', 'rar', 'key', 'pages', 'numbers'])

/** Nota do arquivo, editável no lugar; salva ao sair do campo. */
function NoteInput({ specializationId, file }: { specializationId: string; file: SpecializationFile }) {
  useLanguage()
  const [note, setNote] = useState(file.note ?? '')
  return (
    <input
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => note !== (file.note ?? '') && void window.gbot.specializations.setFileNote(specializationId, file.name, note)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      maxLength={120}
      placeholder={tr('Nota (opcional): do que se trata, quando usar')}
      className="selectable mt-1 w-full rounded-nav border border-transparent bg-transparent px-1.5 py-0.5 -ml-1.5 text-[12px] text-fg-2 outline-none placeholder:text-muted/70 hover:border-line focus:border-muted/60"
    />
  )
}

/**
 * Arquivos de referência da especialização: quem a usa vê a lista no prompt e lê o conteúdo quando o pedido precisar.
 */
export function SpecializationFiles({ specializationId, name }: { specializationId: string; name: string }) {
  useLanguage()
  const [files, setFiles] = useState<SpecializationFile[]>([])
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    void window.gbot.specializations.files(specializationId).then(setFiles)
  }, [specializationId])

  const add = async (list?: File[]) => setFiles(await window.gbot.specializations.addFiles(specializationId, list))

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = [...e.dataTransfer.files]
    if (dropped.length) void add(dropped)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={onDrop}
      className={`-m-2 rounded-tile p-2 transition-colors ${dragging ? 'bg-hover outline-2 outline-dashed outline-muted/50' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <Paperclip size={14} />{tr(' Arquivos')}</p>
          {files.length > 0 && (
            <p className="text-[12px] text-muted">
              {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}{tr(' · lidos quando o pedido precisar')}</p>
          )}
        </div>
        <Button onClick={() => void add()} className="h-8">
          <Plus size={14} />{tr(' Adicionar')}</Button>
      </div>

      {files.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">{tr('Arraste arquivos para cá: contratos, manuais, planilhas em CSV, prints… ')}{tr('Os bots que usam esta especialização veem a lista e abrem o conteúdo só quando o pedido precisar.')}</p>
      ) : (
        <div className="space-y-1">
          {files.map((f) => {
            const e = ext(f.name)
            const Icon = IMAGES.has(e) ? FileImage : FileText
            return (
              <div key={f.name} className="flex items-start gap-3 rounded-nav px-1 py-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-[11px] text-muted">
                    {size(f.size)} · {timeAgo(f.addedAt)}
                  </p>
                  {UNREADABLE.has(e) && (
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-warning">
                      <TriangleAlert size={12} />{tr(' Os bots não abrem este formato: exporte como PDF ou CSV.')}</p>
                  )}
                  <NoteInput specializationId={specializationId} file={f} />
                </div>
                <ItemMenu
                  actions={[
                    { label: window.gbot.platform === 'darwin' ? tr('Mostrar no Finder') : tr('Mostrar no Explorer'), icon: FolderSearch, onSelect: () => void window.gbot.specializations.revealFile(specializationId, f.name) },
                    {
                      label: tr('Excluir'),
                      icon: Trash2,
                      danger: true,
                      confirm: tr('Excluir "{0}" dos arquivos de {1}?', f.name, name),
                      onSelect: () => {
                        setFiles((fs) => fs.filter((x) => x.name !== f.name))
                        void window.gbot.specializations.removeFile(specializationId, f.name)
                      }
                    }
                  ]}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
