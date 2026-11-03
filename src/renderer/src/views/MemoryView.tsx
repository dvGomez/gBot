import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, FileText, FolderClosed, GraduationCap, Search, Trash2, TriangleAlert, Workflow } from 'lucide-react'
import type { AutoMemoryNote, Lesson } from '@shared/types'
import { AgentAvatar } from '@/components/AgentAvatar'
import { ItemMenu } from '@/components/ItemMenu'
import { Highlight, LessonCard, matches } from '@/components/MemoryPanel'
import { Card, inputClass } from '@/components/ui'
import { uid } from '@/lib/format'
import { useApp } from '@/state/app'

/** Trecho de um texto longo em volta do que foi procurado. */
function snippet(text: string, query: string, radius = 140): string {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
  const i = fold(text).indexOf(fold(query.trim()))
  if (i < 0) return text.slice(0, radius * 2)
  const from = Math.max(0, i - radius)
  const to = Math.min(text.length, i + query.length + radius)
  return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`
}

interface Source {
  key: string
  title: string
  icon: ReactNode
  text: string
  action: string
  open(): void
}

/**
 * Notas que o próprio Claude Code guardava sozinho, por pasta de trabalho, e que valiam para todos os bots daquela
 * pasta sem aparecer no gBot. O gBot desligou esse recurso; aqui dá para apagar as antigas ou trazer para um bot.
 */
function AutoNotes({
  notes,
  query,
  onRemoved
}: {
  notes: AutoMemoryNote[]
  query: string
  onRemoved(path: string): void
}) {
  useLanguage()
  const app = useApp()
  const [copied, setCopied] = useState<Record<string, string>>({})
  const where = (folder: string) => {
    if (folder.endsWith('-gBot-workspace')) return tr('pasta padrão do gBot (bots e conversas fora de projetos)')
    const p = app.projects.find((x) => x.folder && x.folder.replace(/[^a-zA-Z0-9]/g, '-') === folder)
    return p ? tr('pasta do projeto {0}', p.name) : 'outra pasta de trabalho'
  }
  const toBot = (n: AutoMemoryNote, botId: string) => {
    const now = Date.now()
    const title = (n.description || n.name).slice(0, 70)
    void window.gbot.memory.save({
      id: uid(),
      owner: { kind: 'bot', id: botId },
      title,
      when: n.description.slice(0, 140),
      steps: n.body.replace(/\*\*/g, '').slice(0, 500),
      why: tr('Trazido da memória automática do Claude Code.'),
      source: { kind: 'manual' },
      enabled: true,
      createdAt: now,
      updatedAt: now
    })
    setCopied((c) => ({ ...c, [n.path]: app.getBot(botId)?.name ?? tr('o bot') }))
  }

  return (
    <Card className="mt-4 p-5">
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <TriangleAlert size={15} className="text-warning" />{tr(' Memória automática do Claude Code')}</p>
      <p className="mt-1 mb-3 text-[12px] leading-relaxed text-muted">{tr('Notas que o Claude Code guardava sozinho e que valiam para todos os bots da mesma pasta, sem aparecer no gBot. Esse recurso agora fica desligado: estas notas não são mais usadas. Apague, ou traga para a memória de um bot se a regra ainda fizer sentido.')}</p>
      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.path} className="rounded-tile border border-line p-3.5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">
                  <Highlight text={n.description || n.name} query={query} />
                </p>
                <p className="text-[12px] text-muted">{tr('Valia para: ')}{where(n.folder)}</p>
              </div>
              <ItemMenu
                actions={[
                  {
                    label: tr('Apagar nota'),
                    icon: Trash2,
                    danger: true,
                    confirm: tr('Apagar esta nota da memória do Claude Code?'),
                    onSelect: () => void window.gbot.memory.removeAutoNote(n.path).then(() => onRemoved(n.path))
                  }
                ]}
              />
            </div>
            <p className="selectable mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
              <Highlight text={n.body.replace(/\*\*/g, '')} query={query} />
            </p>
            <div className="mt-3 flex items-center gap-2">
              {copied[n.path] ? (
                <p className="text-[12px] text-success">{tr('Copiado para a memória de ')}{copied[n.path]}{tr('. Pode apagar esta nota.')}</p>
              ) : (
                <select
                  value=""
                  onChange={(e) => e.target.value && toBot(n, e.target.value)}
                  className="rounded-full border border-line bg-card px-3 py-1 text-[12px] text-fg-2 outline-none hover:bg-hover"
                >
                  <option value="">{tr('Trazer para a memória de um bot…')}</option>
                  {app.bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * Regras e memória: todas as lições aprendidas e as instruções escritas, num lugar só, com busca. Serve para
 * descobrir de onde vem um comportamento ("sigo a orientação registrada…") e editar ou desligar.
 */
export function MemoryView() {
  useLanguage()
  const app = useApp()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [autoNotes, setAutoNotes] = useState<AutoMemoryNote[]>([])
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState(() =>
    app.memoryScope.botId
      ? `bot:${app.memoryScope.botId}`
      : app.memoryScope.specializationId
        ? `specialization:${app.memoryScope.specializationId}`
        : 'all'
  )

  useEffect(() => {
    void window.gbot.memory.autoNotes().then(setAutoNotes)
  }, [])

  useEffect(() => {
    const load = () => void window.gbot.memory.all().then(setLessons)
    load()
    return window.gbot.memory.onChanged(load)
  }, [])

  // Quem entra no recorte: um bot leva junto as especializações que ele usa.
  const inScope = useMemo(() => {
    if (scope === 'all') return undefined
    const [kind, id] = [scope.slice(0, scope.indexOf(':')), scope.slice(scope.indexOf(':') + 1)]
    if (kind === 'specialization') return { bots: new Set<string>(), specializations: new Set([id]), specializationId: id }
    const bot = app.bots.find((b) => b.id === id)
    return { bots: new Set([id]), specializations: new Set(bot?.specializationIds ?? []), specializationId: undefined }
  }, [scope, app.bots])

  const owned = (kind: 'bot' | 'specialization', id: string) =>
    !inScope || (kind === 'bot' ? inScope.bots : inScope.specializations).has(id)

  const found = lessons.filter(
    (l) => owned(l.owner.kind, l.owner.id) && [l.title, l.when, l.steps, l.why].some((t) => matches(t, query))
  )
  const groups = new Map<string, Lesson[]>()
  for (const l of found) {
    const k = `${l.owner.kind}:${l.owner.id}`
    groups.set(k, [...(groups.get(k) ?? []), l])
  }

  // Instruções escritas por você que também podem conter a regra.
  const sources: Source[] = []
  if (query.trim()) {
    for (const b of app.bots) {
      if (!owned('bot', b.id)) continue
      if (matches(b.instructions, query) || matches(b.description, query)) {
        sources.push({
          key: `bot:${b.id}`,
          title: tr('Instruções do bot {0}', b.name),
          icon: <AgentAvatar avatar={b.avatar} size={18} animated={false} />,
          text: matches(b.instructions, query) ? b.instructions : b.description,
          action: tr('Editar bot'),
          open: () => app.editBot(b.id)
        })
      }
    }
    for (const sp of app.specializations) {
      if (!owned('specialization', sp.id)) continue
      if (matches(sp.instructions, query) || matches(sp.description, query)) {
        sources.push({
          key: `specialization:${sp.id}`,
          title: tr('Instruções da especialização {0}', sp.name),
          icon: <GraduationCap size={16} className="text-muted" />,
          text: matches(sp.instructions, query) ? sp.instructions : sp.description,
          action: tr('Editar especialização'),
          open: () => app.editSpecialization(sp.id)
        })
      }
    }
    const projectIds = inScope
      ? new Set(
          [
            ...app.bots.filter((b) => inScope.bots.has(b.id)).map((b) => b.projectId),
            ...app.specializations.filter((sp) => inScope.specializations.has(sp.id)).map((sp) => sp.projectId)
          ].filter(Boolean)
        )
      : undefined
    for (const p of app.projects) {
      if (projectIds && !projectIds.has(p.id)) continue
      if (matches(p.instructions, query)) {
        sources.push({
          key: `project:${p.id}`,
          title: tr('Instruções do projeto {0}', p.name),
          icon: <FolderClosed size={16} color={p.color} />,
          text: p.instructions,
          action: tr('Editar projeto'),
          open: () => app.editProject(p.id)
        })
      }
    }
    // Caixinhas das rotinas: as do bot do recorte, ou as que usam a especialização do recorte.
    for (const f of app.flows) {
      for (const n of f.nodes) {
        if (inScope && !inScope.bots.has(f.botId) && !(inScope.specializationId && n.data.specializationId === inScope.specializationId)) continue
        const text = n.data.message ?? ''
        if (!text || !matches(text, query)) continue
        const label = n.data.label || app.getSpecialization(n.data.specializationId)?.name || tr('caixinha')
        const bot = app.getBot(f.botId)
        sources.push({
          key: `node:${f.id}:${n.id}`,
          title: tr('Mensagem da caixinha "{0}" na rotina {1}', label, bot ? `${bot.name} · ${f.name}` : f.name),
          icon: <Workflow size={16} className="text-muted" />,
          text,
          action: tr('Abrir rotina'),
          open: () => app.openFlow(f.id)
        })
      }
    }
  }

  const notes = autoNotes.filter((n) => [n.name, n.description, n.body].some((t) => matches(t, query)))

  const ownerHeader = (key: string) => {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    if (kind === 'bot') {
      const bot = app.getBot(id)
      return {
        icon: <AgentAvatar avatar={bot?.avatar} size={22} animated={false} />,
        name: bot ? tr('Memória do bot {0}', bot.name) : tr('Memória de um bot excluído'),
        open: bot ? () => app.openBot(bot.id) : undefined
      }
    }
    const sp = app.getSpecialization(id)
    return {
      icon: <GraduationCap size={18} className="text-muted" />,
      name: sp ? tr('Memória da especialização {0}', sp.name) : tr('Memória de uma especialização excluída'),
      open: sp ? () => app.editSpecialization(sp.id) : undefined
    }
  }

  return (
    <div className="mx-auto w-full max-w-[880px] px-[60px] pt-6 pb-12">
      <button
        onClick={() => app.setView('home')}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <ArrowLeft size={14} />{tr(' Início')}</button>
      <p className="text-[12px] font-medium tracking-[0.02em] text-muted">{tr('Sistema')}</p>
      <h1 className="mt-1 text-[36px] leading-tight font-medium tracking-[-0.03em]">{tr('Regras e memória')}</h1>
      <p className="mt-1 text-[15px] text-muted">{tr('Tudo o que os bots seguem: as lições que eles aprenderam sozinhos (deles e das especializações que usam) e as instruções que você escreveu. Viu uma "orientação registrada" numa resposta? Procure um trecho dela aqui para achar, editar ou desligar.')}</p>

      <div className="mt-6 flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('Procure um trecho, ex.: "falta preencher"')}
            className={inputClass}
            style={{ paddingLeft: 36 }}
          />
        </label>
        <div className="w-[260px] shrink-0">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputClass}>
            <option value="all">{tr('Todos os bots e especializações')}</option>
            {app.bots.length > 0 && (
              <optgroup label={tr('Bot (com as especializações dele)')}>
                {app.bots.map((b) => (
                  <option key={b.id} value={`bot:${b.id}`}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            )}
            {app.specializations.length > 0 && (
              <optgroup label={tr('Especialização')}>
                {app.specializations.map((sp) => (
                  <option key={sp.id} value={`specialization:${sp.id}`}>
                    {sp.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      <p className="mt-3 text-[12px] text-muted">
        {found.length} {found.length === 1 ? tr('lição') : tr('lições')}
        {query.trim()
          ? tr(' e {0} {1} com "{2}"', sources.length, sources.length === 1 ? tr('instrução') : tr('instruções'), query.trim())
          : tr(' · digite um trecho para procurar também nas instruções')}
      </p>

      {sources.length > 0 && (
        <Card className="mt-4 p-5">
          <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
            <FileText size={14} />{tr(' Instruções escritas por você')}</p>
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.key} className="rounded-tile border border-line p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex w-5 shrink-0 justify-center">{s.icon}</span>
                  <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{s.title}</p>
                  <button
                    onClick={s.open}
                    className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:bg-hover"
                  >
                    {s.action}
                  </button>
                </div>
                <p className="selectable mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
                  <Highlight text={snippet(s.text, query)} query={query} />
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {[...groups].map(([key, list]) => {
        const h = ownerHeader(key)
        return (
          <Card key={key} className="mt-4 p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex w-6 shrink-0 justify-center">{h.icon}</span>
              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{h.name}</p>
              <span className="text-[12px] text-muted">
                {list.length} {list.length === 1 ? tr('lição') : tr('lições')}
              </span>
              {h.open && (
                <button
                  onClick={h.open}
                  className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:bg-hover"
                >{tr('Abrir')}</button>
              )}
            </div>
            <div className="space-y-2">
              {list.map((l) => (
                <LessonCard key={l.id} lesson={l} query={query} />
              ))}
            </div>
          </Card>
        )
      })}

      {notes.length > 0 && (
        <AutoNotes
          notes={notes}
          query={query}
          onRemoved={(p) => setAutoNotes((ns) => ns.filter((n) => n.path !== p))}
        />
      )}

      {!found.length && !sources.length && !notes.length && (
        <Card className="mt-4 p-8 text-center text-[14px] text-muted">
          {query.trim()
            ? tr('Nada encontrado. Tente um trecho mais curto ou outra palavra da resposta.')
            : tr('Nenhuma lição aprendida ainda neste recorte.')}
        </Card>
      )}
    </div>
  )
}
