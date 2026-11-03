import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Trash2, X } from 'lucide-react'
import type { ChatFile, ChatMessage, TokenUsage, ToolActivity } from '@shared/types'
import { totalTokens } from '@shared/usage'
import { formatTokens, usageDetail } from '@/lib/format'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Composer } from '@/components/Composer'
import { Markdown } from '@/components/Markdown'
import { HIDDEN_TOOLS, ToolList } from '@/components/ToolList'
import { MOOD_LABELS } from '@/avatars/sprites'
import { modelLabel } from '@/components/ModelSelect'
import { ProjectIcon } from '@/components/ProjectBadge'
import { ItemMenu } from '@/components/ItemMenu'
import { ApprovalCard } from '@/components/ApprovalCard'
import { QuestionCard } from '@/components/QuestionCard'
import { FileCards } from '@/components/FileCards'
import { FilesPanel, useTouchedFiles } from '@/components/FilesPanel'
import { PlanCard } from '@/components/PlanCard'
import { load, save } from '@/state/storage'
import { useApp } from '@/state/app'

/** Total gasto na conversa (com os bots consultados e chamados nela), atualizado a cada gasto novo. */
function useConversationUsage(id?: string): TokenUsage | undefined {
  const [usage, setUsage] = useState<TokenUsage>()
  useEffect(() => {
    setUsage(undefined)
    if (!id) return
    const load = () => void window.gbot.usage.conversation(id).then(setUsage)
    load()
    return window.gbot.usage.onChanged(load)
  }, [id])
  return usage
}

/** Anexos que o usuário mandou: fotos em miniatura, os demais como cartões. Clicar abre o arquivo. */
function SentAttachments({ files }: { files: ChatFile[] }) {
  useLanguage()
  const photos = files.filter((f) => f.thumb)
  const others = files.filter((f) => !f.thumb)
  return (
    <div className="flex flex-col items-end gap-2">
      {photos.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {photos.map((f) => (
            <button key={f.path} onClick={() => void window.gbot.files.open(f.path)} title={f.name} className="overflow-hidden rounded-tile border border-line hover:opacity-90">
              <img src={f.thumb} alt={f.name} className="max-h-40 max-w-[240px] object-cover" />
            </button>
          ))}
        </div>
      )}
      {others.length > 0 && <FileCards files={others} />}
    </div>
  )
}

/** Linha que mostra o que o bot está fazendo agora, enquanto a resposta não termina. */
function LiveStatus({ msg }: { msg: ChatMessage }) {
  useLanguage()
  const app = useApp()
  const waiting = app.approvals.some((r) => r.conversationId === app.activeConversation?.id)
  const asking = app.questions.some((q) => q.conversationId === app.activeConversation?.id)
  const running = msg.tools?.filter((t) => t.status === 'running' && !HIDDEN_TOOLS.has(t.name)).at(-1)
  const label = waiting
    ? tr('Esperando sua aprovação…')
    : asking
      ? tr('Esperando suas respostas…')
    : running
      ? tr('Trabalhando: {0}…', running.summary)
      : app.mood === 'talking'
        ? tr('Escrevendo…')
        : tr('Pensando…')
  return (
    <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </span>
      {label}
    </p>
  )
}

/** Resposta na ordem em que aconteceu: texto, ferramentas usadas, mais texto… */
function Steps({ msg }: { msg: ChatMessage }) {
  useLanguage()
  const tools = new Map((msg.tools ?? []).map((t) => [t.id, t]))
  const blocks: ({ kind: 'text'; text: string } | { kind: 'tools'; tools: ToolActivity[] })[] = []
  for (const step of msg.steps ?? []) {
    if (step.kind === 'text') {
      if (step.text.trim()) blocks.push(step)
      continue
    }
    const tool = tools.get(step.id)
    if (!tool) continue
    const last = blocks.at(-1)
    if (last?.kind === 'tools') last.tools.push(tool)
    else blocks.push({ kind: 'tools', tools: [tool] })
  }
  return (
    <>
      {blocks.map((b, i) => (b.kind === 'text' ? <Markdown key={i} text={b.text} /> : <ToolList key={i} tools={b.tools} stacked />))}
    </>
  )
}

