import { t as tr, useLanguage } from '@/i18n'
import type { ComponentType, ReactNode } from 'react'
import { Bot as BotIcon, Brain, ChartColumn, FolderPlus, GraduationCap, House, MessageSquarePlus, Pencil, Plug, Plus, Settings, Trash2 } from 'lucide-react'
import type { Project } from '@shared/types'
import { cn } from '@/lib/cn'
import { draggable, useDrop, type ItemRef } from '@/lib/dnd'
import { useApp, type View } from '@/state/app'
import { AgentAvatar } from './AgentAvatar'
import { ItemMenu, type MenuAction } from './ItemMenu'
import { PixelAvatar } from './PixelAvatar'
import { ProjectIcon } from './ProjectBadge'

/** Seção do menu; com `dropKind`, aceita itens desse tipo arrastados de um projeto (tira do projeto). */
function Section({ title, dropKind, children }: { title: string; dropKind?: ItemRef['kind']; children: ReactNode }) {
  useLanguage()
  const app = useApp()
  const drop = useDrop(
    (item) => !!dropKind && item.kind === dropKind && !!item.projectId,
    (item) => void app.moveItem(item, undefined)
  )
  return (
    <div
      {...drop.props}
      className={cn('mt-5 rounded-nav transition-colors', drop.over && 'bg-hover outline-[1.5px] outline-offset-2 outline-muted outline-dashed')}
    >
      <p className="px-3 pb-1.5 text-[12px] font-medium text-muted">
        {title}
        {drop.over && <span className="text-fg-2">{tr(' · soltar aqui tira do projeto')}</span>}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function NavItem({
  icon: Icon,
  leading,
  label,
  active,
  onClick,
  menu,
  drag,
  dropOver
}: {
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  leading?: ReactNode
  label: string
  active?: boolean
  onClick(): void
  /** Ações do "⋯", que aparece ao passar o mouse. */
  menu?: MenuAction[]
  /** Item que este link representa, para arrastar para um projeto. */
  drag?: ItemRef
  /** Um item arrastado está por cima (destaque de alvo). */
  dropOver?: boolean
}) {
  useLanguage()
  return (
    <div
      {...(drag && draggable(drag))}
      className={cn(
        'group relative flex h-9 items-center rounded-nav transition-colors',
        dropOver ? 'bg-hover outline-[1.5px] outline-muted outline-dashed' : active ? 'bg-nav-active' : 'hover:bg-hover'
      )}
    >
      <button
        onClick={onClick}
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-3 px-3 text-left text-[14px]',
          active ? 'font-medium text-fg' : 'text-fg-2',
          menu && 'group-hover:pr-9'
        )}
      >
        {leading ?? (Icon && <Icon size={17} strokeWidth={1.6} className="shrink-0" />)}
        <span className="truncate">{label}</span>
      </button>
      {menu && (
        <ItemMenu
          actions={menu}
          className="absolute right-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100"
        />
      )}
    </div>
  )
}

/** Projeto no menu: abre o projeto e aceita conversas, bots e especializações soltos em cima dele. */
function ProjectItem({ project, active }: { project: Project; active: boolean }) {
  useLanguage()
  const app = useApp()
  const drop = useDrop(
    (item) => item.projectId !== project.id,
    (item) => void app.moveItem(item, project.id)
  )
  return (
    <div {...drop.props}>
      <NavItem
        leading={<ProjectIcon project={project} size={17} />}
        label={project.name}
        active={active}
        dropOver={drop.over}
        onClick={() => app.openProject(project.id)}
      />
    </div>
  )
}

