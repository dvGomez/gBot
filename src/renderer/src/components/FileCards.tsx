import { File, FileImage, FileSpreadsheet, FileText, FolderSearch } from 'lucide-react'
import type { ChatFile } from '@shared/types'

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

function iconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return FileImage
  if (['csv', 'xlsx', 'xls'].includes(ext)) return FileSpreadsheet
  if (['pdf', 'txt', 'md', 'html', 'docx', 'doc', 'json'].includes(ext)) return FileText
  return File
}

/** Arquivos gerados numa resposta: clicar abre no app padrão; o ícone ao lado mostra no Finder/Explorer. */
export function FileCards({ files }: { files: ChatFile[] }) {
  const where = window.gbot.platform === 'darwin' ? 'Mostrar no Finder' : 'Mostrar no Explorer'
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((f) => {
        const Icon = iconFor(f.name)
        return (
          <div key={f.path} className="flex max-w-full items-center rounded-tile border border-line bg-sidebar">
            <button
              onClick={() => void window.gbot.files.open(f.path)}
              title={`Abrir ${f.path}`}
              className="flex min-w-0 items-center gap-3 rounded-l-tile py-2.5 pr-3 pl-3.5 text-left hover:bg-hover"
            >
              <Icon size={20} className="shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{f.name}</span>
                <span className="block text-[11px] text-muted">{size(f.size)} · abrir</span>
              </span>
            </button>
            <button
              onClick={() => void window.gbot.files.reveal(f.path)}
              title={where}
              aria-label={where}
              className="self-stretch rounded-r-tile border-l border-line px-2.5 text-muted hover:bg-hover hover:text-fg"
            >
              <FolderSearch size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
