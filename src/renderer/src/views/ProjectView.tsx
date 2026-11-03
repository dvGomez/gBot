import { t as tr, useLanguage } from '@/i18n'
import { ArrowLeft, Bot as BotIcon, FolderOpen, GraduationCap, MessageSquarePlus, Pencil, Plus } from 'lucide-react'
import { ConversationList } from '@/components/ConversationList'
import { PixelAvatar } from '@/components/PixelAvatar'
import { ProjectTile } from '@/components/ProjectBadge'
import { Button, Card } from '@/components/ui'
import { draggable, useDrop } from '@/lib/dnd'
import { activeTriggers, triggersOf } from '@shared/flows'
import { useApp } from '@/state/app'

function NewCard({ label, onClick }: { label: string; onClick(): void }) {
  useLanguage()
  return (
    <button
      onClick={onClick}
      className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
    >
      <Plus size={18} />
      {label}
    </button>
  )
}

/** Página do projeto: bots, especializações e conversas dele, pasta e instruções. Aceita itens arrastados de fora. */
export function ProjectView() {
  useLanguage()
  const app = useApp()
  const project = app.selectedProject
  const drop = useDrop(
    (item) => !!project && item.projectId !== project.id,
    (item) => void app.moveItem(item, project?.id)
  )
  if (!project) return null
  const bots = app.bots.filter((b) => b.projectId === project.id)
  const specializations = app.specializations.filter((sp) => sp.projectId === project.id)
  const conversations = app.conversations.filter((c) => c.projectId === project.id)

  const pickFolder = async () => {
    const folder = await window.gbot.projects.pickFolder(project.folder)
    if (folder) await app.saveProject({ ...project, folder, updatedAt: Date.now() })
  }

  return (
    <div {...drop.props} className="relative mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      {drop.over && (
        <div
          className="pointer-events-none absolute inset-x-[40px] inset-y-2 z-20 flex items-start justify-center rounded-card border-2 border-dashed pt-3"
          style={{ borderColor: project.color, background: `${project.color}10` }}
        >
          <span className="rounded-full px-3 py-1 text-[12px] font-medium" style={{ color: project.color, background: `${project.color}26` }}>{tr('Soltar para mover para ')}{project.name}
          </span>
        </div>
      )}
      <button onClick={() => app.setView('home')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} />{tr(' Início')}</button>

      <div className="flex items-center gap-6">
        <ProjectTile project={project} size={96} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted">{tr('Projeto')}</p>
          <h1 className="mt-1 truncate text-[36px] leading-tight font-medium tracking-[-0.03em]">{project.name}</h1>
          {project.description && <p className="mt-1 text-[15px] text-muted">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => app.editProject(project.id)}>
            <Pencil size={14} />{tr(' Editar')}</Button>
          <Button onClick={() => app.editBot(undefined, project.id)}>
            <BotIcon size={14} />{tr(' Novo bot')}</Button>
          <Button onClick={() => app.editSpecialization(undefined, project.id)}>
            <GraduationCap size={14} />{tr(' Nova especialização')}</Button>
          <Button variant="primary" onClick={() => app.newConversation(undefined, project.id)}>
            <MessageSquarePlus size={14} />{tr(' Nova conversa')}</Button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-tile border border-line bg-sidebar px-4 py-3 text-[13px]">
        <FolderOpen size={15} className="shrink-0 text-muted" />
        {project.folder ? (
          <span className="selectable min-w-0 flex-1 truncate font-mono text-[12px] text-fg-2">{project.folder}</span>
        ) : (
          <span className="flex-1 text-muted">{tr('Sem pasta própria: o Claude usa a pasta padrão do gBot.')}</span>
        )}
        <Button onClick={() => void pickFolder()} className="h-8">
          {project.folder ? tr('Trocar pasta') : tr('Escolher pasta')}
        </Button>
      </div>

      <p className="mt-8 text-[13px] font-medium text-muted">{tr('Bots do projeto')}</p>
      <div className="mt-3 grid grid-cols-3 gap-3 xl:grid-cols-4">
        {bots.map((b, i) => (
          <button
            key={b.id}
            {...draggable({ kind: 'bot', id: b.id, projectId: b.projectId })}
            onClick={() => app.openBot(b.id)}
            className="flex flex-col items-start rounded-card border border-line bg-card p-5 text-left transition-colors hover:bg-hover"
          >
            <PixelAvatar avatar={b.avatar} size={44} seed={i} />
            <p className="mt-3 w-full truncate text-[15px] font-semibold">{b.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{b.description || tr('Sem descrição')}</p>
            <p className="mt-2 text-[11px] text-muted">
              {tr('{0} rotinas · {1} ligadas', triggersOf(app.botFlow(b.id)).length, activeTriggers(app.botFlow(b.id)).length)}
            </p>
          </button>
        ))}
        <NewCard label={tr('Criar bot no projeto')} onClick={() => app.editBot(undefined, project.id)} />
      </div>

      <p className="mt-8 text-[13px] font-medium text-muted">{tr('Especializações do projeto')}</p>
      <div className="mt-3 grid grid-cols-3 gap-3 xl:grid-cols-4">
        {specializations.map((sp) => (
          <button
            key={sp.id}
            {...draggable({ kind: 'specialization', id: sp.id, projectId: sp.projectId })}
            onClick={() => app.editSpecialization(sp.id)}
            className="flex flex-col items-start rounded-card border border-line bg-card p-5 text-left transition-colors hover:bg-hover"
          >
            <span className="flex size-11 items-center justify-center rounded-tile border-[1.5px] border-line bg-tile text-fg-2">
              <GraduationCap size={19} strokeWidth={1.7} />
            </span>
            <p className="mt-3 w-full truncate text-[15px] font-semibold">{sp.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{sp.description || tr('Sem descrição')}</p>
          </button>
        ))}
        <NewCard label={tr('Criar especialização no projeto')} onClick={() => app.editSpecialization(undefined, project.id)} />
      </div>

      <div className={`mt-8 grid gap-4 ${project.instructions ? 'grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>
        <Card className="p-5">
          <p className="pb-2 text-[13px] font-medium text-muted">{tr('Conversas do projeto')}</p>
          <ConversationList items={conversations} empty={tr('Nenhuma conversa ainda. Comece uma nova ou arraste uma para cá.')} />
        </Card>
        {project.instructions && (
          <Card className="self-start p-5">
            <p className="pb-2 text-[13px] font-medium text-muted">{tr('Instruções do projeto')}</p>
            <p className="selectable text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{project.instructions}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
