import { ArrowLeft, Bot as BotIcon, FolderOpen, MessageSquarePlus, Pencil, Plus } from 'lucide-react'
import { ConversationList } from '@/components/ConversationList'
import { PixelAvatar } from '@/components/PixelAvatar'
import { ProjectTile } from '@/components/ProjectBadge'
import { Button, Card } from '@/components/ui'
import { useApp } from '@/state/app'

/** Página do projeto: bots e conversas dele, pasta e instruções. */
export function ProjectView() {
  const app = useApp()
  const project = app.selectedProject
  if (!project) return null
  const bots = app.bots.filter((b) => b.projectId === project.id)
  const conversations = app.conversations.filter((c) => c.projectId === project.id)

  const pickFolder = async () => {
    const folder = await window.gbot.projects.pickFolder(project.folder)
    if (folder) await app.saveProject({ ...project, folder, updatedAt: Date.now() })
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <button onClick={() => app.setView('home')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} /> Início
      </button>

      <div className="flex items-center gap-6">
        <ProjectTile project={project} size={96} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted">Projeto</p>
          <h1 className="mt-1 truncate text-[36px] leading-tight font-medium tracking-[-0.03em]">{project.name}</h1>
          {project.description && <p className="mt-1 text-[15px] text-muted">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => app.editProject(project.id)}>
            <Pencil size={14} /> Editar
          </Button>
          <Button onClick={() => app.editBot(undefined, project.id)}>
            <BotIcon size={14} /> Novo bot
          </Button>
          <Button variant="primary" onClick={() => app.newConversation(undefined, project.id)}>
            <MessageSquarePlus size={14} /> Nova conversa
          </Button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-tile border border-line bg-sidebar px-4 py-3 text-[13px]">
        <FolderOpen size={15} className="shrink-0 text-muted" />
        {project.folder ? (
          <span className="selectable min-w-0 flex-1 truncate font-mono text-[12px] text-fg-2">{project.folder}</span>
        ) : (
          <span className="flex-1 text-muted">Sem pasta própria: o Claude usa a pasta padrão do gBot.</span>
        )}
        <Button onClick={() => void pickFolder()} className="h-8">
          {project.folder ? 'Trocar pasta' : 'Escolher pasta'}
        </Button>
      </div>

      <p className="mt-8 text-[13px] font-medium text-muted">Bots do projeto</p>
      <div className="mt-3 grid grid-cols-3 gap-3 xl:grid-cols-4">
        {bots.map((b, i) => (
          <button
            key={b.id}
            onClick={() => app.openBot(b.id)}
            className="flex flex-col items-start rounded-card border border-line bg-card p-5 text-left transition-colors hover:bg-hover"
          >
            <PixelAvatar avatar={b.avatar} size={44} seed={i} />
            <p className="mt-3 w-full truncate text-[15px] font-semibold">{b.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{b.description || 'Sem descrição'}</p>
          </button>
        ))}
        <button
          onClick={() => app.editBot(undefined, project.id)}
          className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Plus size={18} />
          Criar bot no projeto
        </button>
      </div>

      <div className={`mt-8 grid gap-4 ${project.instructions ? 'grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>
        <Card className="p-5">
          <p className="pb-2 text-[13px] font-medium text-muted">Conversas do projeto</p>
          <ConversationList items={conversations} empty="Nenhuma conversa ainda. Comece uma nova." />
        </Card>
        {project.instructions && (
          <Card className="self-start p-5">
            <p className="pb-2 text-[13px] font-medium text-muted">Instruções do projeto</p>
            <p className="selectable text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{project.instructions}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