export function Sidebar() {
  useLanguage()
  const app = useApp()
  const isMac = window.gbot.platform === 'darwin'
  const go = (v: View) => () => app.setView(v)
  const chatActive = (id: string) => app.view === 'chat' && app.activeConversation?.id === id
  // No menu ficam só os itens soltos; o que está em projeto aparece na página do projeto.
  const plainConversations = app.conversations.filter((c) => !c.projectId).slice(0, 8)
  const looseBots = app.bots.filter((b) => !b.projectId)
  const looseSpecializations = app.specializations.filter((sp) => !sp.projectId)
  // Bots que estão rodando uma rotina agora ou ligados: ganham a bolinha verde.
  const activeBots = new Set(app.flows.filter((f) => f.enabled).map((f) => f.botId))

  const conversationMenu = (id: string): MenuAction[] => [
    {
      label: tr('Excluir conversa'),
      icon: Trash2,
      danger: true,
      confirm: tr('Excluir esta conversa? Não dá para desfazer.'),
      onSelect: () => void app.removeConversation(id)
    }
  ]
  const botMenu = (id: string): MenuAction[] => [
    { label: tr('Editar bot'), icon: Pencil, onSelect: () => app.editBot(id) },
    {
      label: tr('Excluir bot'),
      icon: Trash2,
      danger: true,
      confirm: tr('Excluir este bot com as rotinas e as conversas dele? Não dá para desfazer.'),
      onSelect: () => void app.removeBot(id)
    }
  ]

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className={cn('drag flex h-14 items-center gap-2.5', isMac ? 'pl-[88px]' : 'pl-5')}>
        <PixelAvatar avatarId="brasa" size={20} animated={false} />
        <span className="text-[15px] font-medium tracking-[-0.015em]">gBot</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Section title={tr('Conversas')} dropKind="conversation">
          <NavItem icon={House} label={tr('Início')} active={app.view === 'home'} onClick={go('home')} />
          <NavItem icon={MessageSquarePlus} label={tr('Nova conversa')} onClick={() => app.newConversation()} />
          {plainConversations.map((c) => (
            <NavItem
              key={c.id}
              leading={
                <AgentAvatar avatar={app.getBot(c.botId)?.avatar} size={17} animated={false} className="shrink-0" />
              }
              label={c.title}
              drag={{ kind: 'conversation', id: c.id }}
              active={chatActive(c.id)}
              onClick={() => app.openConversation(c.id)}
              menu={conversationMenu(c.id)}
            />
          ))}
        </Section>

        <Section title={tr('Projetos')}>
          {app.projects.map((p) => (
            <ProjectItem
              key={p.id}
              project={p}
              active={
                ((app.view === 'project' || app.view === 'project-editor') && app.selectedProject?.id === p.id) ||
                (app.view === 'chat' && app.activeProject?.id === p.id) ||
                (app.view === 'flow-editor' && app.getBot(app.selectedFlow?.botId)?.projectId === p.id)
              }
            />
          ))}
          <NavItem
            icon={FolderPlus}
            label={tr('Novo projeto')}
            active={app.view === 'project-editor' && !app.selectedProject}
            onClick={() => app.editProject()}
          />
        </Section>

        <Section title="Bots" dropKind="bot">
          {looseBots.map((b) => (
            <NavItem
              key={b.id}
              leading={
                <span className="relative shrink-0">
                  <PixelAvatar avatar={b.avatar} size={17} animated={false} />
                  {activeBots.has(b.id) && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-sidebar bg-success" />}
                </span>
              }
              label={b.name}
              drag={{ kind: 'bot', id: b.id }}
              active={
                ((app.view === 'bot' || app.view === 'bot-editor') && app.selectedBot?.id === b.id) ||
                (app.view === 'chat' && app.activeBot?.id === b.id) ||
                (app.view === 'flow-editor' && app.selectedFlow?.botId === b.id)
              }
              onClick={() => app.openBot(b.id)}
              menu={botMenu(b.id)}
            />
          ))}
          <NavItem
            icon={looseBots.length ? Plus : BotIcon}
            label={tr('Novo bot')}
            active={app.view === 'bot-editor' && !app.selectedBot}
            onClick={() => app.editBot()}
          />
        </Section>

        <Section title={tr('Especializações')} dropKind="specialization">
          {looseSpecializations.map((sp) => (
            <NavItem
              key={sp.id}
              icon={GraduationCap}
              label={sp.name}
              drag={{ kind: 'specialization', id: sp.id }}
              active={app.view === 'specialization-editor' && app.selectedSpecialization?.id === sp.id}
              onClick={() => app.editSpecialization(sp.id)}
              menu={[
                {
                  label: tr('Excluir especialização'),
                  icon: Trash2,
                  danger: true,
                  confirm: tr('Excluir esta especialização? Os bots que a usam deixam de usá-la.'),
                  onSelect: () => void app.removeSpecialization(sp.id)
                }
              ]}
            />
          ))}
          <NavItem
            icon={Plus}
            label={tr('Nova especialização')}
            active={app.view === 'specialization-editor' && !app.selectedSpecialization}
            onClick={() => app.editSpecialization()}
          />
        </Section>

        <Section title={tr('Sistema')}>
          <NavItem icon={Brain} label={tr('Regras e memória')} active={app.view === 'memory'} onClick={() => app.openMemory()} />
          <NavItem icon={ChartColumn} label={tr('Consumo')} active={app.view === 'usage'} onClick={go('usage')} />
          <NavItem icon={Plug} label={tr('Provedores')} active={app.view === 'providers'} onClick={go('providers')} />
          <NavItem icon={Settings} label={tr('Configurações')} active={app.view === 'settings'} onClick={go('settings')} />
        </Section>
      </nav>

    </aside>
  )
}