function Message({ msg, live }: { msg: ChatMessage; live: boolean }) {
  useLanguage()
  const app = useApp()
  if (msg.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-2">
        {msg.files && msg.files.length > 0 && <SentAttachments files={msg.files} />}
        {msg.text && (
          <div className="selectable max-w-[75%] rounded-[18px] bg-tile px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
            {msg.text}
          </div>
        )}
      </div>
    )
  }
  // Resposta de um bot (o da conversa ou um chamado por @menção) leva o avatar dele; numa conversa normal, nada.
  const author = msg.botId ? app.getBot(msg.botId) : undefined
  const avatar = author?.avatar ?? app.activeAvatar
  return (
    <div className="flex gap-3">
      {avatar && (
        <div className="pt-0.5">
          <PixelAvatar avatar={avatar} mood={live ? app.mood : 'idle'} size={28} animated={live} />
        </div>
      )}
      <div className="selectable min-w-0 flex-1 pt-1 text-[15px] leading-relaxed">
        {author && <p className="mb-1 text-[12px] font-semibold text-fg-2">{author.name}</p>}
        {msg.error ? (
          <p className="text-danger">{tr(msg.text)}</p>
        ) : msg.steps ? (
          <Steps msg={msg} />
        ) : (
          // Mensagens antigas (sem a ordem dos passos): ferramentas em cima, texto embaixo.
          <>
            {msg.tools && msg.tools.length > 0 && <ToolList tools={msg.tools} />}
            {msg.text && <Markdown text={msg.text} />}
          </>
        )}
        {live && !msg.error && <LiveStatus msg={msg} />}
        {msg.files && msg.files.length > 0 && <FileCards files={msg.files} />}
        {msg.plan && app.activeConversation && <PlanCard conversationId={app.activeConversation.id} msg={msg} />}
        {msg.notices?.map((n, i) => (
          <p key={i} className="mt-2 text-[13px] text-muted">
            {n}
          </p>
        ))}
        {msg.usage && !live && (
          <p className="mt-2 w-fit text-[11.5px] text-muted/70" title={usageDetail(msg.usage)}>
            {formatTokens(totalTokens(msg.usage))} tokens
          </p>
        )}
      </div>
    </div>
  )
}

