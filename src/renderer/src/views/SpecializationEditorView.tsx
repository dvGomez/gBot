import { t as tr, useLanguage } from '@/i18n'
import { useState } from 'react'
import { ArrowLeft, GraduationCap, LoaderCircle, Sparkles, Trash2 } from 'lucide-react'
import type { Specialization } from '@shared/types'
import { AgentAvatar } from '@/components/AgentAvatar'
import { MemoryPanel } from '@/components/MemoryPanel'
import { SpecializationFiles } from '@/components/SpecializationFiles'
import { Button, Card, Field, PageHeader, inputClass } from '@/components/ui'
import { uid } from '@/lib/format'
import { useApp } from '@/state/app'

const EXAMPLE = tr('Exemplo:\nVocê revisa contratos de prestação de serviço.\n- Leia o contrato e liste as cláusulas de risco.\n- Para cada risco, explique em linguagem simples e sugira uma redação alternativa.\n- Seja objetivo e use tópicos.')

/**
 * Criar ou editar uma especialização: nome, descrição e instruções. Editando, mostra também os arquivos de referência,
 * as lições aprendidas e os bots que a usam.
 */
export function SpecializationEditorView() {
  useLanguage()
  const app = useApp()
  const editing = app.selectedSpecialization
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [instructions, setInstructions] = useState(editing?.instructions ?? '')
  const [projectId, setProjectId] = useState(editing ? editing.projectId : app.specializationDraftProjectId)
  const [errors, setErrors] = useState<{ name?: string; instructions?: string }>({})
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const usedBy = editing ? app.bots.filter((b) => b.specializationIds.includes(editing.id)) : []
  const back = () => app.setView('home')

  const suggest = async () => {
    if (!instructions.trim()) {
      setErrors((e) => ({ ...e, instructions: tr('Escreva as instruções primeiro: a sugestão é feita a partir delas.') }))
      return
    }
    setSuggesting(true)
    setSuggestError(undefined)
    try {
      const s = await window.gbot.specializations.suggest(instructions)
      if (s.name) setName(s.name)
      if (s.description) setDescription(s.description)
      setErrors((e) => ({ ...e, name: undefined }))
    } catch {
      setSuggestError(tr('Não consegui sugerir agora. Tente de novo ou escreva o nome.'))
    } finally {
      setSuggesting(false)
    }
  }

  const submit = async () => {
    const next = {
      name: name.trim() ? undefined : tr('Dê um nome à especialização.'),
      instructions: instructions.trim() ? undefined : tr('Escreva o que a especialização ensina a fazer.')
    }
    setErrors(next)
    if (next.name || next.instructions) return
    const now = Date.now()
    const sp: Specialization = {
      id: editing?.id ?? uid(),
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      projectId,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    }
    await app.saveSpecialization(sp)
    // Criando: continua no editor da especialização nova, para adicionar arquivos.
    app.editSpecialization(sp.id)
  }

  return (
    <div className="mx-auto w-full max-w-[920px] px-[60px] pt-6 pb-12">
      <button onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} />{tr(' Voltar')}</button>
      <PageHeader
        eyebrow={tr('Especializações')}
        title={editing ? editing.name : tr('Nova especialização')}
        subtitle={tr('Um conhecimento que os bots usam: o passo a passo, os cuidados e o formato da resposta. Os bots que a recebem seguem isso.')}
      />

      <Card className="mt-8 space-y-6 p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-card bg-sidebar text-fg-2">
            <GraduationCap size={24} strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setErrors((x) => ({ ...x, name: undefined }))
                }}
                maxLength={60}
                placeholder={tr('Nome da especialização (ex.: Consultar pull requests)')}
                aria-label={tr('Nome da especialização')}
                className="selectable min-w-0 flex-1 rounded-tile border border-transparent bg-transparent px-2 py-1 text-[22px] font-medium tracking-[-0.02em] text-fg outline-none placeholder:text-muted hover:border-line focus:border-muted/60"
              />
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting || !app.connected}
                title={tr('Sugere nome e descrição a partir das instruções')}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] text-fg-2 hover:bg-hover disabled:opacity-50"
              >
                {suggesting ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {suggesting ? tr('Pensando…') : tr('Sugerir com IA')}
              </button>
            </div>
            {(errors.name ?? suggestError) && <p className="px-2 text-[12px] text-danger">{errors.name ?? suggestError}</p>}
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={140}
              placeholder={tr('Descrição: o que ela ensina (ex.: Revisa contratos e aponta cláusulas de risco)')}
              aria-label={tr('Descrição da especialização')}
              className="selectable w-full rounded-tile border border-transparent bg-transparent px-2 py-1 text-[14px] text-fg-2 outline-none placeholder:text-muted hover:border-line focus:border-muted/60"
            />
          </div>
        </div>

        <Field
          label={tr('Instruções')}
          hint={tr('O passo a passo, os cuidados e o formato da resposta. Vale para todo bot que usar esta especialização.')}
          error={errors.instructions}
        >
          <textarea
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value)
              setErrors((x) => ({ ...x, instructions: undefined }))
            }}
            rows={10}
            placeholder={tr(EXAMPLE)}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </Field>

        <Field label={tr('Projeto')} hint={tr('Especializações soltas podem ser usadas em qualquer lugar; as de um projeto, só nele.')}>
          <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || undefined)} className={inputClass}>
            <option value="">{tr('Nenhum (especialização solta)')}</option>
            {app.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center justify-between border-t border-line pt-5">
          {editing ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-[13px] text-fg-2">
                {tr('Excluir a especialização? Os bots que a usam deixam de usá-la.')}
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{tr('Não')}</Button>
                <Button onClick={() => void app.removeSpecialization(editing.id)} className="border-danger/40 text-danger">{tr('Excluir')}</Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
                <Trash2 size={14} />{tr(' Excluir especialização')}</Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={back}>{tr('Cancelar')}</Button>
            <Button variant="primary" onClick={() => void submit()}>
              {editing ? tr('Salvar alterações') : tr('Criar especialização')}
            </Button>
          </div>
        </div>
      </Card>

      {editing && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <Card className="p-5">
              <p className="pb-2 text-[13px] font-medium text-muted">{tr('Bots que usam')}</p>
              {usedBy.length ? (
                <div className="flex flex-wrap gap-2">
                  {usedBy.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => app.openBot(b.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[13px] hover:bg-hover"
                    >
                      <AgentAvatar avatar={b.avatar} size={16} animated={false} />
                      {b.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted">{tr('Nenhum bot usa esta especialização ainda. Adicione na página de um bot, em Editar.')}</p>
              )}
            </Card>
            <Card className="p-5">
              <MemoryPanel owner={{ kind: 'specialization', id: editing.id }} />
            </Card>
          </div>
          <Card className="self-start p-5">
            <SpecializationFiles key={editing.id} specializationId={editing.id} name={editing.name} />
          </Card>
        </div>
      )}
    </div>
  )
}