export function ChatView() {
  useLanguage()
  const app = useApp()
  const conv = app.activeConversation
  const avatar = app.activeAvatar
  const bot = app.activeBot
  const project = app.activeProject
  const empty = !conv || conv.messages.length === 0
  const bottom = useRef<HTMLDivElement>(null)
  const lastText = conv?.messages.at(-1)?.text
  const spent = useConversationUsage(conv?.id)
  // Painel lateral com os arquivos que a conversa mexeu (inclui bots chamados nela). Lembra se você fechou.
  const files = useTouchedFiles({ conversationId: conv?.id })
  const [filesOpen, setFilesOpen] = useState(() => load('chatFilesPanel', true))
  const toggleFiles = () => {
    setFilesOpen(!filesOpen)
    save('chatFilesPanel', !filesOpen)
  }
  const showFiles = filesOpen && files.length > 0
  const spentLabel = spent && totalTokens(spent) > 0 && (
    <span title={usageDetail(spent)}>{formatTokens(totalTokens(spent))}{tr(' tokens nesta conversa')}</span>
  )

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [conv?.messages.length, lastText])

  return (
    <div className="flex h-full">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[860px] items-center gap-3 px-8 pb-4">
          {avatar && <PixelAvatar avatar={avatar} mood={app.mood} size={40} />}
          <div className="min-w-0">
            {bot ? (
              <button onClick={() => app.openBot(bot.id)} className="text-[15px] font-semibold hover:underline">
                {bot.name}
              </button>
            ) : (
              <p className="truncate text-[15px] font-semibold">{conv?.title ?? tr('Nova conversa')}</p>
            )}
            {bot ? (
              <p className="text-[12px] text-muted">
                {app.models.length > 0 && `${modelLabel(app.models, app.activeModel)} · `}
                {MOOD_LABELS[app.mood]}
                {spentLabel && <> · {spentLabel}</>}
              </p>
            ) : (
              spentLabel && <p className="text-[12px] text-muted">{spentLabel}</p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {conv && !bot?.projectId ? (
              <label className="relative inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-2 hover:bg-hover">
                {project ? <ProjectIcon project={project} size={14} /> : <span className="text-muted">{tr('Projeto:')}</span>}
                <select
                  value={conv.projectId ?? ''}
                  onChange={(e) => void app.moveConversation(conv.id, e.target.value || undefined)}
                  disabled={app.busy}
                  className="appearance-none bg-transparent pr-1 outline-none"
                >
                  <option value="">{tr('Nenhum')}</option>
                  {app.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              project && (
                <button
                  onClick={() => app.openProject(project.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-2 hover:bg-hover"
                >
                  <ProjectIcon project={project} size={14} />
                  {project.name}
                </button>
              )
            )}
            {files.length > 0 && (
              <button
                onClick={toggleFiles}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] whitespace-nowrap hover:bg-hover ${showFiles ? 'bg-hover text-fg' : 'text-fg-2'}`}
                title={showFiles ? tr('Esconder arquivos') : tr('Arquivos que esta conversa mexeu')}
              >
                <FolderOpen size={14} />{tr(' Arquivos (')}{files.length})
              </button>
            )}
            {conv && (
              <ItemMenu
                actions={[
                  {
                    label: tr('Excluir conversa'),
                    icon: Trash2,
                    danger: true,
                    confirm: tr('Excluir esta conversa? Não dá para desfazer.'),
                    onSelect: () => void app.removeConversation(conv.id)
                  }
                ]}
              />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-line">
          <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-8 py-8">
            {empty && (
              <div className="flex flex-col items-center pt-16 text-center">
                {avatar && <PixelAvatar avatar={avatar} mood={app.mood} size={96} />}
                <p className={`${avatar ? 'mt-5' : ''} text-[22px] font-medium tracking-[-0.02em]`}>
                  {bot ? tr('Converse com {0}', bot.name) : tr('Nova conversa')}
                </p>
                <p className="mt-1 max-w-[460px] text-[14px] text-muted">
                  {bot
                    ? bot.description || tr('Este bot usa as especializações e a personalidade que você definiu.')
                    : app.visibleBots.length || app.visibleSpecializations.length
                      ? tr('Pergunte o que quiser. Mencione um bot com @ ou use uma especialização com /.')
                      : tr('Pergunte o que quiser.')}
                </p>
              </div>
            )}
            {conv?.messages.map((m, i) => (
              <Message key={m.id} msg={m} live={app.busy && i === conv.messages.length - 1} />
            ))}
            <div ref={bottom} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[860px] px-8 pt-2 pb-6">
          {app.approvals
            .filter((r) => !r.conversationId || r.conversationId === conv?.id)
            .map((r) => (
              <ApprovalCard key={r.id} req={r} />
            ))}
          {app.questions
            .filter((q) => q.conversationId === conv?.id)
            .map((q) => (
              <div key={q.id} className="mb-3">
                <QuestionCard
                  questions={q.questions}
                  title={q.requester ? tr('{0} quer saber', q.requester) : tr('Para acertar de primeira')}
                  onSubmit={(answers) => app.answerQuestions(q.id, answers)}
                  onSkip={() => app.answerQuestions(q.id)}
                />
              </div>
            ))}
          <Composer autoFocus placeholder={empty ? (bot ? tr('Mensagem para {0}…', bot.name) : tr('Mensagem…')) : tr('Responder…')} />
        </div>
      </div>
      {showFiles && (
        <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-sidebar">
          <div className="flex items-center justify-between px-4 pt-1 pb-3">
            <p className="text-[13px] font-medium text-fg-2">{tr('Arquivos da conversa')}</p>
            <button onClick={toggleFiles} aria-label={tr('Fechar')} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg">
              <X size={14} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <FilesPanel files={files} />
          </div>
        </aside>
      )}
    </div>
  )
}
